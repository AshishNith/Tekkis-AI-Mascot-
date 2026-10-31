import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { basename, extname, join, normalize } from "node:path";
import { config } from "./config.js";
import { createLiveToken, LANGUAGES, VOICES } from "./live-token.js";

// Each token opens a paid voice session, so cap how many one client can mint.
const TOKEN_LIMIT = 20;
const TOKEN_WINDOW_MS = 60 * 60_000;
const tokenHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (tokenHits.get(ip) ?? []).filter((t) => now - t < TOKEN_WINDOW_MS);
  if (hits.length >= TOKEN_LIMIT) {
    tokenHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  tokenHits.set(ip, hits);
  return false;
}

/** The caller's address. Behind a proxy every request comes from the proxy, so use the first forwarded hop. */
function clientIp(req: IncomingMessage): string {
  if (config.trustProxy) {
    const fwd = req.headers["x-forwarded-for"];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin requests and curl
  if (config.allowedOrigins.includes(origin)) return true;
  // With no allow-list (local dev) the Chrome extension's pages may also ask for tokens.
  return config.allowedOrigins.length === 0 && /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|chrome-extension:\/\/[a-p]{32})$/.test(origin);
}

/** Reads a small JSON request body; anything too big or malformed counts as empty. */
function readJson(req: IncomingMessage, limit = 16_000): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        resolve({});
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        resolve(v && typeof v === "object" && !Array.isArray(v) ? v : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown, origin?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  res.writeHead(status, headers).end(JSON.stringify(body));
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  let file = normalize(join(config.webDist, urlPath));
  if (!file.startsWith(config.webDist)) return res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(config.webDist, "index.html");
  if (!existsSync(file)) return res.writeHead(404).end("Not found — run `npm run build` first.");
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
    "Content-Length": String(statSync(file).size),
    // Hashed build files never change; everything else is revalidated.
    "Cache-Control": urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  };
  if (urlPath.startsWith("/downloads/")) {
    headers["Content-Disposition"] = `attachment; filename="${basename(file)}"`;
    headers["Access-Control-Allow-Origin"] = "*"; // the Vercel copy of the site links here
  }
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const path = new URL(req.url ?? "/", "http://x").pathname;

  if (path.startsWith("/api/")) {
    if (!originAllowed(origin)) return sendJson(res, 403, { error: "Origin not allowed" });

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin ?? "*",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    if (path === "/api/health" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { ok: true, voiceConfigured: Boolean(config.geminiApiKey), model: config.liveModel, voices: VOICES, languages: LANGUAGES },
        origin,
      );
    }

    if (path === "/api/live-token" && req.method === "POST") {
      const ip = clientIp(req);
      if (rateLimited(ip)) return sendJson(res, 429, { error: "Too many voice sessions, try again later." }, origin);
      try {
        return sendJson(res, 200, await createLiveToken(await readJson(req)), origin);
      } catch (err) {
        console.error("[live-token]", err);
        const message = err instanceof Error ? err.message : "Could not create voice token";
        return sendJson(res, 500, { error: message }, origin);
      }
    }

    return sendJson(res, 404, { error: "Not found" }, origin);
  }

  serveStatic(req, res);
});

server.listen(config.port, () => {
  console.log(`Tekkie server on http://localhost:${config.port}${config.publicUrl ? ` (public: ${config.publicUrl})` : ""}`);
  console.log(config.allowedOrigins.length ? `Voice tokens allowed for: ${config.allowedOrigins.join(", ")}` : "No ALLOWED_ORIGINS set: allowing localhost and any extension (dev mode).");
  if (!config.geminiApiKey) console.warn("GEMINI_API_KEY is not set — voice will not work until you add it to .env");
});

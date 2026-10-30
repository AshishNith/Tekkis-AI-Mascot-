import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { config } from "./config.js";
import { createLiveToken } from "./live-token.js";

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

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin requests and curl
  if (config.allowedOrigins.includes(origin)) return true;
  return config.allowedOrigins.length === 0 && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
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
  ".json": "application/json",
  ".glb": "model/gltf-binary",
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  let file = normalize(join(config.webDist, urlPath));
  if (!file.startsWith(config.webDist)) return res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(config.webDist, "index.html");
  if (!existsSync(file)) return res.writeHead(404).end("Not found — run `npm run build` first.");
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
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
      return sendJson(res, 200, { ok: true, voiceConfigured: Boolean(config.geminiApiKey), model: config.liveModel }, origin);
    }

    if (path === "/api/live-token" && req.method === "POST") {
      const ip = req.socket.remoteAddress ?? "unknown";
      if (rateLimited(ip)) return sendJson(res, 429, { error: "Too many voice sessions, try again later." }, origin);
      try {
        return sendJson(res, 200, await createLiveToken(), origin);
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
  console.log(`Tekkie server on http://localhost:${config.port}`);
  if (!config.geminiApiKey) console.warn("GEMINI_API_KEY is not set — voice will not work until you add it to .env");
});

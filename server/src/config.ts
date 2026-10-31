import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envFile = resolve(repoRoot, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** The Chrome extension's fixed ID (its manifest carries a public key), so the server can allow exactly it. */
const extensionIdFile = resolve(repoRoot, "apps/extension/EXTENSION_ID");
const extensionId = existsSync(extensionIdFile) ? readFileSync(extensionIdFile, "utf8").trim() : "";

/** Where this server is reachable from the internet (Render sets RENDER_EXTERNAL_URL itself). */
const publicUrl = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");

const listed = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

export const config = {
  repoRoot,
  port: Number(process.env.PORT ?? 8787),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  liveModel: process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
  voice: process.env.GEMINI_VOICE || "Puck",
  publicUrl,
  extensionId,
  /**
   * Origins allowed to mint voice tokens. When a list is configured, this server's own public URL and the
   * Tekkie extension are always added to it, so a deploy only has to list the extra sites (e.g. a Vercel copy).
   */
  allowedOrigins: listed.length
    ? [...new Set([...listed, ...(publicUrl ? [publicUrl] : []), ...(extensionId ? [`chrome-extension://${extensionId}`] : [])])]
    : [],
  /** Behind a hosting proxy (Render, Fly, a load balancer) the client's address is in X-Forwarded-For. */
  trustProxy: process.env.TRUST_PROXY === "1" || Boolean(process.env.RENDER),
  webDist: resolve(repoRoot, "apps/web/dist"),
};

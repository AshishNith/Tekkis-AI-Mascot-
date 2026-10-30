import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envFile = resolve(repoRoot, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const config = {
  repoRoot,
  port: Number(process.env.PORT ?? 8787),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  liveModel: process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview",
  voice: process.env.GEMINI_VOICE || "Puck",
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  webDist: resolve(repoRoot, "apps/web/dist"),
};

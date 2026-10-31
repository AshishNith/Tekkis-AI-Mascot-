import type { VoiceConnection } from "../../web/src/voice/LiveVoiceSession";

export interface AppSettings {
  mode: "apiKey" | "server";
  apiKey: string;
  model: string;
  voice: string;
  serverUrl: string;
  /** Allow talking over Tekkie (needs headphones; otherwise Tekkie hears itself). */
  interrupt: boolean;
  skin: string;
}

const KEY = "tekkie:settings:v2";
const OLD_KEY = "tekkie:settings:v1";

/** Public Tekkie server baked into the app. Override at build time with VITE_TEKKIE_SERVER_URL. */
export const DEFAULT_SERVER_URL = import.meta.env.VITE_TEKKIE_SERVER_URL || "https://srv1542348.hstgr.cloud";

export const DEFAULTS: AppSettings = {
  mode: "server",
  apiKey: "",
  model: "gemini-3.8-live",
  voice: "Puck",
  serverUrl: DEFAULT_SERVER_URL,
  interrupt: false,
  skin: "classic",
};

export function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
    // Earlier builds defaulted to an on-phone key; keep the key and skin but start on the server.
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? "{}");
    return { ...DEFAULTS, apiKey: old.apiKey ?? "", skin: old.skin ?? DEFAULTS.skin, voice: old.voice ?? DEFAULTS.voice };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings last until the app closes */
  }
}

export function isConfigured(s: AppSettings) {
  return s.mode === "apiKey" ? Boolean(s.apiKey.trim()) : Boolean(s.serverUrl.trim());
}

export function toConnection(s: AppSettings): VoiceConnection {
  return s.mode === "apiKey"
    ? { kind: "apiKey", apiKey: s.apiKey.trim(), model: s.model.trim() || DEFAULTS.model, voice: s.voice }
    : { kind: "server", apiBase: s.serverUrl.trim().replace(/\/+$/, "") };
}

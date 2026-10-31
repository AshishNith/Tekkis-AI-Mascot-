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

const KEY = "tekkie:settings:v1";

export const DEFAULTS: AppSettings = {
  mode: "apiKey",
  apiKey: "",
  model: "gemini-3.8-live",
  voice: "Puck",
  serverUrl: "",
  interrupt: false,
  skin: "classic",
};

export function loadSettings(): AppSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
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

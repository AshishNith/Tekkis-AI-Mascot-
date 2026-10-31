import { GoogleGenAI, Modality } from "@google/genai";
import { config } from "./config.js";
import { buildPersona } from "./persona.js";

/** Prebuilt Gemini voices the browser may pick from. */
export const VOICES = ["Puck", "Kore", "Aoede", "Charon", "Fenrir", "Leda", "Orus", "Zephyr"];

/** Reply languages the browser may pick from (empty = match the user). */
export const LANGUAGES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ar: "Arabic",
  af: "Afrikaans",
  zu: "Zulu",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  ur: "Urdu",
  ja: "Japanese",
  zh: "Chinese",
};

export interface TokenRequest {
  voice?: unknown;
  language?: unknown;
  tutor?: unknown;
  memory?: unknown;
}

const ai = config.geminiApiKey
  ? new GoogleGenAI({ apiKey: config.geminiApiKey, httpOptions: { apiVersion: "v1alpha" } })
  : null;

export interface LiveTokenResponse {
  token: string;
  model: string;
  expiresAt: string;
}

/**
 * Mints a single-use ephemeral token for the Gemini Live API. The browser connects to Gemini
 * directly with it, so audio never round-trips through our server, but the real API key stays
 * here. Model, voice and persona are locked into the token.
 */
export async function createLiveToken(req: TokenRequest = {}): Promise<LiveTokenResponse> {
  if (!ai) throw new Error("GEMINI_API_KEY is not set on the server");

  // Only accept known values, and keep memory small: the browser asks, the server decides.
  const voice = typeof req.voice === "string" && VOICES.includes(req.voice) ? req.voice : config.voice;
  const language = typeof req.language === "string" ? LANGUAGES[req.language] : undefined;
  const memory = Array.isArray(req.memory)
    ? req.memory.filter((m): m is string => typeof m === "string").map((m) => m.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, 40)
    : [];

  const now = Date.now();
  const expiresAt = new Date(now + 30 * 60_000).toISOString();
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: expiresAt,
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      liveConnectConstraints: {
        model: config.liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: buildPersona({ language, tutor: req.tutor === true, memory }),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      },
      lockAdditionalFields: [],
    },
  });

  if (!token.name) throw new Error("Gemini returned an empty token");
  return { token: token.name, model: config.liveModel, expiresAt };
}

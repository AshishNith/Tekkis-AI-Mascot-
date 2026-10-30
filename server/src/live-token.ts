import { GoogleGenAI, Modality } from "@google/genai";
import { config } from "./config.js";
import { TEKKIE_PERSONA } from "./persona.js";

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
export async function createLiveToken(): Promise<LiveTokenResponse> {
  if (!ai) throw new Error("GEMINI_API_KEY is not set on the server");

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
          systemInstruction: TEKKIE_PERSONA,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } } },
        },
      },
      lockAdditionalFields: [],
    },
  });

  if (!token.name) throw new Error("Gemini returned an empty token");
  return { token: token.name, model: config.liveModel, expiresAt };
}

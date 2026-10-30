import type { FunctionCall, FunctionDeclaration, LiveServerMessage, Session } from "@google/genai";
import { MicCapture, PcmPlayer, int16ToBase64 } from "./audio";

export type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

export interface VoiceEvents {
  state: (state: VoiceState) => void;
  /** Live captions. `final` marks the end of a caption line. */
  caption: (who: "user" | "tekkie", text: string, final: boolean) => void;
  error: (message: string) => void;
}

/** What the widget needs from a voice backend: the in-page session below, or the extension's remote one. */
export interface VoiceController {
  on<K extends keyof VoiceEvents>(event: K, fn: VoiceEvents[K]): void;
  readonly active: boolean;
  readonly outputLevel: number;
  readonly inputLevel: number;
  start(): Promise<void>;
  stop(): void;
  sendText(text: string): void;
}

/** A tool result that also shows the model a picture (e.g. a screenshot). */
export interface ToolResultWithImage {
  output: unknown;
  imageJpeg: string;
}

/** Lets the model call functions (e.g. browser actions) during a conversation. */
export interface VoiceTools {
  declarations: FunctionDeclaration[];
  handle(name: string, args: Record<string, unknown>): Promise<unknown>;
}

interface TokenResponse {
  token: string;
  model: string;
}

/**
 * One realtime voice conversation with Gemini Live. The browser streams mic audio straight to
 * Gemini using a short-lived token from our server, and plays the spoken reply as it arrives.
 */
export class LiveVoiceSession implements VoiceController {
  private session?: Session;
  private mic?: MicCapture;
  private player = new PcmPlayer();
  private state: VoiceState = "idle";
  private listeners: { [K in keyof VoiceEvents]: VoiceEvents[K][] } = { state: [], caption: [], error: [] };
  private userLine = "";
  private tekkieLine = "";
  private turnComplete = false;
  private micLevel = 0;

  constructor(private apiBase = "", private tools?: VoiceTools) {}

  on<K extends keyof VoiceEvents>(event: K, fn: VoiceEvents[K]) {
    this.listeners[event].push(fn);
  }

  private emit<K extends keyof VoiceEvents>(event: K, ...args: Parameters<VoiceEvents[K]>) {
    for (const fn of this.listeners[event]) (fn as (...a: Parameters<VoiceEvents[K]>) => void)(...args);
  }

  private setState(state: VoiceState) {
    if (state === this.state) return;
    this.state = state;
    this.emit("state", state);
  }

  get current() {
    return this.state;
  }

  get active() {
    return this.state !== "idle" && this.state !== "error";
  }

  /** Loudness for animation: Tekkie's voice while speaking, otherwise the user's mic. */
  get outputLevel() {
    return this.player.level();
  }
  get inputLevel() {
    return this.micLevel;
  }

  async start() {
    if (this.active) return;
    this.setState("connecting");
    try {
      await this.player.resume();
      // The SDK is large, so it loads only when a conversation starts.
      const [{ token, model }, { GoogleGenAI, Modality }] = await Promise.all([this.fetchToken(), import("@google/genai")]);
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });

      this.session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          // Lets a conversation run past the default audio session limit.
          contextWindowCompression: { slidingWindow: {} },
          ...(this.tools ? { tools: [{ functionDeclarations: this.tools.declarations }] } : {}),
        },
        callbacks: {
          onmessage: (msg) => this.handleMessage(msg),
          onerror: (e) => this.fail(e.message || "Voice connection error"),
          onclose: (e) => {
            if (this.active) {
              if (e.code === 1000) this.stop();
              else this.fail(e.reason || `Voice connection closed (${e.code})`);
            }
          },
        },
      });

      this.mic = new MicCapture((pcm, level) => {
        this.micLevel = level;
        this.session?.sendRealtimeInput({ audio: { data: int16ToBase64(pcm), mimeType: "audio/pcm;rate=16000" } });
      });
      await this.mic.start();
      this.setState("listening");
    } catch (err) {
      this.fail(describeError(err));
    }
  }

  /** Type instead of talking. */
  sendText(text: string) {
    if (!this.session || !text.trim()) return;
    this.flushUserLine();
    this.emit("caption", "user", text, true);
    this.session.sendRealtimeInput({ text });
    this.setState("thinking");
  }

  stop() {
    this.mic?.stop();
    this.mic = undefined;
    this.player.clear();
    const session = this.session;
    this.session = undefined;
    this.micLevel = 0;
    this.setState("idle");
    session?.close();
  }

  private fail(message: string) {
    this.stop();
    this.setState("error");
    this.emit("error", message);
  }

  private async fetchToken(): Promise<TokenResponse> {
    const res = await fetch(`${this.apiBase}/api/live-token`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Token request failed (${res.status})`);
    return body as TokenResponse;
  }

  private handleMessage(msg: LiveServerMessage) {
    const content = msg.serverContent;
    if (msg.toolCall?.functionCalls?.length) void this.runTools(msg.toolCall.functionCalls);
    if (msg.goAway) this.emit("error", "Session is about to end — tap Tekkie to start a new one.");
    if (!content) return;

    if (content.interrupted) {
      // The user talked over Tekkie: drop the rest of the reply right away.
      this.player.clear();
      this.flushTekkieLine();
      this.setState("listening");
    }

    if (content.inputTranscription?.text) {
      this.userLine += content.inputTranscription.text;
      this.emit("caption", "user", this.userLine, false);
      if (this.state === "listening") this.setState("thinking");
    }

    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) {
        this.flushUserLine();
        this.player.enqueue(part.inlineData.data);
        this.turnComplete = false;
        this.setState("speaking");
      }
    }

    if (content.outputTranscription?.text) {
      this.tekkieLine += content.outputTranscription.text;
      this.emit("caption", "tekkie", this.tekkieLine, false);
    }

    if (content.turnComplete) {
      this.turnComplete = true;
      this.flushUserLine();
      this.waitForPlaybackEnd();
    }
  }

  private async runTools(calls: FunctionCall[]) {
    if (!this.tools) return;
    this.setState("thinking");
    const functionResponses = [];
    for (const call of calls) {
      let response: Record<string, unknown>;
      let parts: { inlineData: { mimeType: string; data: string } }[] | undefined;
      try {
        const result = await this.tools.handle(call.name ?? "", (call.args ?? {}) as Record<string, unknown>);
        if (result && typeof result === "object" && "imageJpeg" in result) {
          const withImage = result as ToolResultWithImage;
          response = { output: withImage.output };
          parts = [{ inlineData: { mimeType: "image/jpeg", data: withImage.imageJpeg } }];
        } else {
          response = { output: result };
        }
      } catch (err) {
        response = { error: err instanceof Error ? err.message : String(err) };
      }
      functionResponses.push({ id: call.id, name: call.name, response, ...(parts ? { parts } : {}) });
    }
    this.session?.sendToolResponse({ functionResponses });
  }

  private waitForPlaybackEnd() {
    const check = () => {
      if (!this.active || !this.turnComplete) return;
      if (this.player.isPlaying) return void setTimeout(check, 100);
      this.flushTekkieLine();
      this.setState("listening");
    };
    check();
  }

  private flushUserLine() {
    if (this.userLine) this.emit("caption", "user", this.userLine, true);
    this.userLine = "";
  }

  private flushTekkieLine() {
    if (this.tekkieLine) this.emit("caption", "tekkie", this.tekkieLine, true);
    this.tekkieLine = "";
  }
}

function describeError(err: unknown): string {
  if (err instanceof DOMException && err.name === "NotAllowedError") {
    return "Microphone access was blocked. Allow the mic in your browser to talk to Tekkie.";
  }
  if (err instanceof DOMException && err.name === "NotFoundError") return "No microphone found.";
  return err instanceof Error ? err.message : String(err);
}

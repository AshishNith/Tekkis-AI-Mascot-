import type { VoiceController, VoiceEvents, VoiceState } from "../../web/src/voice/LiveVoiceSession";
import { PORT_NAME, type ToUi, type ToVoice } from "./protocol";

const REJOIN_MS = 1500;

/**
 * The widget's view of the voice conversation, which actually runs in the extension's offscreen
 * document. Every tab stays connected from the moment it loads, so whatever Tekkie says, in whichever
 * tab the chat was started, every tab shows it (captions, mouth, state).
 */
export class RemoteVoiceSession implements VoiceController {
  private port?: chrome.runtime.Port;
  private state: VoiceState = "idle";
  private listeners: { [K in keyof VoiceEvents]: VoiceEvents[K][] } = { state: [], caption: [], error: [] };
  private out = 0;
  private mic = 0;
  private joining = false;
  private joinPromise?: Promise<boolean>;
  private rejoinTimer = 0;

  /** Resolves to true if a conversation was already running (another tab, or before a page change) and we joined it. */
  readonly restored: Promise<boolean>;

  constructor() {
    this.restored = this.join();
  }

  on<K extends keyof VoiceEvents>(event: K, fn: VoiceEvents[K]) {
    this.listeners[event].push(fn);
  }

  private emit<K extends keyof VoiceEvents>(event: K, ...args: Parameters<VoiceEvents[K]>) {
    for (const fn of this.listeners[event]) (fn as (...a: Parameters<VoiceEvents[K]>) => void)(...args);
  }

  get active() {
    return this.state !== "idle" && this.state !== "error";
  }
  get outputLevel() {
    return this.out;
  }
  get inputLevel() {
    return this.mic;
  }

  private connect() {
    if (this.port) return;
    const port = chrome.runtime.connect({ name: PORT_NAME });
    this.port = port;
    port.onMessage.addListener((msg: ToUi) => {
      if (msg.type === "state") {
        this.state = msg.state;
        if (msg.state === "idle") this.out = this.mic = 0;
        this.emit("state", msg.state);
      } else if (msg.type === "caption") this.emit("caption", msg.who, msg.text, msg.final);
      else if (msg.type === "error") this.emit("error", msg.message);
      else if (msg.type === "levels") {
        this.out = msg.out;
        this.mic = msg.in;
      }
    });
    port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      this.port = undefined;
      if (this.joining) return;
      // The voice engine went away (it was closed or restarted): the chat is over, and we reconnect.
      if (this.active) {
        this.state = "idle";
        this.out = this.mic = 0;
        this.emit("state", "idle");
      }
      this.scheduleRejoin();
    });
  }

  private scheduleRejoin() {
    if (this.rejoinTimer || !chrome.runtime?.id) return;
    this.rejoinTimer = window.setTimeout(() => {
      this.rejoinTimer = 0;
      void this.join();
    }, REJOIN_MS);
  }

  /** Makes sure the voice engine exists and this tab is plugged into it. */
  private join(): Promise<boolean> {
    this.joinPromise ??= this.doJoin().finally(() => {
      this.joinPromise = undefined;
    });
    return this.joinPromise;
  }

  private async doJoin(): Promise<boolean> {
    this.joining = true;
    try {
      await chrome.runtime.sendMessage({ type: "tekkie:offscreen", create: true });
      await this.connectWhenReady();
      await new Promise((r) => setTimeout(r, 150)); // let the state snapshot arrive
      return this.active;
    } catch {
      return false;
    } finally {
      this.joining = false;
      if (!this.port) this.scheduleRejoin();
    }
  }

  /** The voice engine may still be booting right after it is created: retry until it answers. */
  private async connectWhenReady() {
    for (let attempt = 0; attempt < 20; attempt++) {
      this.connect();
      const port = this.port!;
      const alive = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(true), 250);
        port.onDisconnect.addListener(() => {
          clearTimeout(timer);
          resolve(false);
        });
      });
      if (alive && this.port === port) return;
      this.port = undefined;
    }
    throw new Error("Tekkie's voice engine didn't start. Try reloading the extension.");
  }

  private async send(msg: ToVoice) {
    if (!this.port) await this.join();
    if (!this.port) throw new Error("Tekkie's voice engine isn't running. Try reloading the extension.");
    this.port.postMessage(msg);
  }

  async start() {
    if (this.active) return;
    this.emit("state", "connecting");
    try {
      await this.send({ type: "start" });
      this.state = "connecting";
    } catch (err) {
      this.state = "error";
      this.emit("state", "error");
      this.emit("error", err instanceof Error ? err.message : String(err));
    }
  }

  stop() {
    void this.send({ type: "stop" }).catch(() => {});
  }

  sendText(text: string) {
    void this.send({ type: "text", text }).catch(() => {});
  }
}

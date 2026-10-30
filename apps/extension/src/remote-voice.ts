import type { VoiceController, VoiceEvents, VoiceState } from "../../web/src/voice/LiveVoiceSession";
import { PORT_NAME, type ToUi, type ToVoice } from "./protocol";

/** The widget's view of the voice conversation, which actually runs in the extension's offscreen document. */
export class RemoteVoiceSession implements VoiceController {
  private port?: chrome.runtime.Port;
  private state: VoiceState = "idle";
  private listeners: { [K in keyof VoiceEvents]: VoiceEvents[K][] } = { state: [], caption: [], error: [] };
  private out = 0;
  private mic = 0;

  /** Resolves to true if a conversation was already running (e.g. the page just changed) and we re-joined it. */
  readonly restored: Promise<boolean>;

  constructor() {
    // After a page navigation the conversation may still be running: pick it back up.
    this.restored = chrome.runtime
      .sendMessage({ type: "tekkie:offscreen", create: false })
      .then(async (exists: boolean) => {
        if (!exists) return false;
        this.connect();
        await new Promise((r) => setTimeout(r, 250)); // let the state snapshot arrive
        return this.active;
      })
      .catch(() => false);
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
      this.port = undefined;
    });
  }

  private send(msg: ToVoice) {
    this.connect();
    this.port!.postMessage(msg);
  }

  /** The offscreen document may still be booting right after it is created: retry until it answers. */
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

  async start() {
    if (this.active) return;
    this.emit("state", "connecting");
    try {
      await chrome.runtime.sendMessage({ type: "tekkie:offscreen", create: true });
      await this.connectWhenReady();
    } catch (err) {
      this.state = "error";
      this.emit("state", "error");
      this.emit("error", err instanceof Error ? err.message : String(err));
      return;
    }
    this.state = "connecting";
    this.send({ type: "start" });
  }

  stop() {
    this.send({ type: "stop" });
  }

  sendText(text: string) {
    this.send({ type: "text", text });
  }
}

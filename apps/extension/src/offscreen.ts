// The one place the voice conversation lives. Page widgets are just remote controls for it, so the
// conversation keeps going while Tekkie navigates, and the microphone is granted once for the extension.
import { LiveVoiceSession, type HistoryLine, type TaskPlan, type VoiceState } from "../../web/src/voice/LiveVoiceSession";
import { BROWSER_TOOLS, COMPANION_TOOLS } from "./control/tools";
import type { Settings } from "./settings";
import { PORT_NAME, type ToUi, type ToVoice } from "./protocol";

const ports = new Set<chrome.runtime.Port>();
let session: LiveVoiceSession | undefined;
let state: VoiceState = "idle";
let pendingText: string[] = []; // typed before the conversation finished connecting
let lastCaption: Extract<ToUi, { type: "caption" }> | undefined;
let history: HistoryLine[] = [];
let plan: TaskPlan | null = null;

function broadcast(msg: ToUi) {
  for (const port of ports) port.postMessage(msg);
}

function setPlan(next: TaskPlan | null) {
  plan = next;
  broadcast({ type: "plan", plan });
}

/** Tools that only change what Tekkie shows (feelings, the plan checklist) are handled right here. */
function runLocalTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "emote":
      broadcast({ type: "emote", kind: String(args.feeling ?? "") });
      return { shown: true };
    case "show_plan": {
      const steps = Array.isArray(args.steps) ? args.steps.map((s) => String(s).slice(0, 120)).slice(0, 10) : [];
      if (!steps.length) throw new Error("A plan needs at least one step.");
      setPlan({ title: args.title ? String(args.title).slice(0, 80) : undefined, steps: steps.map((text) => ({ text, status: "todo" })) });
      return { shown: true, steps: steps.length };
    }
    case "update_plan": {
      const step = plan?.steps[Number(args.step) - 1];
      if (!plan || !step) throw new Error("There's no such step. Call show_plan first.");
      const status = String(args.status);
      step.status = status === "done" || status === "failed" ? status : "doing";
      setPlan({ ...plan, steps: [...plan.steps] });
      return { updated: true };
    }
    case "clear_plan":
      setPlan(null);
      return { cleared: true };
  }
  return undefined;
}
const LOCAL_TOOLS = new Set(["emote", "show_plan", "update_plan", "clear_plan"]);

async function callTool(name: string, args: Record<string, unknown>) {
  if (LOCAL_TOOLS.has(name)) return runLocalTool(name, args);
  if (name === "look_at_screen") {
    const shot = (await chrome.runtime.sendMessage({ type: "tekkie:screenshot" })) as { ok: boolean; image?: string; error?: string };
    if (!shot?.ok || !shot.image) throw new Error(shot?.error ?? "I couldn't capture the screen.");
    return { output: "This is a screenshot of the user's current screen. Describe or answer from it.", imageJpeg: shot.image };
  }
  const reply = (await chrome.runtime.sendMessage({ type: "tekkie:tool", name, args })) as { ok: boolean; output?: unknown; error?: string };
  if (!reply?.ok) throw new Error(reply?.error ?? "The browser action failed.");
  return reply.output;
}

async function start() {
  if (session?.active) return;
  stopWakeWord();
  // Offscreen documents can't use chrome.storage, so the background worker reads the settings for us.
  const settings = (await chrome.runtime.sendMessage({ type: "tekkie:settings" })) as Settings & { memory: string[]; chatHistory: HistoryLine[] };
  // Pick up the conversation from before (this engine may have restarted) so Tekkie remembers it.
  if (!history.length && settings.chatHistory?.length) history = settings.chatHistory;
  const recent = history.slice(-16).map((l) => ({ who: l.who, text: l.text.slice(0, 300) }));
  const declarations = [...COMPANION_TOOLS, ...(settings.browserControl ? BROWSER_TOOLS : [])];
  const next = new LiveVoiceSession(
    settings.serverUrl.replace(/\/+$/, ""),
    { declarations, handle: callTool },
    {
      voice: settings.voiceName || undefined,
      language: settings.language || undefined,
      tutor: settings.tutor,
      memory: settings.memory,
      recent,
    },
  );
  next.on("state", (s) => {
    state = s;
    if (s === "listening" && pendingText.length) {
      for (const text of pendingText) next.sendText(text);
      pendingText = [];
    }
    if (s === "idle") {
      lastCaption = undefined;
      if (plan) setPlan(null);
      void chrome.runtime.sendMessage({ type: "tekkie:release" }); // let go of the page's debugger bar
      void restartWakeWord();
    }
    broadcast({ type: "state", state: s });
  });
  next.on("caption", (who, text, final) => {
    if (who === "tekkie") lastCaption = { type: "caption", who, text, final };
    if (final && text.trim()) {
      history.push({ who, text, at: Date.now() });
      if (history.length > 200) history = history.slice(-200);
      void chrome.runtime.sendMessage({ type: "tekkie:history-save", lines: history.slice(-60) });
    }
    broadcast({ type: "caption", who, text, final });
  });
  next.on("error", (message) => broadcast({ type: "error", message }));
  session = next;
  await next.start();
}

function startSafely() {
  start().catch((err: unknown) => {
    state = "idle";
    broadcast({ type: "error", message: err instanceof Error ? err.message : String(err) });
    broadcast({ type: "state", state: "idle" });
  });
}

function sendText(text: string) {
  if (session?.active && state !== "connecting") session.sendText(text);
  else {
    pendingText.push(text);
    if (!session?.active) startSafely();
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME || port.sender?.id !== chrome.runtime.id) return;
  ports.add(port);
  port.postMessage({ type: "state", state } satisfies ToUi);
  if (history.length) port.postMessage({ type: "history", lines: history } satisfies ToUi);
  if (plan) port.postMessage({ type: "plan", plan } satisfies ToUi);
  if (lastCaption && state !== "idle") port.postMessage(lastCaption);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener((msg: ToVoice) => {
    if (msg.type === "start") startSafely();
    else if (msg.type === "stop") session?.stop();
    else if (msg.type === "text") sendText(msg.text);
    else if (msg.type === "mute") session?.setMicMuted(msg.muted);
  });
});

// Requests from the background worker: right-click "Ask Tekkie", keyboard shortcut, wake word setting.
chrome.runtime.onMessage.addListener((msg: { type?: string; text?: string; on?: boolean }, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg.type === "tekkie:ask" && msg.text) sendText(msg.text);
  else if (msg.type === "tekkie:toggle-talk") {
    if (session?.active) session.stop();
    else startSafely();
  } else if (msg.type === "tekkie:wake-word") {
    wakeWordOn = msg.on === true;
    void restartWakeWord();
  }
});

// Mouth and mic levels drive Tekkie's lip sync in whichever tab you're looking at.
setInterval(() => {
  if (session && ports.size && session.active) {
    broadcast({ type: "levels", out: session.outputLevel, in: session.inputLevel, wide: session.outputShape });
  }
}, 50);

// --- Wake word: "Hey Tekkie" starts a conversation. ------------------------------------------
// Uses Chrome's built-in speech recognition while no conversation is running, and only reacts to
// the name; everything else it hears is ignored.

interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
const speechGlobals = globalThis as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
const RecognizerCtor = speechGlobals.SpeechRecognition ?? speechGlobals.webkitSpeechRecognition;
const WAKE = /\b(tekkie|techie|tekky|teki|taki|tacky|techy)\b/i;
let wakeWordOn = false;
let recognizer: Recognizer | undefined;
let wakeBackoff = 1000;

function stopWakeWord() {
  const r = recognizer;
  recognizer = undefined;
  if (r) {
    r.onend = null;
    r.stop();
  }
}

async function restartWakeWord() {
  stopWakeWord();
  if (!wakeWordOn || !RecognizerCtor || session?.active) return;
  const r = new RecognizerCtor();
  r.continuous = true;
  r.interimResults = true;
  r.lang = "en-US";
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (WAKE.test(e.results[i][0].transcript)) {
        wakeBackoff = 1000;
        stopWakeWord();
        startSafely();
        return;
      }
    }
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") wakeWordOn = false; // no permission: stop trying
  };
  r.onend = () => {
    // Chrome ends recognition every so often; keep listening, backing off if it keeps failing.
    if (recognizer !== r) return;
    recognizer = undefined;
    setTimeout(() => void restartWakeWord(), wakeBackoff);
    wakeBackoff = Math.min(wakeBackoff * 2, 30_000);
  };
  recognizer = r;
  try {
    r.start();
  } catch {
    recognizer = undefined;
  }
}

void chrome.runtime.sendMessage({ type: "tekkie:settings" }).then((s: Settings) => {
  wakeWordOn = s?.wakeWord === true;
  void restartWakeWord();
});

// The one place the voice conversation lives. Page widgets are just remote controls for it, so the
// conversation keeps going while Tekkie navigates, and the microphone is granted once for the extension.
import { LiveVoiceSession, type VoiceState } from "../../web/src/voice/LiveVoiceSession";
import { BROWSER_TOOLS } from "./control/tools";
import type { Settings } from "./settings";
import { PORT_NAME, type ToUi, type ToVoice } from "./protocol";

const ports = new Set<chrome.runtime.Port>();
let session: LiveVoiceSession | undefined;
let state: VoiceState = "idle";

function broadcast(msg: ToUi) {
  for (const port of ports) port.postMessage(msg);
}

async function callBrowserTool(name: string, args: Record<string, unknown>) {
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
  // Offscreen documents can't use chrome.storage, so the background worker reads the settings for us.
  const settings = (await chrome.runtime.sendMessage({ type: "tekkie:settings" })) as Settings;
  const next = new LiveVoiceSession(
    settings.serverUrl.replace(/\/+$/, ""),
    settings.browserControl ? { declarations: BROWSER_TOOLS, handle: callBrowserTool } : undefined,
  );
  next.on("state", (s) => {
    state = s;
    broadcast({ type: "state", state: s });
  });
  next.on("caption", (who, text, final) => broadcast({ type: "caption", who, text, final }));
  next.on("error", (message) => broadcast({ type: "error", message }));
  session = next;
  await next.start();
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME || port.sender?.id !== chrome.runtime.id) return;
  ports.add(port);
  port.postMessage({ type: "state", state } satisfies ToUi);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener((msg: ToVoice) => {
    if (msg.type === "start") {
      start().catch((err: unknown) => {
        state = "error";
        broadcast({ type: "error", message: err instanceof Error ? err.message : String(err) });
        broadcast({ type: "state", state: "idle" });
      });
    }
    else if (msg.type === "stop") session?.stop();
    else if (msg.type === "text") session?.sendText(msg.text);
  });
});

// Mouth and mic levels drive Tekkie's lip sync in whichever tab you're looking at.
setInterval(() => {
  if (session && ports.size && session.active) {
    broadcast({ type: "levels", out: session.outputLevel, in: session.inputLevel });
  }
}, 50);

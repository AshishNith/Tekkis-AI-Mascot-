import { mountTekkie } from "../../web/src/widget/TekkieWidget";
import { RemoteVoiceSession } from "./remote-voice";
import { loadSettings, skinById } from "./settings";

const parentWindow = window.parent;
const send = (type: string, extra: Record<string, unknown> = {}) => parentWindow.postMessage({ tekkie: true, type, ...extra }, "*");

const settings = await loadSettings();
const voice = new RemoteVoiceSession();
const tekkie = mountTekkie({
  voice,
  shouldGreet: async () => {
    if (await voice.restored) return false;
    // Say hello once per browser session, not on every page you open.
    const seen = (await chrome.storage.session.get("greeted")).greeted;
    await chrome.storage.session.set({ greeted: true });
    return !seen;
  },
  skin: skinById(settings.skinId),
  frame: {
    move: (dx, dy) => send("move", { dx, dy }),
    settle: () => send("settle"),
    resize: (w, h) => send("resize", { w, h }),
    micBlocked: () => send("mic-blocked"),
  },
});

// The host page forwards its pointer so Tekkie's eyes follow it across the whole page.
window.addEventListener("message", (e) => {
  if (e.source !== parentWindow) return;
  const msg = e.data as { tekkie?: boolean; type?: string; x?: number; y?: number };
  if (msg?.tekkie && msg.type === "pointer" && typeof msg.x === "number" && typeof msg.y === "number") {
    tekkie.lookAtPoint(msg.x, msg.y);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.skinId) tekkie.setSkin(skinById(String(changes.skinId.newValue)));
});

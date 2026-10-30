// Puts Tekkie on every page. The widget draws itself in a shadow root right in the page, so strict
// site rules (Google, banks...) can't block it. The voice conversation, microphone and speaker live in
// the extension's offscreen document, which this script talks to through RemoteVoiceSession.
import { mountTekkie } from "../../web/src/widget/TekkieWidget";
import { runAction } from "./control/dom-actions";
import { RemoteVoiceSession } from "./remote-voice";
import { loadSettings, skinById } from "./settings";

// If this script is injected again (e.g. from the popup), the newest copy takes over and older ones go quiet.
const token = Symbol("tekkie");
const owner = window as unknown as { __tekkieToken?: symbol };
owner.__tekkieToken = token;
const alive = () => owner.__tekkieToken === token && Boolean(chrome.runtime?.id);

const POSITION_KEY = "position";
let tekkie: ReturnType<typeof mountTekkie> | undefined;

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

async function mount() {
  if (tekkie || !document.body || !alive()) return;
  document.querySelectorAll("[data-tekkie]").forEach((old) => old.remove()); // leftovers from an older copy
  const settings = await loadSettings();
  if (tekkie || !alive()) return; // mounted (or replaced) while we were reading settings
  const voice = new RemoteVoiceSession();
  tekkie = mountTekkie({
    voice,
    skin: skinById(settings.skinId),
    storage: {
      get: async () => {
        const saved = (await chrome.storage.local.get(POSITION_KEY))[POSITION_KEY] as { x?: unknown; b?: unknown } | undefined;
        return finite(saved?.x) && finite(saved?.b) ? { x: saved.x, b: saved.b } : null;
      },
      set: (pos) => void chrome.storage.local.set({ [POSITION_KEY]: pos }),
      clear: () => void chrome.storage.local.remove(POSITION_KEY),
    },
    // Say hello on the first page of the browser session, and never in the middle of a conversation.
    shouldGreet: async () => !(await voice.restored) && (await chrome.runtime.sendMessage({ type: "tekkie:greet" })) === true,
    onMicBlocked: () => void chrome.runtime.sendMessage({ type: "tekkie:open-mic-setup" }),
  });
}

function unmount() {
  tekkie?.destroy();
  tekkie = undefined;
}

// After the extension is reloaded or updated, this copy loses its connection: remove Tekkie quietly
// instead of leaving a dead mascot (and console errors) behind.
const watchdog = setInterval(() => {
  if (alive()) return;
  clearInterval(watchdog);
  unmount();
}, 2000);

chrome.runtime.onMessage.addListener((msg: { type?: string; name?: string; args?: Record<string, unknown> }, sender, sendResponse) => {
  if (!alive() || sender.id !== chrome.runtime.id) return;
  if (msg?.type === "tekkie:show") {
    // Bring Tekkie to the default corner of this page, even if it was hidden or dragged away.
    void (async () => {
      await mount();
      tekkie?.resetPosition();
      setTimeout(() => tekkie?.wave(), 300);
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (msg?.type !== "tekkie:act") return;
  try {
    sendResponse({ ok: true, result: runAction(String(msg.name), msg.args ?? {}) });
  } catch (err) {
    sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

chrome.storage.local.get({ enabled: true }).then(({ enabled }) => {
  if (enabled) void mount();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (!alive() || area !== "local") return;
  if (changes.enabled) {
    if (changes.enabled.newValue === false) unmount();
    else void mount();
  }
  if (changes.skinId) tekkie?.setSkin(skinById(String(changes.skinId.newValue)));
});

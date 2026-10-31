// Puts Tekkie on every page. The widget draws itself in a shadow root right in the page, so strict
// site rules (Google, banks...) can't block it. The voice conversation, microphone and speaker live in
// the extension's offscreen document, which this script talks to through RemoteVoiceSession.
import { EMOTES, type Emote } from "../../web/src/mascot/TekkieCharacter";
import { decay, levelOf, newCare, type CareState } from "../../web/src/widget/care";
import { mountTekkie } from "../../web/src/widget/TekkieWidget";
import { runAction } from "./control/dom-actions";
import { RemoteVoiceSession } from "./remote-voice";
import { loadSettings, resolveSkin, siteRules, type Settings } from "./settings";

// If this script is injected again (e.g. from the popup), the newest copy takes over and older ones go quiet.
const token = Symbol("tekkie");
const owner = window as unknown as { __tekkieToken?: symbol };
owner.__tekkieToken = token;
const alive = () => owner.__tekkieToken === token && Boolean(chrome.runtime?.id);

const POSITION_KEY = "position";
const CARE_KEY = "care";
let tekkie: ReturnType<typeof mountTekkie> | undefined;

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

async function bondLevel() {
  const saved = (await chrome.storage.local.get(CARE_KEY))[CARE_KEY] as CareState | undefined;
  return levelOf(decay(saved ?? newCare()).xp);
}

/** Should Tekkie be on this page at all? */
const wanted = (s: Settings) => s.enabled && !siteRules(s, location.hostname).hide;

async function mount() {
  if (tekkie || !document.body || !alive()) return;
  const settings = await loadSettings();
  if (!wanted(settings)) return;
  const level = await bondLevel();
  if (tekkie || !alive()) return; // mounted (or replaced) while we were reading settings
  document.querySelectorAll("[data-tekkie]").forEach((old) => old.remove()); // leftovers from an older copy
  const voice = new RemoteVoiceSession();
  tekkie = mountTekkie({
    voice,
    skin: resolveSkin(settings, level),
    scale: settings.scale,
    corner: settings.corner,
    storage: {
      get: async () => {
        const saved = (await chrome.storage.local.get(POSITION_KEY))[POSITION_KEY] as { x?: unknown; b?: unknown } | undefined;
        return finite(saved?.x) && finite(saved?.b) ? { x: saved.x, b: saved.b } : null;
      },
      set: (pos) => void chrome.storage.local.set({ [POSITION_KEY]: pos }),
      clear: () => void chrome.storage.local.remove(POSITION_KEY),
    },
    // One Tekkie, many tabs: the pet's food, mood and bond level are shared by all of them.
    care: {
      get: async () => ((await chrome.storage.local.get(CARE_KEY))[CARE_KEY] as CareState | undefined) ?? null,
      set: (state) => void chrome.storage.local.set({ [CARE_KEY]: state }),
      clear: () => void chrome.storage.local.remove(CARE_KEY),
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

chrome.runtime.onMessage.addListener((msg: { type?: string; name?: string; text?: string; emote?: string; args?: Record<string, unknown> }, sender, sendResponse) => {
  if (!alive() || sender.id !== chrome.runtime.id) return;
  if (msg?.type === "tekkie:ping") {
    sendResponse(true);
    return;
  }
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
  if (msg?.type === "tekkie:say" && msg.text) {
    // e.g. a reminder going off.
    tekkie?.say(msg.text);
    if (msg.emote && (EMOTES as string[]).includes(msg.emote)) tekkie?.emote(msg.emote as Emote);
    return;
  }
  if (msg?.type !== "tekkie:act") return;
  try {
    sendResponse({ ok: true, result: runAction(String(msg.name), msg.args ?? {}) });
  } catch (err) {
    sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

void mount();
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (!alive() || area !== "local") return;
  if (changes.enabled || changes.sites) {
    const settings = await loadSettings();
    if (!wanted(settings)) unmount();
    else void mount();
  }
  if (!tekkie) return;
  const levelChanged =
    changes.care && levelOf((changes.care.oldValue as CareState | undefined)?.xp ?? 0) !== levelOf((changes.care.newValue as CareState | undefined)?.xp ?? 0);
  if (changes.skinId || changes.customColors || levelChanged) {
    tekkie.setSkin(resolveSkin(await loadSettings(), await bondLevel()));
  }
  if (changes.scale && finite(changes.scale.newValue)) tekkie.setScale(changes.scale.newValue);
  if (changes.corner) {
    tekkie.setCorner(changes.corner.newValue === "left" ? "left" : "right");
    tekkie.resetPosition();
  }
  // Dragged in another tab? Move Tekkie here too, so it is in the same spot wherever you look.
  if (changes.position) {
    const next = changes.position.newValue as { x?: unknown; b?: unknown } | undefined;
    if (finite(next?.x) && finite(next?.b)) tekkie.setPosition({ x: next.x, b: next.b });
  }
});

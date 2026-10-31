import { loadSettings } from "./settings";

const MIC_SETUP = "permission.html";
const OFFSCREEN = "offscreen.html";

// --- Tekkie follows you: make sure the tab you are looking at has a mascot. ----------------------

/** Puts the content script into a tab that doesn't have a live copy (opened before install, or orphaned by a reload). */
async function ensureTekkie(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !/^https?:/.test(tab.url)) return; // Chrome pages and the Web Store are off limits
    if (!(await loadSettings()).enabled) return;
    try {
      if (await chrome.tabs.sendMessage(tabId, { type: "tekkie:ping" })) return; // already there
    } catch {
      /* no live copy: inject one */
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch {
    /* tab closed or not injectable: nothing to do */
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => void ensureTekkie(tabId));
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab?.id) void ensureTekkie(tab.id);
});

async function ensureInAllTabs() {
  for (const tab of await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] })) {
    if (tab.id) void ensureTekkie(tab.id);
  }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  // First install: grant the microphone once up front, so the first chat on any site just works.
  if (reason === "install") void chrome.tabs.create({ url: chrome.runtime.getURL(MIC_SETUP) });
  void ensureInAllTabs(); // tabs that were already open get Tekkie without a refresh
  void ensureOffscreen();
});
chrome.runtime.onStartup.addListener(() => {
  void ensureInAllTabs();
  void ensureOffscreen();
});

// --- Voice lives in an offscreen document so a conversation survives page navigations. -----------

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  return contexts.length > 0;
}

let creatingOffscreen: Promise<void> | undefined;

/** Creates the voice document if it doesn't exist. Safe to call from many tabs at once. */
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN,
      reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Keep the voice conversation with Tekkie going while pages change.",
    })
    .catch((err: unknown) => {
      // Another tab won the race to create it: that's fine.
      if (!/single offscreen/i.test(String(err))) throw err;
    })
    .finally(() => {
      creatingOffscreen = undefined;
    });
  await creatingOffscreen;
}

// --- Browser control: the tools Gemini calls land here. ----------------------------------------

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("No active tab to work on.");
  return tab;
}

function safeUrl(raw: unknown): string {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    try {
      url = new URL(`https://${String(raw)}`);
    } catch {
      throw new Error("That isn't a valid web address.");
    }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("I can only open http and https pages.");
  return url.href;
}

/** Resolves once the tab has finished loading (or after a timeout), so the next read_page sees the new page. */
async function settle(tabId: number) {
  await new Promise((r) => setTimeout(r, 500));
  for (let i = 0; i < 40; i++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 400)); // let the content script start
}

// --- Real input: clicks and keys sent through Chrome's debugger are trusted, exactly like a human's. ---

const DEBUGGER_IDLE_MS = 20_000;
const debugging = new Map<number, ReturnType<typeof setTimeout>>();

function releaseDebugger(tabId: number) {
  clearTimeout(debugging.get(tabId));
  debugging.delete(tabId);
  chrome.debugger.detach({ tabId }).catch(() => {});
}

function releaseAllDebuggers() {
  for (const tabId of [...debugging.keys()]) releaseDebugger(tabId);
}

chrome.debugger.onDetach.addListener(({ tabId }) => {
  if (tabId !== undefined) {
    clearTimeout(debugging.get(tabId));
    debugging.delete(tabId);
  }
});

/** Runs a CDP command on a tab. Attaches on first use and lets go again after a short idle time. */
async function cdp(tabId: number, method: string, params: Record<string, unknown> = {}) {
  if (!debugging.has(tabId)) await chrome.debugger.attach({ tabId }, "1.3");
  clearTimeout(debugging.get(tabId));
  debugging.set(tabId, setTimeout(() => releaseDebugger(tabId), DEBUGGER_IDLE_MS));
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

const KEYS: Record<string, { code: string; vk: number; text?: string }> = {
  Enter: { code: "Enter", vk: 13, text: "\r" },
  Tab: { code: "Tab", vk: 9 },
  Escape: { code: "Escape", vk: 27 },
  Backspace: { code: "Backspace", vk: 8 },
  Delete: { code: "Delete", vk: 46 },
  Space: { code: "Space", vk: 32, text: " " },
  ArrowUp: { code: "ArrowUp", vk: 38 },
  ArrowDown: { code: "ArrowDown", vk: 40 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
  PageUp: { code: "PageUp", vk: 33 },
  PageDown: { code: "PageDown", vk: 34 },
  Home: { code: "Home", vk: 36 },
  End: { code: "End", vk: 35 },
};

async function pressKey(tabId: number, name: string) {
  const k = KEYS[name];
  if (!k) throw new Error(`Unsupported key: ${name}`);
  const key = name === "Space" ? " " : name;
  await cdp(tabId, "Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", key, code: k.code, windowsVirtualKeyCode: k.vk, text: k.text });
  await cdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key, code: k.code, windowsVirtualKeyCode: k.vk });
}

async function mouse(tabId: number, x: number, y: number, kind: "move" | "click") {
  await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  if (kind === "click") {
    await cdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
}

type PageReply = { ok: boolean; result?: unknown; error?: string };

async function act(tabId: number, name: string, args: Record<string, unknown>): Promise<unknown> {
  let reply: PageReply | undefined;
  try {
    reply = await chrome.tabs.sendMessage(tabId, { type: "tekkie:act", name, args });
  } catch (err) {
    throw new Error(`I can't control this page (browser pages and the Web Store are off limits). Try another tab. (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!reply?.ok) throw new Error(reply?.error ?? "The action failed.");
  return reply.result;
}

/** A click or key may start a navigation: give it a moment so the answer reflects the new page. */
async function afterInteraction(tabId: number) {
  await new Promise((r) => setTimeout(r, 350));
  if ((await chrome.tabs.get(tabId)).status === "loading") await settle(tabId);
}

async function click(tabId: number, args: Record<string, unknown>) {
  const spot = (await act(tabId, "aim", args)) as { x: number; y: number; hit: boolean; label: string };
  if (spot.hit) {
    try {
      await mouse(tabId, spot.x, spot.y, "click");
      await afterInteraction(tabId);
      return { clicked: spot.label };
    } catch {
      /* the debugger couldn't attach (page not allowed): fall back to a scripted click */
    }
  }
  // The spot is covered by something else, or real input isn't available. The user already approved it.
  const result = await act(tabId, "click", { ...args, confirmed: true }).catch(async (err) => {
    // The page may have started navigating as the click landed.
    if ((await chrome.tabs.get(tabId)).status === "loading") return { clicked: spot.label };
    throw err;
  });
  await afterInteraction(tabId);
  return result;
}

async function typeText(tabId: number, args: Record<string, unknown>) {
  const prep = (await act(tabId, "prepare_type", args)) as { native: boolean };
  if (prep.native) {
    try {
      const text = String(args.text ?? "");
      if (text) await cdp(tabId, "Input.insertText", { text });
      else await pressKey(tabId, "Delete");
      if (args.submit === true) {
        await pressKey(tabId, "Enter");
        await afterInteraction(tabId);
      }
      return { typed: `${text.length} characters`, submitted: args.submit === true };
    } catch {
      /* fall through to scripted typing */
    }
  }
  return act(tabId, "type_text", args);
}

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Chrome-level tools don't need a page.
  if (name === "list_tabs") {
    const tabs = await chrome.tabs.query({});
    return tabs.map((t) => ({ id: t.id, title: (t.title ?? "").slice(0, 80), url: (t.url ?? "").slice(0, 100), active: t.active }));
  }
  if (name === "switch_tab") {
    const tab = await chrome.tabs.update(Number(args.id), { active: true });
    if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
    return { switched: true, note: "Call read_page to see it." };
  }
  if (name === "close_tab") {
    if (args.confirmed !== true) throw new Error("Closing a tab can lose work. Ask the user to confirm, then call close_tab again with confirmed=true.");
    await chrome.tabs.remove(Number(args.id));
    return { closed: true };
  }

  const tab = await activeTab();
  const tabId = tab.id!;

  switch (name) {
    case "read_page":
    case "scroll":
    case "fill_form":
      return act(tabId, name, args);
    case "click":
      return click(tabId, args);
    case "type_text":
      return typeText(tabId, args);
    case "hover": {
      const spot = (await act(tabId, "aim", { ...args, confirmed: true })) as { x: number; y: number; label: string };
      await mouse(tabId, spot.x, spot.y, "move");
      return { hovered: spot.label };
    }
    case "press_key":
      await pressKey(tabId, String(args.key));
      await afterInteraction(tabId);
      return { pressed: args.key };
    case "go_to":
      await chrome.tabs.update(tabId, { url: safeUrl(args.url) });
      await settle(tabId);
      return { opened: true, note: "Call read_page to see it." };
    case "web_search":
      await chrome.tabs.update(tabId, { url: `https://www.google.com/search?q=${encodeURIComponent(String(args.query ?? ""))}` });
      await settle(tabId);
      return { searched: true, note: "Call read_page to see the results." };
    case "open_tab": {
      const created = await chrome.tabs.create({ url: safeUrl(args.url), active: true });
      await settle(created.id!);
      return { opened: true, note: "Call read_page to see it." };
    }
    case "go_back":
      await chrome.tabs.goBack(tabId);
      await settle(tabId);
      return { wentBack: true, note: "Call read_page to see it." };
    case "go_forward":
      await chrome.tabs.goForward(tabId);
      await settle(tabId);
      return { wentForward: true, note: "Call read_page to see it." };
    case "reload_page":
      await chrome.tabs.reload(tabId);
      await settle(tabId);
      return { reloaded: true, note: "Call read_page to see it." };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/** A JPEG of the visible tab, scaled down so it is quick to send. Returns base64 without the data: prefix. */
async function captureScreen(): Promise<string> {
  if (!(await loadSettings()).screenReading) {
    throw new Error('Screen reading is switched off. Ask the user to turn on "Let Tekkie see the screen" in the Tekkie popup settings.');
  }
  const tab = await activeTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 });
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = Math.min(1, 1280 / bitmap.width);
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((msg: { type?: string; create?: boolean; name?: string; args?: Record<string, unknown> }, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  if (msg?.type === "tekkie:open-mic-setup") {
    void chrome.tabs.create({ url: chrome.runtime.getURL(MIC_SETUP) });
  } else if (msg?.type === "tekkie:offscreen") {
    (async () => {
      if (msg.create) await ensureOffscreen();
      sendResponse(await hasOffscreen());
    })();
    return true;
  } else if (msg?.type === "tekkie:greet") {
    void chrome.storage.session.get("greeted").then(async ({ greeted }) => {
      await chrome.storage.session.set({ greeted: true });
      sendResponse(!greeted);
    });
    return true;
  } else if (msg?.type === "tekkie:release") {
    releaseAllDebuggers();
  } else if (msg?.type === "tekkie:screenshot") {
    captureScreen().then(
      (image) => sendResponse({ ok: true, image }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  } else if (msg?.type === "tekkie:settings") {
    void loadSettings().then(sendResponse);
    return true;
  } else if (msg?.type === "tekkie:tool") {
    runTool(String(msg.name), msg.args ?? {}).then(
      (output) => sendResponse({ ok: true, output }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  }
});

import { loadSettings } from "./settings";

const MIC_SETUP = "permission.html";
const OFFSCREEN = "offscreen.html";

// First install: grant the microphone once up front, so the first chat on any site just works.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") void chrome.tabs.create({ url: chrome.runtime.getURL(MIC_SETUP) });
});

// --- Voice lives in an offscreen document so a conversation survives page navigations. -----------

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN,
    reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "Keep the voice conversation with Tekkie going while pages change.",
  });
}

// --- Browser control: the tools Gemini calls land here. ----------------------------------------

const PAGE_ACTIONS = new Set(["read_page", "click", "type_text", "scroll"]);

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

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const tab = await activeTab();
  const tabId = tab.id!;

  if (PAGE_ACTIONS.has(name)) {
    let reply: { ok: boolean; result?: unknown; error?: string } | undefined;
    try {
      reply = await chrome.tabs.sendMessage(tabId, { type: "tekkie:act", name, args });
    } catch (err) {
      // The page navigated away mid-action (e.g. a link was clicked) or doesn't allow extensions.
      if (name === "click") {
        await settle(tabId);
        return { clicked: true, note: "The page changed. Call read_page to see it." };
      }
      throw new Error(`I can't control this page (browser pages and the Web Store are off limits). Try another tab. (${err instanceof Error ? err.message : String(err)})`);
    }
    if (!reply?.ok) throw new Error(reply?.error ?? "The action failed.");
    if (name === "click") {
      // A click may start a navigation: give it a moment so the answer reflects the new page.
      await new Promise((r) => setTimeout(r, 300));
      if ((await chrome.tabs.get(tabId)).status === "loading") await settle(tabId);
    }
    return reply.result;
  }

  switch (name) {
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
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

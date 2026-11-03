import { loadList, loadSettings, newId, saveList, saveSettings, siteRules, type Item, type ListName } from "./settings";
import { ACCESSORIES, SKINS } from "../../web/src/mascot/skins";

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

/** Well-known sites by the name people say, so "open Gmail" needs no address. */
const SITES: Record<string, string> = {
  gmail: "https://mail.google.com",
  email: "https://mail.google.com",
  mail: "https://mail.google.com",
  google: "https://www.google.com",
  youtube: "https://www.youtube.com",
  "youtube music": "https://music.youtube.com",
  maps: "https://www.google.com/maps",
  "google maps": "https://www.google.com/maps",
  drive: "https://drive.google.com",
  "google drive": "https://drive.google.com",
  docs: "https://docs.google.com/document",
  "google docs": "https://docs.google.com/document",
  sheets: "https://docs.google.com/spreadsheets",
  "google sheets": "https://docs.google.com/spreadsheets",
  slides: "https://docs.google.com/presentation",
  calendar: "https://calendar.google.com",
  "google calendar": "https://calendar.google.com",
  meet: "https://meet.google.com",
  photos: "https://photos.google.com",
  translate: "https://translate.google.com",
  news: "https://news.google.com",
  gemini: "https://gemini.google.com",
  chatgpt: "https://chatgpt.com",
  claude: "https://claude.ai",
  facebook: "https://www.facebook.com",
  instagram: "https://www.instagram.com",
  twitter: "https://x.com",
  x: "https://x.com",
  linkedin: "https://www.linkedin.com",
  whatsapp: "https://web.whatsapp.com",
  "whatsapp web": "https://web.whatsapp.com",
  telegram: "https://web.telegram.org",
  reddit: "https://www.reddit.com",
  github: "https://github.com",
  netflix: "https://www.netflix.com",
  spotify: "https://open.spotify.com",
  amazon: "https://www.amazon.in",
  flipkart: "https://www.flipkart.com",
  wikipedia: "https://www.wikipedia.org",
  outlook: "https://outlook.live.com",
  zoom: "https://zoom.us",
  notion: "https://www.notion.so",
  figma: "https://www.figma.com",
  canva: "https://www.canva.com",
  pinterest: "https://www.pinterest.com",
  "prime video": "https://www.primevideo.com",
  hotstar: "https://www.hotstar.com",
};

function safeUrl(raw: unknown): string {
  const said = String(raw ?? "").trim();
  const named = SITES[said.toLowerCase().replace(/^(the|open|go to)\s+/, "").replace(/\.(com|in)$/, "")];
  let url: URL;
  try {
    if (named) url = new URL(named);
    else if (!said.includes(".") && !said.includes("/") && !said.includes(":")) {
      // Not a web address and not a site we know: search for it instead of failing.
      url = new URL(`https://www.google.com/search?q=${encodeURIComponent(said)}`);
    } else url = new URL(said);
  } catch {
    try {
      url = new URL(`https://${said}`);
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
  let spot = (await act(tabId, "aim", args)) as { x: number; y: number; hit: boolean; label: string };
  if (!spot.hit) {
    // Something covers it: a cookie banner or pop-up, most likely. Clear it and aim again.
    try {
      const closed = (await act(tabId, "dismiss_popups", {})) as { clicked: string | null };
      if (closed.clicked) {
        await new Promise((r) => setTimeout(r, 500));
        spot = (await act(tabId, "aim", { ...args, confirmed: true })) as typeof spot;
      }
    } catch {
      /* no pop-up to close */
    }
  }
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

/** Memory, notes, to-dos and reminders: things Tekkie keeps for the user. */
async function runListTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const text = String(args.text ?? args.fact ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const add = async (list: ListName, extra: Partial<Item> = {}) => {
    if (!text) throw new Error("There's nothing to save.");
    const items = await loadList(list);
    items.push({ id: newId(), text, at: Date.now(), ...extra });
    await saveList(list, items);
  };
  const matches = (item: Item, words: string) => item.text.toLowerCase().includes(words.toLowerCase());
  switch (name) {
    case "remember":
      if (/\b(password|pin|cvv|card number|otp)\b/i.test(text)) throw new Error("I don't keep secrets like passwords or card numbers.");
      await add("memory");
      return { remembered: text };
    case "forget": {
      const what = String(args.what ?? "").trim();
      const items = await loadList("memory");
      const keep = /^(everything|all)$/i.test(what) ? [] : items.filter((m) => !matches(m, what));
      await saveList("memory", keep);
      return { forgotten: items.length - keep.length };
    }
    case "add_note": {
      // Remember where it came from, so a note on a search or an article can be found again.
      let source = "";
      try {
        const tab = await activeTab();
        if (tab.url && /^https?:/.test(tab.url)) source = ` — ${(tab.title ?? "").slice(0, 60)} (${tab.url.slice(0, 120)})`;
      } catch {
        /* no page in front */
      }
      await add("notes", { text: text + source });
      return { saved: true, from: source ? "the page you're on" : undefined };
    }
    case "list_notes":
      return (await loadList("notes")).slice(-30).map((n) => n.text);
    case "add_todo":
      await add("todos");
      return { added: true };
    case "complete_todo": {
      const items = await loadList("todos");
      const hit = items.find((t) => !t.done && matches(t, text));
      if (!hit) throw new Error("I couldn't find that to-do.");
      hit.done = true;
      await saveList("todos", items);
      return { completed: hit.text };
    }
    case "list_todos":
      return (await loadList("todos")).filter((t) => !t.done).map((t) => t.text);
    case "set_reminder": {
      const minutes = Math.min(1440, Math.max(1, Number(args.minutes) || 0));
      const id = newId();
      const items = await loadList("reminders");
      items.push({ id, text, at: Date.now(), due: Date.now() + minutes * 60_000 });
      await saveList("reminders", items);
      await chrome.alarms.create(`reminder:${id}`, { delayInMinutes: minutes });
      return { reminderInMinutes: minutes };
    }
  }
  return undefined;
}

/** Saves a PNG of the visible tab to the Downloads folder, and notes where it came from. */
async function saveScreenshot(): Promise<unknown> {
  if (!(await loadSettings()).screenReading) {
    throw new Error('Screenshots are switched off. Ask the user to turn on "Let Tekkie see the screen" in the Tekkie popup settings.');
  }
  const tab = await activeTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const filename = `Tekkie/screenshot-${stamp}.png`;
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
  const items = await loadList("notes");
  items.push({ id: newId(), text: `Screenshot saved: ${filename} — ${(tab.title ?? "").slice(0, 60)}`, at: Date.now() });
  await saveList("notes", items);
  return { saved: true, file: `Downloads/${filename}` };
}

/** Opens YouTube's results for a search in a new tab and plays the first real video (a real click, so sound is allowed). */
async function playOnYoutube(query: string): Promise<unknown> {
  if (!query.trim()) throw new Error("What should I play?");
  const created = await chrome.tabs.create({ url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, active: true });
  const tabId = created.id!;
  await settle(tabId);
  // The results are drawn by script a moment after the page loads.
  for (let i = 0; i < 12; i++) {
    try {
      const found = (await act(tabId, "find_first", { selector: "ytd-video-renderer a#video-title, a#video-title" })) as { id: number; label: string } | null;
      if (found) {
        await click(tabId, { id: found.id });
        await settle(tabId);
        return { playing: found.label, note: "It should be playing now. If a skip-ads button or consent box shows, handle it with read_page and click." };
      }
    } catch {
      /* page still loading */
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return { opened: "YouTube results", note: "I couldn't find a video to start. Call read_page and click one." };
}

/** Pages that usually hold a player, for when nothing is audible right now (e.g. the song is paused). */
const MEDIA_URL = /youtube\.com\/(watch|shorts)|music\.youtube\.com|open\.spotify\.com|soundcloud\.com|jiosaavn\.com|gaana\.com|wynk\.in|netflix\.com\/watch|primevideo\.com|hotstar\.com|twitch\.tv|vimeo\.com|\.mp[34]($|\?)/i;

/** Runs inside the page: finds its player and applies the action. Must stay self-contained. */
function pageMedia(action: string, amount: number) {
  const players = [...document.querySelectorAll<HTMLMediaElement>("video, audio")].filter((m) => m.duration > 0 || !m.paused);
  const media = players.find((m) => !m.paused) ?? players.sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];
  const press = (selector: string) => {
    const el = document.querySelector<HTMLElement>(selector);
    el?.click();
    return !!el;
  };
  if (!media) return { ok: false, error: "no player on this page" };
  switch (action) {
    case "play":
      void media.play();
      break;
    case "pause":
      media.pause();
      break;
    case "toggle":
      if (media.paused) void media.play();
      else media.pause();
      break;
    case "mute":
      media.muted = true;
      break;
    case "unmute":
      media.muted = false;
      break;
    case "volume":
      media.muted = false;
      media.volume = Math.min(1, Math.max(0, amount));
      break;
    case "seek":
      media.currentTime = Math.max(0, media.currentTime + amount);
      break;
    case "restart":
      media.currentTime = 0;
      break;
    case "next":
      if (!press(".ytp-next-button, ytmusic-player-bar .next-button, [data-testid='control-button-skip-forward'], .play-pause-container .next, button[aria-label*='Next' i]")) {
        return { ok: false, error: "no next button on this page" };
      }
      break;
    case "previous":
      if (!press(".ytp-prev-button, ytmusic-player-bar .previous-button, [data-testid='control-button-skip-back'], button[aria-label*='Previous' i]")) media.currentTime = 0;
      break;
    default:
      return { ok: false, error: `unknown media action ${action}` };
  }
  return { ok: true, playing: !media.paused, muted: media.muted, title: document.title.slice(0, 80) };
}

/** Pause, play, skip, mute or seek whatever is playing, on whichever tab it is in. */
async function controlMedia(args: Record<string, unknown>): Promise<unknown> {
  const action = String(args.action ?? "toggle");
  const amount = Number(args.amount ?? (action === "seek" ? 10 : 0.5));
  const tabs = (await chrome.tabs.query({})).filter((t) => t.id !== undefined && /^https?:/.test(t.url ?? ""));
  let pick = args.tab_id !== undefined ? tabs.find((t) => t.id === Number(args.tab_id)) : undefined;
  if (!pick) pick = tabs.filter((t) => t.audible).sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (!pick) pick = tabs.filter((t) => MEDIA_URL.test(t.url ?? "")).sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (!pick) pick = (await activeTab());
  const host = new URL(pick.url ?? "about:blank").hostname;
  if (siteRules(await loadSettings(), host).noControl) throw new Error(`The user turned off controlling ${host}.`);
  if (action === "play" || action === "toggle") {
    // Browsers only start playback reliably in a tab the user is looking at.
    await chrome.tabs.update(pick.id!, { active: true });
    if (pick.windowId !== undefined) await chrome.windows.update(pick.windowId, { focused: true });
  }
  const [result] = await chrome.scripting.executeScript({ target: { tabId: pick.id! }, func: pageMedia, args: [action, amount] });
  const out = result?.result as { ok: boolean; error?: string; playing?: boolean; muted?: boolean; title?: string } | undefined;
  if (!out?.ok) throw new Error(`Couldn't ${action} on "${(pick.title ?? host).slice(0, 50)}": ${out?.error ?? "no answer from the page"}. Try list_tabs and pass tab_id.`);
  return { done: action, tab: (pick.title ?? host).slice(0, 60), playing: out.playing, muted: out.muted };
}

// --- Productivity: email, calendar, translation, history, bookmarks, tabs. -----------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** YYYYMMDDTHHMMSS in local time, as Google Calendar's template link wants it. */
function calendarStamp(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`I couldn't read the date "${raw}". Use a form like 2026-11-05T15:00.`);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

async function runProductivityTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const str = (k: string, max = 2000) => String(args[k] ?? "").slice(0, max);
  switch (name) {
    case "compose_email": {
      const q = new URLSearchParams({ view: "cm", fs: "1" });
      if (str("to")) q.set("to", str("to", 300));
      if (str("subject")) q.set("su", str("subject", 300));
      if (str("body")) q.set("body", str("body", 6000));
      await chrome.tabs.create({ url: `https://mail.google.com/mail/?${q}`, active: true });
      return { opened: "Gmail compose", note: "The draft is filled in. Tell the user to check it and press Send; never send it yourself." };
    }
    case "add_calendar_event": {
      const start = calendarStamp(str("start"));
      const end = str("end") ? calendarStamp(str("end")) : calendarStamp(new Date(new Date(str("start")).getTime() + 3_600_000).toISOString());
      const q = new URLSearchParams({ action: "TEMPLATE", text: str("title", 200), dates: `${start}/${end}` });
      if (str("details")) q.set("details", str("details"));
      if (str("location")) q.set("location", str("location", 300));
      await chrome.tabs.create({ url: `https://calendar.google.com/calendar/render?${q}`, active: true });
      return { opened: "Google Calendar event", note: "The event is filled in; the user presses Save." };
    }
    case "search_history": {
      const days = Math.min(365, Math.max(1, Number(args.days) || 30));
      const items = await chrome.history.search({ text: str("query", 100), startTime: Date.now() - days * 86_400_000, maxResults: 15 });
      return items.map((h) => ({ title: (h.title ?? "").slice(0, 80), url: (h.url ?? "").slice(0, 150), when: h.lastVisitTime ? new Date(h.lastVisitTime).toLocaleString() : undefined }));
    }
    case "bookmark_page": {
      const tab = await activeTab();
      if (!tab.url || !/^https?:/.test(tab.url)) throw new Error("This page can't be bookmarked.");
      const existing = await chrome.bookmarks.search({ url: tab.url });
      if (existing.length) return { bookmarked: true, already: true, title: existing[0].title };
      await chrome.bookmarks.create({ title: tab.title ?? tab.url, url: tab.url });
      return { bookmarked: true, title: tab.title };
    }
    case "search_bookmarks": {
      const hits = await chrome.bookmarks.search(str("query", 100));
      return hits.filter((b) => b.url).slice(0, 15).map((b) => ({ title: b.title.slice(0, 80), url: b.url!.slice(0, 150) }));
    }
    case "find_tab": {
      const words = str("query", 100).toLowerCase().split(/\s+/).filter(Boolean);
      const all = await chrome.tabs.query({});
      const text = (t: chrome.tabs.Tab) => `${t.title} ${t.url}`.toLowerCase();
      let tabs = all.filter((t) => words.every((w) => text(t).includes(w)));
      if (!tabs.length) tabs = all.filter((t) => words.some((w) => w.length > 2 && text(t).includes(w)));
      if (!tabs.length) throw new Error("No open tab matches that. Call list_tabs to see them, or open_tab to open it.");
      const tab = tabs[0];
      await chrome.tabs.update(tab.id!, { active: true });
      if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
      return { switched: (tab.title ?? "").slice(0, 80), others: tabs.length - 1 };
    }
    case "close_duplicate_tabs": {
      const tabs = await chrome.tabs.query({});
      const seen = new Map<string, chrome.tabs.Tab>();
      const close: number[] = [];
      for (const t of [...tabs].sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))) {
        const key = (t.url ?? "").split("#")[0];
        if (!key || !/^https?:/.test(key)) continue;
        if (seen.has(key)) close.push(t.id!);
        else seen.set(key, t);
      }
      if (close.length) await chrome.tabs.remove(close);
      return { closed: close.length };
    }
    case "zoom_page": {
      const tab = await activeTab();
      const level = Math.min(3, Math.max(0.5, Number(args.level) || 1));
      await chrome.tabs.setZoom(tab.id!, level);
      return { zoom: level };
    }
    case "translate_page": {
      const tab = await activeTab();
      if (!tab.url || !/^https?:/.test(tab.url)) throw new Error("This page can't be translated.");
      const tl = str("language", 10).toLowerCase().replace(/[^a-z-]/g, "") || "en";
      await chrome.tabs.create({ url: `https://translate.google.com/translate?sl=auto&tl=${tl}&u=${encodeURIComponent(tab.url)}`, active: true });
      return { opened: "translated page", language: tl };
    }
    case "wait_for": {
      const tab = await activeTab();
      const seconds = Math.min(20, Math.max(1, Number(args.seconds) || 3));
      const text = String(args.text ?? "").trim();
      const until = Date.now() + seconds * 1000;
      while (Date.now() < until) {
        await sleep(400);
        if (!text) continue;
        try {
          const r = (await act(tab.id!, "page_has_text", { text })) as { found: boolean };
          if (r.found) return { found: text };
        } catch {
          /* page still loading */
        }
      }
      return text ? { found: false, note: `"${text}" didn't appear in ${seconds}s. Call read_page to see what is there.` } : { waited: seconds };
    }
    case "set_look": {
      const patch: Record<string, unknown> = {};
      const form = String(args.form ?? "");
      if (["robot", "humanoid", "creature", "yeti"].includes(form)) patch.form = form;
      const skin = String(args.skin ?? "");
      if (skin === "custom" || SKINS.some((s) => s.id === skin)) patch.skinId = skin;
      const accessory = String(args.accessory ?? "");
      if (ACCESSORIES.some((a) => a.id === accessory)) patch.accessory = accessory === "none" ? "" : accessory;
      if (!Object.keys(patch).length) throw new Error("Pick a form (robot, humanoid, creature, yeti), a skin or an accessory.");
      await saveSettings(patch);
      return { changed: patch, note: "Done; the new look shows right away. Locked skins and hats need a higher bond level." };
    }
  }
  return undefined;
}
const PRODUCTIVITY_TOOLS = new Set([
  "compose_email",
  "add_calendar_event",
  "search_history",
  "bookmark_page",
  "search_bookmarks",
  "find_tab",
  "close_duplicate_tabs",
  "zoom_page",
  "translate_page",
  "wait_for",
  "set_look",
]);

const LIST_TOOLS = new Set(["remember", "forget", "add_note", "list_notes", "add_todo", "complete_todo", "list_todos", "set_reminder"]);
const HANDS_ON = new Set(["click", "type_text", "fill_form", "press_key", "hover", "dismiss_popups"]);

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (LIST_TOOLS.has(name)) return runListTool(name, args);
  if (name === "save_screenshot") return saveScreenshot();
  if (name === "play_on_youtube") return playOnYoutube(String(args.query ?? ""));
  if (name === "control_media") return controlMedia(args);
  if (PRODUCTIVITY_TOOLS.has(name)) return runProductivityTool(name, args);
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

  if (HANDS_ON.has(name)) {
    const host = tab.url ? new URL(tab.url).hostname : "";
    if (siteRules(await loadSettings(), host).noControl) {
      throw new Error(`The user turned off clicking and typing on ${host}. Tell them what to do instead, or point_at it.`);
    }
  }

  switch (name) {
    case "read_page":
    case "scroll":
    case "fill_form":
    case "get_page_text":
    case "get_selection":
    case "point_at":
    case "clear_highlights":
    case "find_on_page":
    case "dismiss_popups":
    case "copy_to_clipboard":
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

// --- Reminders: Tekkie pops up on the page you're on, and Chrome shows a notification. ----------

async function sayInActiveTab(text: string, emote = "surprised") {
  try {
    const tab = await activeTab();
    await chrome.tabs.sendMessage(tab.id!, { type: "tekkie:say", text, emote });
  } catch {
    /* no page with Tekkie in front: the notification is enough */
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("reminder:")) return;
  const id = alarm.name.slice("reminder:".length);
  const items = await loadList("reminders");
  const item = items.find((r) => r.id === id);
  if (!item) return;
  await saveList("reminders", items.filter((r) => r.id !== id));
  chrome.notifications.create(`tekkie-${id}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/128.png"),
    title: "Tekkie reminder",
    message: item.text,
    priority: 2,
  });
  void sayInActiveTab(`⏰ Reminder: ${item.text}`);
});

// --- Right-click on selected text: ask Tekkie about it. --------------------------------------

const ASK_MENU: Record<string, (text: string) => string> = {
  "tekkie-explain": (t) => `Explain this simply:\n\n${t}`,
  "tekkie-summarize": (t) => `Summarize this in a few sentences:\n\n${t}`,
  "tekkie-translate": (t) => `Translate this into my language and say it:\n\n${t}`,
  "tekkie-read": (t) => `Read this out loud, exactly as written:\n\n${t}`,
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "tekkie", title: "Ask Tekkie", contexts: ["selection"] });
    const labels: Record<string, string> = {
      "tekkie-explain": "Explain this",
      "tekkie-summarize": "Summarize this",
      "tekkie-translate": "Translate this",
      "tekkie-read": "Read this aloud",
    };
    for (const [id, title] of Object.entries(labels)) chrome.contextMenus.create({ id, parentId: "tekkie", title, contexts: ["selection"] });
  });
});

/** Sends a request to the voice engine, starting a conversation if needed. */
async function askTekkie(text: string) {
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ type: "tekkie:ask", text });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const make = ASK_MENU[String(info.menuItemId)];
  if (!make || !info.selectionText) return;
  if (tab?.id) void chrome.tabs.sendMessage(tab.id, { type: "tekkie:show" }).catch(() => {});
  void askTekkie(make(info.selectionText.slice(0, 6000)));
});

// --- Keyboard shortcuts (change them at chrome://extensions/shortcuts). -------------------------

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-talk") {
    await ensureOffscreen();
    await chrome.runtime.sendMessage({ type: "tekkie:toggle-talk" });
  } else if (command === "toggle-tekkie") {
    const { enabled } = await loadSettings();
    await chrome.storage.local.set({ enabled: !enabled });
  }
});

// The wake word runs in the voice engine; tell it when the setting changes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.wakeWord) {
    void ensureOffscreen().then(() => chrome.runtime.sendMessage({ type: "tekkie:wake-word", on: changes.wakeWord.newValue === true }).catch(() => {}));
  }
});

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

chrome.runtime.onMessage.addListener((msg: { type?: string; create?: boolean; name?: string; args?: Record<string, unknown>; lines?: unknown[] }, sender, sendResponse) => {
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
    // The voice engine can't read storage itself: hand it the settings plus what Tekkie remembers.
    void Promise.all([loadSettings(), loadList("memory"), chrome.storage.local.get("chatHistory")]).then(([settings, memory, stored]) =>
      sendResponse({ ...settings, memory: memory.map((m) => m.text), chatHistory: stored.chatHistory ?? [] }),
    );
    return true;
  } else if (msg?.type === "tekkie:history-save") {
    // The conversation outlives the voice engine, so "play it again" still means something tomorrow.
    void chrome.storage.local.set({ chatHistory: Array.isArray(msg.lines) ? msg.lines.slice(-60) : [] });
  } else if (msg?.type === "tekkie:tool") {
    runTool(String(msg.name), msg.args ?? {}).then(
      (output) => sendResponse({ ok: true, output }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  }
});

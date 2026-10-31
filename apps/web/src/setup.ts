// Setup guide: starts the extension download when the visitor arrives from a download button, detects the
// computer and browser, and walks through installing Tekkie with steps written for that combination.
import { icon } from "./icons";

type OS = "mac" | "windows";
type Browser = "chrome" | "edge" | "brave" | "arc";

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/+$/, "");
const ZIP_URL = `${API_BASE}/downloads/tekkie-extension.zip`;
const STORE_KEY = "tekkie-setup-v1";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// --- What is this visitor using? -------------------------------------------------------------------

interface UAData {
  platform?: string;
  mobile?: boolean;
  brands?: { brand: string }[];
}
const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
const ua = navigator.userAgent;
const platform = (uaData?.platform || navigator.platform || ua).toLowerCase();
const isMobile = Boolean(uaData?.mobile) || /android|iphone|ipad|ipod|mobile/i.test(ua) || (/mac/.test(platform) && navigator.maxTouchPoints > 1);

function detectOS(): OS | null {
  if (/mac|darwin/.test(platform)) return "mac";
  if (/win/.test(platform)) return "windows";
  return null;
}

/** Which Chromium browser, or which unsupported one (so we can say so). */
function detectBrowser(): { browser: Browser; unsupported?: string } {
  if (/Firefox\//.test(ua)) return { browser: "chrome", unsupported: "Firefox" };
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return { browser: "chrome", unsupported: "Safari" };
  if (/Edg\//.test(ua)) return { browser: "edge" };
  if ((navigator as Navigator & { brave?: unknown }).brave) return { browser: "brave" };
  if (getComputedStyle(document.documentElement).getPropertyValue("--arc-palette-title")) return { browser: "arc" };
  return { browser: "chrome" };
}

const BROWSER_NAME: Record<Browser, string> = { chrome: "Chrome", edge: "Edge", brave: "Brave", arc: "Arc" };
const EXT_URL: Record<Browser, string> = { chrome: "chrome://extensions", edge: "edge://extensions", brave: "brave://extensions", arc: "chrome://extensions" };
const MIC_URL: Record<Browser, string> = {
  chrome: "chrome://settings/content/microphone",
  edge: "edge://settings/content/microphone",
  brave: "brave://settings/content/microphone",
  arc: "chrome://settings/content/microphone",
};

// --- The steps ------------------------------------------------------------------------------------

interface Ctx {
  os: OS;
  browser: Browser;
  name: string;
  size: string;
}
interface Step {
  id: string;
  title: (c: Ctx) => string;
  body: (c: Ctx) => string;
  visual?: (c: Ctx) => string;
}

const k = (...keys: string[]) => keys.map((key) => `<kbd>${key}</kbd>`).join("");
const copyAddr = (url: string) =>
  `<div class="mock-addr"><span class="dot"></span><code>${esc(url)}</code><button class="copy-btn" type="button" data-copy="${esc(url)}">Copy</button></div>`;

const STEPS: Step[] = [
  {
    id: "find",
    title: () => "Find the download",
    body: (c) =>
      c.os === "mac"
        ? `<p>Open <b>Finder</b> and go to <b>Downloads</b> (${k("⌥ Option", "⌘ Cmd", "L")}). Or click the download icon in ${c.name}'s toolbar and choose <b>Show in Finder</b>.</p>`
        : `<p>Open <b>File Explorer</b> (${k("Win", "E")}) and go to <b>Downloads</b>. Or click the download icon in ${c.name}'s toolbar and choose <b>Show in folder</b>.</p>`,
    visual: (c) => `<div class="mock-file"><span class="zip"></span><span>tekkie-extension.zip</span><span class="mono" style="color:var(--muted-2)">${esc(c.size)}</span></div>`,
  },
  {
    id: "unzip",
    title: () => "Unzip it",
    body: (c) =>
      c.os === "mac"
        ? `<p>Double-click <code>tekkie-extension.zip</code>. macOS unpacks it into a folder called <code>tekkie-extension</code> right next to the zip.</p>`
        : `<p>Right-click <code>tekkie-extension.zip</code>, choose <b>Extract All…</b>, then click <b>Extract</b>.</p>
           <div class="su-tip"><b>Watch out:</b> Windows puts the files in <code>Downloads\\tekkie-extension\\tekkie-extension</code>. The folder Tekkie needs is the <b>inner</b> one, the folder that has <code>manifest.json</code> directly inside it.</div>`,
    visual: (c) =>
      c.os === "mac"
        ? `<div class="mock-tree"><div>Downloads/</div><div>&nbsp;&nbsp;tekkie-extension.zip</div><div>&nbsp;&nbsp;<span class="hl">tekkie-extension/</span> <span class="ok">this one</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;manifest.json</div></div>`
        : `<div class="mock-tree"><div>Downloads\\</div><div>&nbsp;&nbsp;tekkie-extension.zip</div><div>&nbsp;&nbsp;tekkie-extension\\</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="hl">tekkie-extension\\</span> <span class="ok">this one</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;manifest.json</div></div>`,
  },
  {
    id: "move",
    title: () => "Give it a permanent home",
    body: (c) =>
      `<p>Move that <code>tekkie-extension</code> folder into <b>Documents</b>, or anywhere you won't clear out. ${c.name} loads Tekkie from this folder every time it starts, so deleting the folder removes Tekkie.</p>` +
      (c.os === "mac"
        ? `<p>In Finder, drag the folder onto <b>Documents</b> in the sidebar.</p>`
        : `<p>Select the folder, press ${k("Ctrl", "X")}, open <b>Documents</b> and press ${k("Ctrl", "V")}.</p>`),
  },
  {
    id: "open",
    title: () => "Open the extensions page",
    body: (c) =>
      `<p>Click in ${c.name}'s address bar, paste the address below and press ${c.os === "mac" ? k("Return") : k("Enter")}. Browsers don't let websites open this page for you, so it has to be pasted.</p>`,
    visual: (c) => copyAddr(EXT_URL[c.browser]),
  },
  {
    id: "devmode",
    title: () => "Turn on Developer mode",
    body: (c) =>
      c.browser === "edge"
        ? `<p>Switch on <b>Developer mode</b> in the left sidebar of the Extensions page. On a narrow window, open the menu at the top left first.</p>`
        : `<p>Switch on <b>Developer mode</b> with the toggle in the top-right corner of the page. New buttons appear underneath.</p>`,
    visual: () => `<span class="mock-toggle">Developer mode <span class="sw"></span></span>`,
  },
  {
    id: "load",
    title: () => "Load Tekkie",
    body: (c) =>
      `<p>Click <b>Load unpacked</b>, open the <code>tekkie-extension</code> folder you moved to Documents, and click <b>${c.os === "mac" ? "Select" : "Select Folder"}</b>. Tekkie appears in your list of extensions.</p>`,
    visual: () => `<span class="mock-btns"><span class="hl">Load unpacked</span><span>Pack extension</span><span>Update</span></span>`,
  },
  {
    id: "mic",
    title: () => "Allow the microphone",
    body: (c) =>
      `<p>A Tekkie tab opens by itself. Click <b>Allow</b> when ${c.name} asks to use your microphone. You only do this once.</p>` +
      (c.os === "mac"
        ? `<div class="su-tip">If your Mac still blocks it: <b>System Settings › Privacy &amp; Security › Microphone</b>, then turn on ${c.name}.</div>`
        : `<div class="su-tip">If Windows still blocks it: <b>Settings › Privacy &amp; security › Microphone</b>, then turn on <b>Let desktop apps access your microphone</b>.</div>`),
    visual: () =>
      `<div class="mock-prompt"><span>Tekkie wants to <b>use your microphone</b></span><div class="row"><span>Block</span><span class="hl">Allow</span></div></div>`,
  },
  {
    id: "talk",
    title: () => "Pin Tekkie and say hi",
    body: (c) =>
      `<p>Click the puzzle-piece icon in the toolbar and pin Tekkie so it's one click away. Then open any website and press ${
        c.os === "mac" ? k("⌥ Option", "⇧ Shift", "T") : k("Alt", "Shift", "T")
      } to start talking, or just click Tekkie.</p><p>Headphones work best, so Tekkie doesn't hear itself.</p>`,
    visual: () =>
      `<span class="mock-toolbar"><span class="tb">${icon("star")}</span><span class="tb hl">${icon("puzzle")}</span><span class="tb"><img src="/brand/tekkie-mark.svg" alt="" /></span></span>`,
  },
];

const TROUBLE: { q: string; a: (c: Ctx) => string }[] = [
  {
    q: "It says “Manifest file is missing or unreadable”",
    a: (c) =>
      `<p>You picked a folder one level too high. Click <b>Load unpacked</b> again and choose the <code>tekkie-extension</code> folder that has <code>manifest.json</code> directly inside it.${
        c.os === "windows" ? " On Windows that is usually the inner of the two folders with the same name." : ""
      }</p>`,
  },
  {
    q: "Tekkie says it can't reach the server",
    a: () =>
      `<p>Tekkie's voice server may be waking up, which can take up to a minute. Wait a moment and click Tekkie again. You can check it on the <a href="/status">service status page</a>.</p>`,
  },
  {
    q: "Tekkie can't hear me",
    a: (c) =>
      `<p>Paste <code>${MIC_URL[c.browser]}</code> into the address bar and make sure Tekkie isn't on the blocked list. Then check your ${
        c.os === "mac" ? "Mac's <b>System Settings › Privacy &amp; Security › Microphone</b>" : "<b>Windows Settings › Privacy &amp; security › Microphone</b>"
      }.</p><p>If you use headphones with a microphone, check they are the selected input.</p>`,
  },
  {
    q: "A pop-up asks me to disable developer mode extensions",
    a: (c) => `<p>${c.name} sometimes shows this when it starts. Close it or choose to keep the extension; Tekkie keeps working.</p>`,
  },
  {
    q: "How do I update Tekkie?",
    a: (c) =>
      `<p>Download the latest zip from this page, unzip it, and replace the contents of your <code>tekkie-extension</code> folder. Then open <code>${EXT_URL[c.browser]}</code> and click the reload arrow on Tekkie's card.</p>`,
  },
  {
    q: "How do I remove Tekkie?",
    a: (c) => `<p>Open <code>${EXT_URL[c.browser]}</code>, click <b>Remove</b> on Tekkie's card, then delete the <code>tekkie-extension</code> folder.</p>`,
  },
];

// --- State ----------------------------------------------------------------------------------------

interface Saved {
  os?: OS;
  browser?: Browser;
  done?: string[];
}
function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: progress just won't persist */
  }
}

const detected = detectBrowser();
const detectedOS = detectOS();
const saved = load();
const state = {
  os: saved.os ?? detectedOS ?? "windows",
  browser: saved.browser ?? detected.browser,
  done: new Set(saved.done ?? []),
  size: "",
};
const persist = () => save({ os: state.os, browser: state.browser, done: [...state.done] });

// --- Render ---------------------------------------------------------------------------------------

const stepsEl = $<HTMLOListElement>("steps");
const faqEl = $<HTMLDivElement>("faq");

function ctx(): Ctx {
  return { os: state.os, browser: state.browser, name: BROWSER_NAME[state.browser], size: state.size || "about 0.5 MB" };
}

function renderSteps() {
  const c = ctx();
  stepsEl.innerHTML = STEPS.map((s, i) => {
    const done = state.done.has(s.id);
    return `<li class="su-step${done ? " done" : ""}" id="step-${s.id}" data-step="${s.id}">
      <span class="su-num" aria-hidden="true">${done ? icon("checkmark") : i + 1}</span>
      <div>
        <div class="su-step-head">
          <h3>${s.title(c)}</h3>
          <button class="su-check" type="button" data-toggle="${s.id}" aria-pressed="${done}">${done ? "Done" : "Mark done"}</button>
        </div>
        <div class="su-body">${s.body(c)}</div>
        ${s.visual ? `<div class="su-visual">${s.visual(c)}</div>` : ""}
      </div>
    </li>`;
  }).join("");
  faqEl.innerHTML = TROUBLE.map((t, i) => `<details${i === 0 ? " open" : ""}><summary>${t.q}</summary><div class="ans">${t.a(c)}</div></details>`).join("");
  $("guide-os").textContent = state.os === "mac" ? "Mac" : "Windows";
  document.querySelectorAll<HTMLButtonElement>("[data-os]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.os === state.os)));
  document.querySelectorAll<HTMLButtonElement>("[data-browser]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.browser === state.browser)));
  renderProgress();
}

function renderProgress() {
  const n = STEPS.filter((s) => state.done.has(s.id)).length;
  $("progress-text").textContent = `${n} of ${STEPS.length}`;
  const bar = $("progress-bar");
  bar.setAttribute("aria-valuenow", String(n));
  (bar.firstElementChild as HTMLElement).style.width = `${(n / STEPS.length) * 100}%`;
  $("done").hidden = n < STEPS.length;
}

stepsEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const toggle = target.closest<HTMLButtonElement>("[data-toggle]");
  if (toggle) {
    const id = toggle.dataset.toggle!;
    const marking = !state.done.has(id);
    if (marking) state.done.add(id);
    else state.done.delete(id);
    persist();
    renderSteps();
    if (marking) {
      // Bring the next unfinished step into view.
      const next = STEPS.find((s) => !state.done.has(s.id));
      if (next) document.getElementById(`step-${next.id}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    }
    return;
  }
  const copy = target.closest<HTMLButtonElement>("[data-copy]");
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy ?? "");
      copy.textContent = "Copied";
      copy.classList.add("done");
      setTimeout(() => {
        copy.textContent = "Copy";
        copy.classList.remove("done");
      }, 1500);
    } catch {
      /* clipboard blocked: the address is visible to copy by hand */
    }
  }
});

document.querySelectorAll<HTMLButtonElement>("[data-os]").forEach((b) =>
  b.addEventListener("click", () => {
    state.os = b.dataset.os as OS;
    persist();
    renderSteps();
  }),
);
document.querySelectorAll<HTMLButtonElement>("[data-browser]").forEach((b) =>
  b.addEventListener("click", () => {
    state.browser = b.dataset.browser as Browser;
    persist();
    renderSteps();
  }),
);
$("reset").addEventListener("click", () => {
  state.done.clear();
  persist();
  renderSteps();
  document.getElementById("step-find")?.scrollIntoView({ block: "center" });
});

// What we detected, in words.
$("detected").textContent =
  detectedOS && !detected.unsupported
    ? `We spotted ${BROWSER_NAME[detected.browser]} on ${detectedOS === "mac" ? "a Mac" : "Windows"}. Switch if that's wrong.`
    : "Pick your computer and browser.";

// Notices: phones, and browsers that can't run Chrome extensions.
const notice = $("notice");
if (isMobile) {
  notice.hidden = false;
  notice.innerHTML = `<span class="ni">${icon("alert")}</span><div><strong>Tekkie runs on a computer.</strong> Open this page on your Mac or Windows PC to install it. You can still read the steps here.</div>`;
} else if (detected.unsupported) {
  notice.hidden = false;
  notice.innerHTML = `<span class="ni">${icon("alert")}</span><div><strong>${detected.unsupported} can't run Tekkie.</strong> Open this page in Chrome, Edge, Brave or Arc to install it. The steps below use Chrome.</div>`;
}

// --- Download -------------------------------------------------------------------------------------

document.querySelectorAll<HTMLAnchorElement>("a[data-zip]").forEach((a) => (a.href = ZIP_URL));
document.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon ?? "")));

fetch(`${API_BASE}/downloads/tekkie-extension.json`)
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((info: { version: string; bytes: number }) => {
    state.size = `${(info.bytes / 1024 / 1024).toFixed(1)} MB`;
    $("file-meta").textContent = `Chrome extension · v${info.version} · ${state.size}`;
    renderSteps();
  })
  .catch(() => {
    /* keep the generic label */
  });

// Arriving from a download button (?download=1): start the download here, once, then tidy the URL so a
// refresh doesn't download it again. Phones get the guide but no download.
const params = new URLSearchParams(location.search);
if (params.has("download")) {
  history.replaceState(null, "", location.pathname + location.hash);
  if (!isMobile) {
    $("hero-eyebrow").textContent = "DOWNLOAD STARTED";
    $("hero-title").innerHTML = "Almost There. <em>Let's Set Up Tekkie.</em>";
    $("hero-lead").textContent = "Your download is on its way. Follow the steps below for your computer; it takes about two minutes.";
    $("started").hidden = false;
    setTimeout(() => (location.href = ZIP_URL), 500);
  }
}

// Mobile menu, as on the home page.
const menu = $("menu");
const links = $("links");
menu.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  menu.setAttribute("aria-expanded", String(open));
});
links.addEventListener("click", (e) => {
  if ((e.target as Element).closest("a")) {
    links.classList.remove("open");
    menu.setAttribute("aria-expanded", "false");
  }
});

renderSteps();

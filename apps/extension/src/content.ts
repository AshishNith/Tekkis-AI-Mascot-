// Injects Tekkie into every page. The widget itself lives in an extension-origin iframe so the
// microphone permission is granted once for the extension instead of once per website.
// This script only owns the iframe's position and size, and forwards the pointer so Tekkie's eyes follow it.

import { runAction } from "./control/dom-actions";

const MARGIN = 16;
const POSITION_KEY = "position";
const FRAME_URL = chrome.runtime.getURL("widget.html");

let frame: HTMLIFrameElement | undefined;
let size = { w: 260, h: 320 };
let pos: { x: number; b: number } | undefined; // left / bottom offsets in px

function clamp() {
  const x = pos?.x ?? window.innerWidth;
  const b = pos?.b ?? 0;
  pos = {
    x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, window.innerWidth - size.w - MARGIN)),
    b: Math.min(Math.max(MARGIN, b), Math.max(MARGIN, window.innerHeight - size.h - MARGIN)),
  };
}

function apply() {
  if (!frame) return;
  clamp();
  frame.style.setProperty("left", `${pos!.x}px`, "important");
  frame.style.setProperty("bottom", `${pos!.b}px`, "important");
  frame.style.setProperty("width", `${size.w}px`, "important");
  frame.style.setProperty("height", `${size.h}px`, "important");
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function onFrameMessage(e: MessageEvent) {
  if (!frame || e.source !== frame.contentWindow) return;
  const msg = e.data as { tekkie?: boolean; type?: string; dx?: number; dy?: number; w?: number; h?: number };
  if (!msg?.tekkie) return;
  if (msg.type === "resize" && finite(msg.w) && finite(msg.h)) {
    size = { w: Math.min(Math.max(msg.w, 1), 600), h: Math.min(Math.max(msg.h, 1), 800) };
    apply();
  } else if (msg.type === "move" && finite(msg.dx) && finite(msg.dy) && pos) {
    pos = { x: pos.x + msg.dx, b: pos.b - msg.dy };
    apply();
  } else if (msg.type === "settle" && pos) {
    void chrome.storage.local.set({ [POSITION_KEY]: pos });
  } else if (msg.type === "mic-blocked") {
    void chrome.runtime.sendMessage({ type: "tekkie:open-mic-setup" });
  }
}

let lastPointer: PointerEvent | undefined;
let pointerQueued = false;
function onPointerMove(e: PointerEvent) {
  lastPointer = e;
  if (pointerQueued) return;
  pointerQueued = true;
  requestAnimationFrame(() => {
    pointerQueued = false;
    if (!frame || !lastPointer) return;
    const r = frame.getBoundingClientRect();
    frame.contentWindow?.postMessage(
      { tekkie: true, type: "pointer", x: lastPointer.clientX - r.left, y: lastPointer.clientY - r.top },
      FRAME_URL,
    );
  });
}

async function mount() {
  if (frame || !document.body) return;
  const saved = (await chrome.storage.local.get(POSITION_KEY))[POSITION_KEY] as typeof pos;
  if (finite(saved?.x) && finite(saved?.b)) pos = saved;
  if (frame) return; // mounted while we were reading storage

  frame = document.createElement("iframe");
  frame.src = FRAME_URL;
  frame.allow = "microphone";
  frame.title = "Tekkie assistant";
  frame.setAttribute("data-tekkie", "");
  // The page can't restyle this, and a differing color-scheme would give the iframe an opaque backdrop.
  const fixed: Record<string, string> = {
    position: "fixed",
    border: "0",
    margin: "0",
    padding: "0",
    background: "transparent",
    "color-scheme": "normal",
    "z-index": "2147483647",
  };
  for (const [k, v] of Object.entries(fixed)) frame.style.setProperty(k, v, "important");
  apply();
  document.body.appendChild(frame);

  window.addEventListener("message", onFrameMessage);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("resize", apply);
}

function unmount() {
  frame?.remove();
  frame = undefined;
  window.removeEventListener("message", onFrameMessage);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("resize", apply);
}

// Browser control: the background worker relays the model's tool calls here.
chrome.runtime.onMessage.addListener((msg: { type?: string; name?: string; args?: Record<string, unknown> }, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || msg?.type !== "tekkie:act") return;
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
  if (area !== "local" || !changes.enabled) return;
  if (changes.enabled.newValue === false) unmount();
  else void mount();
});

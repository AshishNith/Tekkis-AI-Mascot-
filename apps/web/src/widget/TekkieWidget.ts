import { TekkieCharacter } from "../mascot/TekkieCharacter";
import { DEFAULT_SKIN, type Skin } from "../mascot/skins";
import type { VoiceController, VoiceState } from "../voice/LiveVoiceSession";
import { WIDGET_CSS } from "./styles";

export interface TekkieOptions {
  skin?: Skin;
  /** The voice conversation this widget controls (in-page, or a remote one in the extension). */
  voice: VoiceController;
  /** Where the dragged position is kept. Defaults to this site's localStorage. */
  storage?: { get(): Promise<{ x: number; b: number } | null>; set(pos: { x: number; b: number }): void; clear(): void };
  /** Called when the browser blocks the microphone. */
  onMicBlocked?: () => void;
  /** Asked once at start-up: return false to skip the wave and greeting (e.g. a page reload mid-conversation). */
  shouldGreet?: () => Promise<boolean>;
  /**
   * Set when Tekkie runs inside the Chrome extension's iframe. The host page then owns the
   * widget's position and size, and this callback set reports drags and size changes to it.
   */
  frame?: {
    move(dx: number, dy: number): void;
    settle(): void;
    resize(width: number, height: number): void;
    micBlocked(): void;
  };
}

const STATUS: Record<VoiceState, string> = {
  idle: "Talk",
  connecting: "Connecting…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Talking…",
  error: "Try again",
};

const POSITION_KEY = "tekkie:position:v1";
const MARGIN = 16;

/** Mounts the floating Tekkie mascot on the page. Returns controls for the host page. */
export function mountTekkie(options: TekkieOptions) {
  const host = document.createElement("div");
  host.setAttribute("data-tekkie", "");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>${WIDGET_CSS}</style>
    <div class="tekkie" role="complementary" aria-label="Tekkie assistant">
      <div class="bubble" aria-live="polite"><div class="you"></div><div class="said"></div></div>
      <div class="stage" title="Drag me around · tap to talk"><canvas></canvas></div>
      <div class="controls">
        <button class="talk" type="button"><span class="dot"></span><span class="label">Talk</span></button>
        <button class="icon keyboard" type="button" aria-label="Type a message" title="Type instead">⌨</button>
      </div>
      <form class="type"><input type="text" placeholder="Say something to Tekkie…" aria-label="Message" /><button type="submit">Send</button></form>
    </div>`;
  document.body.appendChild(host);
  const frame = options.frame;

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const box = $<HTMLDivElement>(".tekkie");
  const bubble = $<HTMLDivElement>(".bubble");
  const youEl = $<HTMLDivElement>(".you");
  const saidEl = $<HTMLDivElement>(".said");
  const stage = $<HTMLDivElement>(".stage");
  const talkBtn = $<HTMLButtonElement>(".talk");
  const talkLabel = $<HTMLSpanElement>(".talk .label");
  const typeForm = $<HTMLFormElement>("form.type");
  const typeInput = $<HTMLInputElement>("form.type input");

  const character = new TekkieCharacter($<HTMLCanvasElement>("canvas"));
  character.setSkin(options.skin ?? DEFAULT_SKIN);
  const voice: VoiceController = options.voice;

  // --- Speech bubble -------------------------------------------------------
  let hideTimer = 0;
  function say(text: string, opts: { you?: string; error?: boolean; sticky?: boolean } = {}) {
    if (opts.you !== undefined) youEl.textContent = opts.you ? `You: ${opts.you}` : "";
    saidEl.textContent = text;
    bubble.classList.toggle("error", Boolean(opts.error));
    bubble.classList.add("show");
    clearTimeout(hideTimer);
    if (!opts.sticky) hideTimer = window.setTimeout(() => bubble.classList.remove("show"), 7000);
  }

  let lastUserLine = "";
  let previousState: VoiceState = "idle";
  voice.on("caption", (who, text, final) => {
    if (who === "user") {
      lastUserLine = text;
      say(final ? "…" : "", { you: text, sticky: true });
    } else {
      say(text, { you: lastUserLine, sticky: !final });
    }
  });
  voice.on("error", (message) => {
    say(message, { error: true, you: "" });
    if (message.startsWith("Microphone access")) (options.onMicBlocked ?? frame?.micBlocked)?.();
  });
  voice.on("state", (state) => {
    character.setState(state);
    talkLabel.textContent = voice.active ? (state === "listening" ? "Listening… (stop)" : STATUS[state]) : STATUS[state];
    talkBtn.classList.toggle("live", voice.active);
    talkBtn.setAttribute("aria-pressed", String(voice.active));
    // Only greet a conversation that is just starting, not one picked back up after a page load.
    if (state === "listening" && previousState === "connecting" && !lastUserLine) say("Hey! I'm Tekkie. What's up?", { you: "" });
    if (state === "idle") lastUserLine = "";
    previousState = state;
  });

  function toggleVoice() {
    if (voice.active) voice.stop();
    else void voice.start();
  }
  talkBtn.addEventListener("click", toggleVoice);

  $<HTMLButtonElement>(".keyboard").addEventListener("click", () => {
    typeForm.classList.toggle("open");
    if (typeForm.classList.contains("open")) typeInput.focus();
  });
  typeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = typeInput.value.trim();
    if (!text) return;
    typeInput.value = "";
    if (!voice.active) await voice.start();
    voice.sendText(text);
  });

  // --- Position & dragging -------------------------------------------------
  // Anchored by its bottom edge so the speech bubble grows upward, never off-screen.
  let pos = { x: 0, b: 0 };
  function place(x: number, b: number) {
    if (frame) return;
    pos = {
      x: Math.min(Math.max(MARGIN, x), window.innerWidth - box.offsetWidth - MARGIN),
      b: Math.min(Math.max(MARGIN, b), window.innerHeight - box.offsetHeight - MARGIN),
    };
    box.style.left = `${pos.x}px`;
    box.style.bottom = `${pos.b}px`;
  }
  if (frame) {
    // The iframe is exactly as big as Tekkie; the host page moves it.
    box.style.left = "0";
    box.style.bottom = "0";
    box.style.width = "260px";
    box.classList.add("embedded");
    new ResizeObserver(() => frame.resize(box.offsetWidth, box.offsetHeight)).observe(box);
  } else if (options.storage) {
    place(window.innerWidth, 0); // bottom-right until the saved spot loads
    void options.storage.get().then((saved) => saved && place(saved.x, saved.b));
  } else {
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null");
      if (saved) place(saved.x, saved.b);
      else throw 0;
    } catch {
      place(window.innerWidth, 0); // bottom-right after clamping
    }
  }
  window.addEventListener("resize", () => place(pos.x, pos.b));
  if (!frame) new ResizeObserver(() => place(pos.x, pos.b)).observe(box);

  let drag: { dx: number; db: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null = null;
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    drag = { dx: e.clientX - pos.x, db: window.innerHeight - e.clientY - pos.b, startX: e.clientX, startY: e.clientY, lastX: e.screenX, lastY: e.screenY, moved: false };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6) drag.moved = true;
    if (!drag.moved) return;
    if (frame) {
      // Screen coordinates stay put while the host moves the iframe under the pointer.
      frame.move(e.screenX - drag.lastX, e.screenY - drag.lastY);
      drag.lastX = e.screenX;
      drag.lastY = e.screenY;
    } else {
      place(e.clientX - drag.dx, window.innerHeight - e.clientY - drag.db);
    }
  });
  stage.addEventListener("pointercancel", () => {
    drag = null;
  });
  stage.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.moved && frame) {
      frame.settle();
    } else if (drag.moved && options.storage) {
      options.storage.set(pos);
    } else if (drag.moved) {
      try {
        localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
      } catch {
        /* storage unavailable: position just won't persist */
      }
    } else {
      character.poke();
      if (!voice.active) void voice.start();
    }
    drag = null;
  });

  // Tekkie keeps an eye on the pointer anywhere on the page.
  function lookAtPoint(x: number, y: number) {
    const r = stage.getBoundingClientRect();
    character.lookAt((x - (r.left + r.width / 2)) / 500, -(y - (r.top + r.height * 0.4)) / 400);
  }
  window.addEventListener("pointermove", (e) => lookAtPoint(e.clientX, e.clientY));

  // --- Render loop -----------------------------------------------------------
  const sizeCanvas = () => character.resize(stage.clientWidth, stage.clientHeight);
  new ResizeObserver(sizeCanvas).observe(stage);
  sizeCanvas();

  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    character.setLevels(voice.outputLevel, voice.inputLevel);
    character.update((now - last) / 1000);
    last = now;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  setTimeout(async () => {
    if (options.shouldGreet && !(await options.shouldGreet())) return;
    character.wave();
    say("Hi, I'm Tekkie! Tap me or press Talk to chat.");
  }, 600);

  return {
    /** For the extension: the pointer position (in this frame's coordinates) when it is outside the frame. */
    lookAtPoint,
    setSkin: (skin: Skin) => character.setSkin(skin),
    wave: () => character.wave(),
    setPosition: (p: { x: number; b: number }) => place(p.x, p.b),
    /** Brings Tekkie back to the default corner. */
    resetPosition() {
      options.storage?.clear();
      place(window.innerWidth, 0);
    },
    start: () => voice.start(),
    stop: () => voice.stop(),
    destroy() {
      voice.stop();
      cancelAnimationFrame(raf);
      character.dispose();
      host.remove();
    },
  };
}

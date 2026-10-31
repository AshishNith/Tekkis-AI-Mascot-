import { EMOTES, FORMS, TekkieCharacter, type Emote, type FormKind } from "../mascot/TekkieCharacter";
import { DEFAULT_SKIN, SKINS, type Accessory, type Skin } from "../mascot/skins";
import { Chirps } from "../mascot/sounds";
import type { HistoryLine, TaskPlan, VoiceController, VoiceState } from "../voice/LiveVoiceSession";
import { applyCare, decay, levelOf, newCare, touchStreak, XP_PER_LEVEL, type CareAction, type CareState } from "./care";
import { GAMES, startGame, type GameId } from "./games";
import { WIDGET_CSS } from "./styles";

/** A tiny async key-value store, so the host decides where things live (chrome.storage, localStorage...). */
export interface Store<T> {
  get(): Promise<T | null>;
  set(value: T): void;
  clear(): void;
}

export interface TekkieOptions {
  skin?: Skin;
  /** Which body to wear (robot by default). "glb" waits for loadModel(). */
  form?: FormKind;
  /** A hat or outfit on top of the skin. */
  accessory?: Accessory | null;
  /** Little chirps for feelings (on by default). */
  sounds?: boolean;
  /** Idle fidgets: looking around, stretching, yawning (on by default). */
  fidgets?: boolean;
  /** The user picked another body from Tekkie's hover menu (persist it). */
  onFormChange?: (form: FormKind) => void;
  /** The voice conversation this widget controls (in-page, or a remote one in the extension). */
  voice: VoiceController;
  /** Where the dragged position is kept. Defaults to this site's localStorage. */
  storage?: Store<{ x: number; b: number }>;
  /** Where Tekkie's food / mood / energy / bond points are kept. Defaults to this site's localStorage. */
  care?: Store<CareState>;
  /** Size multiplier (0.7 – 1.4). */
  scale?: number;
  /** Which bottom corner Tekkie starts in. */
  corner?: "left" | "right";
  /** Called when the browser blocks the microphone. */
  onMicBlocked?: () => void;
  /** Asked once at start-up: return false to skip the wave and greeting (e.g. a page reload mid-conversation). */
  shouldGreet?: () => Promise<boolean>;
}

const STATUS: Record<VoiceState, string> = {
  idle: "Talk",
  connecting: "Connecting…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Talking…",
  error: "Try again",
};

const MARGIN = 16;
const SLEEP_AFTER_S = 90;
const PERCH_SEAT_PX = 53; // from the bottom of the stage to Tekkie's seat when sitting

function localStore<T>(key: string): Store<T> {
  return {
    get: async () => {
      try {
        return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
      } catch {
        return null;
      }
    },
    set: (v) => {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage unavailable: just won't persist */
      }
    },
    clear: () => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* nothing to clear */
      }
    },
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Mounts the floating Tekkie mascot on the page. Returns controls for the host page. */
export function mountTekkie(options: TekkieOptions) {
  const host = document.createElement("div");
  host.setAttribute("data-tekkie", "");
  const root = host.attachShadow({ mode: "open" });
  const chip = (act: string, icon: string, label: string, pressed?: boolean) =>
    `<button class="chip" type="button" data-act="${act}" title="${label}" aria-label="${label}"${pressed === undefined ? "" : ` aria-pressed="${pressed}"`}>${icon}</button>`;
  root.innerHTML = `
    <style>${WIDGET_CSS}</style>
    <div class="tekkie" role="complementary" aria-label="Tekkie assistant">
      <div class="scale">
        <section class="panel" aria-live="polite">
          <header><span class="panel-title"></span><button type="button" class="panel-close" aria-label="Close">×</button></header>
          <div class="panel-body"></div>
        </section>
        <div class="bubble" aria-live="polite"><div class="you"></div><div class="said"></div><div class="act"></div></div>
        <div class="stagewrap">
          <div class="stage" title="Drag me · tap to talk · rub me to pet · hold Alt+T to talk"><canvas></canvas></div>
          <div class="zz" aria-hidden="true">z<span>z</span><span>z</span></div>
          <div class="tray left" role="menu" aria-label="Tekkie options">
            ${chip("talk", "🎙", "Talk")}${chip("screen", "👀", "What's on my screen?")}${chip("history", "📜", "Chat history")}${chip("games", "🎮", "Play a game")}
          </div>
          <div class="tray right" role="menu" aria-label="Tekkie behaviour">
            ${chip("care", "🍪", "Look after Tekkie")}${chip("dance", "💃", "Dance!")}${chip("look", "🎭", "Change body")}${chip("follow", "🐾", "Follow my cursor", false)}${chip("wander", "🚶", "Walk and climb on its own", true)}
          </div>
        </div>
        <div class="controls">
          <button class="talk" type="button" title="Talk (or hold Alt+T)"><span class="dot"></span><span class="label">Talk</span></button>
          <button class="icon keyboard" type="button" aria-label="Type a message" title="Type instead">⌨</button>
        </div>
        <form class="type"><input type="text" placeholder="Say something to Tekkie…" aria-label="Message" /><button type="submit">Send</button></form>
      </div>
    </div>`;
  document.body.appendChild(host);

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const box = $<HTMLDivElement>(".tekkie");
  const scaler = $<HTMLDivElement>(".scale");
  const panel = $<HTMLElement>(".panel");
  const panelTitle = $<HTMLSpanElement>(".panel-title");
  const panelBody = $<HTMLDivElement>(".panel-body");
  const bubble = $<HTMLDivElement>(".bubble");
  const youEl = $<HTMLDivElement>(".you");
  const saidEl = $<HTMLDivElement>(".said");
  const actEl = $<HTMLDivElement>(".act");
  const stage = $<HTMLDivElement>(".stage");
  const stageWrap = $<HTMLDivElement>(".stagewrap");
  const talkBtn = $<HTMLButtonElement>(".talk");
  const talkLabel = $<HTMLSpanElement>(".talk .label");
  const typeForm = $<HTMLFormElement>("form.type");
  const typeInput = $<HTMLInputElement>("form.type input");

  const character = new TekkieCharacter($<HTMLCanvasElement>("canvas"), options.form && options.form !== "glb" ? options.form : "robot");
  character.setSkin(options.skin ?? DEFAULT_SKIN);
  character.setAccessory(options.accessory ?? null);
  character.fidgets = options.fidgets !== false;

  // Sounds: tiny synth chirps, unlocked by the first thing the user does on the page.
  const chirps = new Chirps();
  chirps.enabled = options.sounds !== false;
  const unlockAudio = () => chirps.unlock();
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
  character.onEmote = (kind, idle) => {
    if (!idle || kind === "yawn") chirps.play(kind);
  };
  const voice: VoiceController = options.voice;
  const positionStore = options.storage ?? localStore<{ x: number; b: number }>("tekkie:position:v1");
  const careStore = options.care ?? localStore<CareState>("tekkie:care:v1");
  let corner = options.corner ?? "right";
  let lastActivity = performance.now();
  const wake = () => {
    lastActivity = performance.now();
  };

  // --- Speech bubble -------------------------------------------------------
  let hideTimer = 0;
  function say(text: string, opts: { you?: string; error?: boolean; sticky?: boolean; action?: { label: string; run: () => void } } = {}) {
    if (opts.you !== undefined) youEl.textContent = opts.you ? `You: ${opts.you}` : "";
    saidEl.textContent = text;
    actEl.innerHTML = "";
    if (opts.action) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "small";
      b.textContent = opts.action.label;
      b.addEventListener("click", () => {
        bubble.classList.remove("show");
        opts.action!.run();
      });
      actEl.appendChild(b);
    }
    bubble.classList.toggle("error", Boolean(opts.error));
    bubble.classList.add("show");
    keepOnScreen(bubble);
    clearTimeout(hideTimer);
    if (!opts.sticky) hideTimer = window.setTimeout(() => bubble.classList.remove("show"), 7000);
  }

  // --- Conversation ----------------------------------------------------------------------------
  let history: HistoryLine[] = [];
  let plan: TaskPlan | null = null;
  let lastUserLine = "";
  let previousState: VoiceState = "idle";
  voice.on("caption", (who, text, final) => {
    wake();
    if (who === "user") {
      lastUserLine = text;
      say(final ? "…" : "", { you: text, sticky: true });
    } else {
      say(text, { you: lastUserLine, sticky: !final });
    }
    if (final && text.trim()) {
      history.push({ who, text, at: Date.now() });
      if (history.length > 200) history = history.slice(-200);
      if (openPanelId === "history") renderHistory();
    }
  });
  voice.on("history", (lines) => {
    history = lines.slice(-200);
    if (openPanelId === "history") renderHistory();
  });
  voice.on("emote", (kind) => {
    if ((EMOTES as string[]).includes(kind)) character.emote(kind as Emote);
  });
  voice.on("plan", (p) => {
    plan = p;
    if (p) openPanel("plan");
    else if (openPanelId === "plan") closePanel();
    if (openPanelId === "plan") renderPlan();
    // A finished job deserves a little party.
    if (p?.steps.length && p.steps.every((s) => s.status === "done")) {
      character.emote("celebrate");
      setTimeout(() => openPanelId === "plan" && plan === p && closePanel(), 8000);
    }
  });
  voice.on("error", (message) => {
    say(message, { error: true, you: "" });
    if (message.startsWith("Microphone access")) options.onMicBlocked?.();
  });
  voice.on("state", (state) => {
    if (state !== "idle") wake();
    character.setState(state);
    talkLabel.textContent = voice.active ? (state === "listening" ? (micHeld === false ? "Hold Alt+T to talk" : "Listening… (stop)") : STATUS[state]) : STATUS[state];
    talkBtn.classList.toggle("live", voice.active);
    talkBtn.setAttribute("aria-pressed", String(voice.active));
    // Only greet a conversation that is just starting, not one picked back up after a page load.
    if (state === "listening" && previousState === "connecting" && !lastUserLine && micHeld === null) say("Hey! I'm Tekkie. What's up?", { you: "" });
    if (state === "idle") {
      lastUserLine = "";
      micHeld = null;
    }
    previousState = state;
    syncChips();
  });

  function toggleVoice() {
    micHeld = null;
    voice.setMicMuted?.(false);
    if (voice.active) voice.stop();
    else void voice.start();
  }
  talkBtn.addEventListener("click", toggleVoice);

  // Hold-to-talk: hold Alt+T to speak; on release the mic is muted so Tekkie can answer.
  // null = normal open mic, true = held, false = released (muted).
  let micHeld: boolean | null = null;
  window.addEventListener("keydown", (e) => {
    if (!(e.altKey && e.code === "KeyT") || e.repeat) return;
    e.preventDefault();
    wake();
    micHeld = true;
    voice.setMicMuted?.(false);
    if (!voice.active) void voice.start();
    say("I'm listening…", { you: "" });
  });
  window.addEventListener("keyup", (e) => {
    if (micHeld !== true || (e.code !== "KeyT" && e.key !== "Alt")) return;
    micHeld = false;
    voice.setMicMuted?.(true);
    if (voice.active) talkLabel.textContent = "Hold Alt+T to talk";
  });

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
  // Anchored by its bottom edge so the speech bubble and panels grow upward, never off-screen.
  let pos = { x: 0, b: 0 };
  function place(x: number, b: number) {
    pos = {
      x: Math.min(Math.max(MARGIN, x), window.innerWidth - box.offsetWidth - MARGIN),
      b: Math.min(Math.max(MARGIN, b), window.innerHeight - box.offsetHeight - MARGIN),
    };
    box.style.left = `${pos.x}px`;
    box.style.bottom = `${pos.b}px`;
    keepOnScreen(panel);
    keepOnScreen(bubble);
  }
  /** The panel and bubble are wider than Tekkie: slide them sideways so they never hang off the screen. */
  function keepOnScreen(el: HTMLElement) {
    el.style.translate = "";
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const zoom = Number(scaler.style.zoom) || 1;
    const shift = r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : r.left < 8 ? 8 - r.left : 0;
    if (shift) el.style.translate = `${shift / zoom}px 0`;
  }
  const cornerX = () => (corner === "left" ? 0 : window.innerWidth);
  function setScale(scale: number) {
    scaler.style.zoom = String(Math.min(1.4, Math.max(0.7, scale)));
    place(pos.x, pos.b);
  }
  setScale(options.scale ?? 1);
  place(cornerX(), 0); // until the saved spot loads
  void positionStore.get().then((saved) => saved && place(saved.x, saved.b));
  window.addEventListener("resize", () => place(pos.x, pos.b));
  new ResizeObserver(() => place(pos.x, pos.b)).observe(box);

  let drag: { dx: number; db: number; startX: number; startY: number; moved: boolean } | null = null;
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    drag = { dx: e.clientX - pos.x, db: window.innerHeight - e.clientY - pos.b, startX: e.clientX, startY: e.clientY, moved: false };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6) {
      drag.moved = true;
      leavePerch();
    }
    if (drag.moved) place(e.clientX - drag.dx, window.innerHeight - e.clientY - drag.db);
  });
  stage.addEventListener("pointercancel", () => {
    drag = null;
  });
  stage.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.moved) positionStore.set(pos);
    else if (catchGame) catchGame.caught();
    else {
      character.poke();
      if (sleeping) wakeUp();
      else if (!voice.active) toggleVoice();
    }
    drag = null;
  });

  // Tekkie keeps an eye on the pointer anywhere on the page, or glances at something for a moment.
  let pointer = { x: -1, y: -1 };
  let glance: { x: number; y: number; until: number } | null = null;
  function lookAtPoint(x: number, y: number) {
    const r = stage.getBoundingClientRect();
    character.lookAt((x - (r.left + r.width / 2)) / 500, -(y - (r.top + r.height * 0.4)) / 400);
  }
  function glanceAt(el: Element, seconds = 2.5) {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    glance = { x: r.left + Math.min(r.width / 2, 120), y: r.top + r.height / 2, until: performance.now() + seconds * 1000 };
    lookAtPoint(glance.x, glance.y);
  }
  window.addEventListener("pointermove", (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (glance && performance.now() < glance.until) {
      if (Math.hypot(e.clientX - glance.x, e.clientY - glance.y) < 160) return; // still near what it's looking at
      glance = null;
    }
    lookAtPoint(e.clientX, e.clientY);
    wake(); // the user is around: no napping
  });
  // Typing and scrolling count as being around too.
  window.addEventListener("keydown", wake, { passive: true });
  window.addEventListener("scroll", wake, { passive: true });
  // Watches what you're typing into (politely, from a distance).
  window.addEventListener("focusin", (e) => {
    const el = e.target as Element | null;
    if (!el || el.closest("[data-tekkie]") || host.contains(el)) return;
    if (el.matches("input, textarea, select, [contenteditable]")) glanceAt(el, 4);
  });
  // A fast scroll makes Tekkie grab its hat.
  let lastScroll = { y: window.scrollY, at: performance.now() };
  let scrollCooldown = 0;
  window.addEventListener(
    "scroll",
    () => {
      const now = performance.now();
      const dy = Math.abs(window.scrollY - lastScroll.y);
      if (now - lastScroll.at < 300 && dy > 1400 && now > scrollCooldown) {
        scrollCooldown = now + 15_000;
        character.emote("surprised", true);
      }
      lastScroll = { y: window.scrollY, at: now };
    },
    { passive: true },
  );
  // Highlight a chunk of text and Tekkie offers to help with it.
  let selectionTimer = 0;
  let selectionCooldown = 0;
  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(() => {
      const sel = getSelection();
      const text = sel?.toString().trim() ?? "";
      if (text.length < 120 || performance.now() < selectionCooldown || voice.active) return;
      const node = sel?.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      if (!el || el.closest("[data-tekkie]")) return;
      selectionCooldown = performance.now() + 30_000;
      glanceAt(el, 3);
      character.emote("think", true);
      say("Want me to go through what you've highlighted?", {
        you: "",
        action: {
          label: "Summarize it",
          run: async () => {
            if (!voice.active) await voice.start();
            voice.sendText("Summarize the text I've highlighted on this page, briefly.");
          },
        },
      });
    }, 700);
  });

  // Rubbing the pointer back and forth over Tekkie pets it.
  let rub = { dir: 0, flips: 0, since: 0, lastX: 0 };
  let petCooldown = 0;
  stage.addEventListener("pointermove", (e) => {
    if (drag) return;
    const dir = Math.sign(e.clientX - rub.lastX);
    rub.lastX = e.clientX;
    if (!dir) return;
    const now = performance.now();
    if (now - rub.since > 1400) rub = { dir, flips: 0, since: now, lastX: e.clientX };
    if (dir !== rub.dir) {
      rub.dir = dir;
      rub.flips++;
    }
    if (rub.flips >= 5 && now > petCooldown) {
      petCooldown = now + 6000;
      rub.flips = 0;
      character.emote("love");
      say(["Hehe, that tickles!", "Aww, thank you!", "I like that!"][Math.floor(Math.random() * 3)]);
      void care("pet");
    }
  });

  // --- Hover options -------------------------------------------------------------------------
  const PREFS_KEY = "tekkie:prefs:v1";
  const prefs = { wander: true, follow: false };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}"));
  } catch {
    /* storage unavailable: defaults */
  }
  const chips = [...root.querySelectorAll<HTMLButtonElement>(".chip")];
  function syncChips() {
    for (const c of chips) {
      const act = c.dataset.act;
      if (act === "follow" || act === "wander") c.setAttribute("aria-pressed", String(prefs[act]));
      if (act === "talk") c.classList.toggle("live", voice.active);
      c.classList.toggle("on", act === openPanelId);
    }
  }
  function savePrefs() {
    syncChips();
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: just won't persist */
    }
  }

  let hovering = false;
  let hoverTimer = 0;
  function setHover(on: boolean) {
    hovering = on;
    character.setHover(on);
    stageWrap.classList.toggle("open", on);
    box.classList.toggle("hovering", on);
  }
  // Hovering Tekkie, its chips or the Talk / type buttons keeps everything open.
  for (const el of [stageWrap, $<HTMLDivElement>(".controls"), typeForm]) {
    el.addEventListener("pointerenter", () => {
      clearTimeout(hoverTimer);
      setHover(true);
    });
    el.addEventListener("pointerleave", () => {
      clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => setHover(false), 700); // time to reach a chip or button
    });
  }

  stageWrap.addEventListener("click", (e) => {
    const c = (e.target as Element).closest<HTMLButtonElement>("button[data-act]");
    if (!c) return;
    wake();
    switch (c.dataset.act) {
      case "talk":
        toggleVoice();
        break;
      case "screen":
        void (async () => {
          if (!voice.active) await voice.start();
          voice.sendText("Look at my screen and tell me what you see.");
        })();
        break;
      case "history":
      case "games":
      case "care":
        togglePanel(c.dataset.act);
        break;
      case "dance":
        character.dance();
        break;
      case "look": {
        const ids = FORMS.map((f) => f.id);
        const next = ids[(Math.max(0, ids.indexOf(character.currentForm)) + 1) % ids.length];
        character.setForm(next);
        chirps.play("pop");
        say(`Ta-da! I'm a ${FORMS.find((f) => f.id === next)!.name.toLowerCase()} now.`);
        options.onFormChange?.(next);
        break;
      }
      case "follow":
        prefs.follow = !prefs.follow;
        if (prefs.follow) leavePerch();
        say(prefs.follow ? "Okay, I'll stick with you!" : "Okay, I'll stay here.");
        savePrefs();
        break;
      case "wander":
        prefs.wander = !prefs.wander;
        say(prefs.wander ? "Time to explore!" : "I'll stay put.");
        savePrefs();
        break;
    }
  });

  // --- Panels: history, plan, games, care -----------------------------------------------------
  type PanelId = "history" | "plan" | "games" | "care";
  let openPanelId: PanelId | null = null;
  const TITLES: Record<PanelId, string> = { history: "Chat history", plan: "Plan", games: "Games", care: "Look after Tekkie" };
  function openPanel(id: PanelId) {
    openPanelId = id;
    panelTitle.textContent = TITLES[id];
    panel.classList.add("show");
    requestAnimationFrame(() => keepOnScreen(panel));
    if (id === "history") renderHistory();
    else if (id === "plan") renderPlan();
    else if (id === "games") renderGames();
    else void renderCare();
    syncChips();
  }
  function closePanel() {
    openPanelId = null;
    panel.classList.remove("show");
    catchGame?.stop();
    syncChips();
  }
  function togglePanel(id: PanelId) {
    if (openPanelId === id) closePanel();
    else openPanel(id);
  }
  $<HTMLButtonElement>(".panel-close").addEventListener("click", closePanel);

  async function copy(text: string, btn: HTMLButtonElement) {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Can't copy here";
    }
    setTimeout(() => (btn.textContent = btn.dataset.label ?? "Copy"), 1500);
  }

  function renderHistory() {
    if (!history.length) {
      panelBody.innerHTML = `<p class="muted">Nothing yet. Say hi to Tekkie!</p>`;
      return;
    }
    panelBody.innerHTML = `<button type="button" class="small copy-all" data-label="Copy all">Copy all</button><ol class="history">${history
      .map(
        (l, i) =>
          `<li class="${l.who}"><span class="who">${l.who === "user" ? "You" : "Tekkie"}</span><span class="line">${escapeHtml(l.text)}</span><button type="button" class="small copy-line" data-i="${i}" data-label="Copy" aria-label="Copy line">Copy</button></li>`,
      )
      .join("")}</ol>`;
    const list = panelBody.querySelector<HTMLOListElement>(".history")!;
    list.scrollTop = list.scrollHeight;
    panelBody.querySelector<HTMLButtonElement>(".copy-all")!.addEventListener("click", (e) =>
      copy(history.map((l) => `${l.who === "user" ? "You" : "Tekkie"}: ${l.text}`).join("\n"), e.currentTarget as HTMLButtonElement),
    );
    panelBody.querySelectorAll<HTMLButtonElement>(".copy-line").forEach((b) =>
      b.addEventListener("click", () => copy(history[Number(b.dataset.i)]?.text ?? "", b)),
    );
  }

  function renderPlan() {
    if (!plan) {
      panelBody.innerHTML = `<p class="muted">No task in progress.</p>`;
      return;
    }
    const icon = { todo: "○", doing: "◐", done: "✓", failed: "✕" } as const;
    const done = plan.steps.filter((s) => s.status === "done").length;
    panelBody.innerHTML = `${plan.title ? `<p class="plan-title">${escapeHtml(plan.title)}</p>` : ""}<div class="progress"><span style="width:${
      plan.steps.length ? (done / plan.steps.length) * 100 : 0
    }%"></span></div><ol class="plan">${plan.steps
      .map((s) => `<li class="${s.status}"><span class="tick">${icon[s.status]}</span>${escapeHtml(s.text)}</li>`)
      .join("")}</ol>`;
  }

  function renderGames() {
    panelBody.innerHTML = `<div class="game-list">${GAMES.map(
      (g) => `<button type="button" class="game-pick" data-game="${g.id}"><span>${g.icon}</span>${g.name}</button>`,
    ).join("")}</div><div class="game"></div>`;
    const area = panelBody.querySelector<HTMLDivElement>(".game")!;
    panelBody.querySelectorAll<HTMLButtonElement>(".game-pick").forEach((b) =>
      b.addEventListener("click", () => {
        catchGame?.stop();
        startGame(b.dataset.game as GameId, {
          el: area,
          say: (t) => say(t),
          emote: (k) => character.emote(k),
          reward: () => void care("win"),
          playCatch,
        });
      }),
    );
  }

  // --- Care: food, mood, energy and bond level ------------------------------------------------
  async function loadCare() {
    const s = decay((await careStore.get()) ?? newCare());
    character.setMood(s);
    return s;
  }
  // Day streak: counted once per day, the first time Tekkie shows up.
  void (async () => {
    const before = await loadCare();
    const { state, change } = touchStreak(before);
    if (change === "same") return;
    careStore.set(state);
    if (change === "continued" && (state.streak ?? 0) >= 2) {
      setTimeout(() => {
        character.emote("celebrate");
        chirps.play("level");
        say(`${state.streak} days in a row! 🔥 Thanks for coming back.`);
      }, 4000);
    }
  })();
  const unlockedAt = (level: number) => SKINS.filter((s) => s.unlockLevel === level);

  /** Applies a care action, saves it, and celebrates level-ups. Returns false if Tekkie refused. */
  async function care(action: CareAction) {
    const before = await loadCare();
    const { state, excuse } = applyCare(before, action);
    if (excuse) {
      say(excuse);
      character.emote("sad");
      return false;
    }
    careStore.set(state);
    const level = levelOf(state.xp);
    if (level > levelOf(before.xp)) {
      character.emote("celebrate");
      chirps.play("level");
      const skins = unlockedAt(level).map((s) => s.name);
      say(`Level ${level}! ${skins.length ? `I unlocked the ${skins.join(" & ")} look. Pick it in my settings!` : "We're best buddies!"}`);
    }
    if (openPanelId === "care") void renderCare();
    return true;
  }

  async function renderCare() {
    const s = await loadCare();
    const level = levelOf(s.xp);
    const into = s.xp % XP_PER_LEVEL;
    const next = SKINS.find((k) => (k.unlockLevel ?? 1) > level);
    const bar = (label: string, v: number, cls: string) =>
      `<div class="stat ${cls}"><span>${label}</span><div class="meter"><span style="width:${Math.round(v)}%"></span></div></div>`;
    panelBody.innerHTML = `
      <p class="level">Bond level <strong>${level}</strong> · ${into}/${XP_PER_LEVEL}${next ? ` · next unlock: ${next.name} (level ${next.unlockLevel})` : ""}</p>
      <p class="streak">🔥 ${s.streak ?? 1}-day streak${(s.bestStreak ?? 0) > (s.streak ?? 1) ? ` · best ${s.bestStreak}` : ""}</p>
      ${bar("🍪 Food", s.food, "food")}${bar("😊 Mood", s.mood, "mood")}${bar("⚡ Energy", s.energy, "energy")}
      <div class="care-actions">
        <button type="button" data-care="feed">🍪 Feed</button><button type="button" data-care="play">⚽ Play</button>
        <button type="button" data-care="pet">🤚 Pet</button><button type="button" data-care="nap">💤 Nap</button>
      </div>
      <p class="muted">Tip: rub your cursor over me to pet me.</p>`;
    panelBody.querySelectorAll<HTMLButtonElement>("[data-care]").forEach((b) =>
      b.addEventListener("click", async () => {
        const action = b.dataset.care as CareAction;
        if (!(await care(action))) return;
        if (action === "feed") {
          character.emote("eat");
          say(["Yum!", "Cookies are my favourite!", "Nom nom nom"][Math.floor(Math.random() * 3)]);
        } else if (action === "play") {
          character.dance();
          say("Wheee!");
        } else if (action === "pet") character.emote("love");
        else goToSleep(20);
      }),
    );
  }

  // How Tekkie feels shows now and then without being asked.
  let nextMoodCheck = performance.now() + 30_000;
  let lastHungry = 0;
  async function moodCheck() {
    const s = await loadCare();
    const now = performance.now();
    if (s.food < 20 && now - lastHungry > 10 * 60_000 && !voice.active) {
      lastHungry = now;
      character.emote("sad");
      say("I'm getting hungry… could I have a cookie? 🍪");
    } else if (s.mood < 25 && Math.random() < 0.4) character.emote("sad");
  }

  // --- Sleeping ------------------------------------------------------------------------------
  let sleeping = false;
  let sleepUntil = 0;
  let sleptAt = 0;
  function goToSleep(seconds = 0) {
    if (sleeping) return;
    sleeping = true;
    sleptAt = Date.now();
    sleepUntil = seconds ? performance.now() + seconds * 1000 : 0;
    character.setSleepy(true);
    box.classList.add("sleeping");
  }
  function wakeUp() {
    if (!sleeping) return;
    sleeping = false;
    character.setSleepy(false);
    box.classList.remove("sleeping");
    character.emote("surprised");
    wake();
    // A nap restores energy.
    const minutes = (Date.now() - sleptAt) / 60_000;
    if (minutes > 0.25) void loadCare().then((s) => careStore.set({ ...s, energy: Math.min(100, s.energy + minutes * 3 + 10) }));
  }

  // --- Perching on things on the page ---------------------------------------------------------
  let perch: { el: Element; until: number } | null = null;
  let hop: { fromX: number; fromB: number; toX: number; toB: number; t: number; land: () => void } | null = null;

  /** Bottom offset that puts Tekkie's seat on the top edge of `rect`. */
  function seatB(rect: DOMRect) {
    const below = box.getBoundingClientRect().bottom - stage.getBoundingClientRect().bottom;
    const zoom = Number(scaler.style.zoom) || 1;
    return window.innerHeight - rect.top - below - PERCH_SEAT_PX * zoom;
  }
  function perchSpot(el: Element) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - box.offsetWidth / 2, b: seatB(r) };
  }
  function findPerch(): Element | null {
    const tall = box.offsetHeight + MARGIN;
    const candidates = [...document.querySelectorAll("h1, h2, h3, img, button, input, textarea, video, nav, header, [role=button], .card, article")].filter((el) => {
      if (el.closest("[data-tekkie]")) return false;
      const r = el.getBoundingClientRect();
      // Fully on screen, wide enough to sit on, and with room above for Tekkie.
      return r.width >= 90 && r.height >= 20 && r.top > tall - 40 && r.bottom < window.innerHeight - 40 && r.left >= 0 && r.right <= window.innerWidth;
    });
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  }
  function jumpTo(x: number, b: number, land: () => void) {
    character.setSitting(false);
    character.poke();
    hop = { fromX: pos.x, fromB: pos.b, toX: x, toB: b, t: 0, land };
  }
  function leavePerch() {
    if (!perch) return;
    perch = null;
    box.classList.remove("perched");
    character.setSitting(false);
  }
  function hopDown() {
    leavePerch();
    jumpTo(pos.x, MARGIN, () => character.poke());
  }

  // --- Catch-me game: Tekkie runs from the pointer ----------------------------------------------
  let catchGame: { caught(): void; stop(): void; until: number } | null = null;
  function playCatch(seconds: number, onCatch: (n: number) => void) {
    leavePerch();
    return new Promise<number>((resolve) => {
      let count = 0;
      const timer = window.setTimeout(() => game.stop(), seconds * 1000);
      const game = {
        until: performance.now() + seconds * 1000,
        caught() {
          count++;
          onCatch(count);
          character.emote("surprised");
          // Dash to the other side of the screen.
          const maxX = window.innerWidth - box.offsetWidth - MARGIN;
          jumpTo(pos.x > maxX / 2 ? MARGIN + Math.random() * maxX * 0.3 : maxX - Math.random() * maxX * 0.3, MARGIN, () => {});
        },
        stop() {
          clearTimeout(timer);
          if (catchGame === game) catchGame = null;
          resolve(count);
        },
      };
      catchGame = game;
    });
  }

  // --- Behaviour: walking, following, climbing, sleeping -----------------------------------------
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let wanderGoal: number | null = null;
  let restFor = 3 + Math.random() * 3;

  function stepToward(goal: number, speed: number, dt: number) {
    const dx = goal - pos.x;
    if (Math.abs(dx) < 4) {
      character.setWalk(0);
      return true;
    }
    place(pos.x + Math.sign(dx) * Math.min(Math.abs(dx), speed * dt), pos.b);
    character.setWalk(Math.sign(dx));
    return false;
  }

  function behave(dt: number) {
    const now = performance.now();
    if (now > nextMoodCheck) {
      nextMoodCheck = now + 45_000;
      void moodCheck();
    }

    // Mid-jump: follow a little arc.
    if (hop) {
      hop.t = Math.min(1, hop.t + dt / 0.7);
      const k = hop.t < 0.5 ? 2 * hop.t * hop.t : 1 - Math.pow(-2 * hop.t + 2, 2) / 2;
      const arc = Math.sin(hop.t * Math.PI) * 90;
      place(hop.fromX + (hop.toX - hop.fromX) * k, hop.fromB + (hop.toB - hop.fromB) * k + arc);
      character.setWalk(Math.sign(hop.toX - hop.fromX) * (hop.t < 1 ? 1 : 0));
      if (hop.t >= 1) {
        const land = hop.land;
        hop = null;
        character.setWalk(0);
        land();
      }
      return;
    }

    // Sleeping after a long quiet spell (sooner when low on energy).
    if (sleeping) {
      if (voice.active || (sleepUntil && now > sleepUntil) || (!sleepUntil && now - lastActivity < 1000)) wakeUp();
      return;
    }
    if (!voice.active && !hovering && !catchGame && now - lastActivity > SLEEP_AFTER_S * 1000 && !document.hidden) {
      goToSleep();
      return;
    }

    if (catchGame) {
      // Keep away from the pointer.
      const r = stage.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (pointer.x >= 0 && Math.abs(pointer.x - cx) < 260) {
        const maxX = window.innerWidth - box.offsetWidth - MARGIN;
        const away = pointer.x < cx ? maxX : MARGIN;
        stepToward(away, 330, dt);
      } else character.setWalk(0);
      return;
    }

    // Sitting on something: stay with it while the page scrolls; hop down when it's gone or time's up.
    if (perch) {
      const r = perch.el.getBoundingClientRect();
      const gone = !perch.el.isConnected || r.bottom < 0 || r.top > window.innerHeight || r.width === 0;
      if (gone || now > perch.until || prefs.follow || !prefs.wander) hopDown();
      else {
        const spot = perchSpot(perch.el);
        place(spot.x, spot.b);
      }
      return;
    }

    const free = !drag?.moved && !document.hidden && !reduceMotion && !character.dancing;
    if (!free) {
      character.setWalk(0);
      wanderGoal = null;
      return;
    }
    const maxX = window.innerWidth - box.offsetWidth - MARGIN;
    if (prefs.follow && pointer.x >= 0 && !hovering) {
      // Stay a little way from the pointer, on whichever side it is.
      const goal = Math.min(Math.max(MARGIN, pointer.x - box.offsetWidth / 2), maxX);
      if (Math.abs(goal - pos.x) > 110) stepToward(goal, 240, dt);
      else character.setWalk(0);
      return;
    }
    if (!prefs.wander || hovering || voice.active || openPanelId || maxX - MARGIN < 160) {
      character.setWalk(0);
      wanderGoal = null;
      return;
    }
    if (wanderGoal === null) {
      character.setWalk(0);
      restFor -= dt;
      if (restFor > 0) return;
      // Sometimes climb onto something on the page instead of strolling.
      if (Math.random() < 0.3) {
        const el = findPerch();
        if (el) {
          const spot = perchSpot(el);
          restFor = 3;
          jumpTo(spot.x, spot.b, () => {
            perch = { el, until: performance.now() + 20_000 + Math.random() * 25_000 };
            box.classList.add("perched");
            character.setSitting(true);
            if (Math.random() < 0.5) character.wave();
          });
          return;
        }
      }
      if (pos.b > MARGIN + 4) {
        // Somewhere up high (dragged there): hop back down to the floor first.
        jumpTo(pos.x, MARGIN, () => {});
        return;
      }
      do wanderGoal = MARGIN + Math.random() * (maxX - MARGIN);
      while (Math.abs(wanderGoal - pos.x) < 140);
    } else if (stepToward(wanderGoal, 105, dt)) {
      wanderGoal = null;
      restFor = 5 + Math.random() * 9;
      const roll = Math.random();
      if (roll < 0.3) character.wave();
      else if (roll < 0.42) character.dance();
    }
  }

  // --- Render loop -----------------------------------------------------------
  const sizeCanvas = () => character.resize(stage.clientWidth, stage.clientHeight);
  new ResizeObserver(sizeCanvas).observe(stage);
  sizeCanvas();
  syncChips();

  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = (now - last) / 1000;
    behave(Math.min(dt, 0.05));
    character.setLevels(voice.outputLevel, voice.inputLevel, voice.outputShape ?? 0.5);
    character.update(dt);
    last = now;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  setTimeout(async () => {
    if (options.shouldGreet && !(await options.shouldGreet())) return;
    character.wave();
    chirps.play("hello");
    say("Hi, I'm Tekkie! Tap me or press Talk to chat.");
  }, 600);

  return {
    setSkin: (skin: Skin) => character.setSkin(skin),
    setForm: (form: FormKind) => character.setForm(form),
    setAccessory: (a: Accessory | null) => character.setAccessory(a),
    loadModel: (bytes: ArrayBuffer) => character.loadModel(bytes),
    setSounds(on: boolean) {
      chirps.enabled = on;
    },
    setFidgets(on: boolean) {
      character.fidgets = on;
    },
    wave: () => character.wave(),
    emote: (kind: Emote) => character.emote(kind),
    say: (text: string) => say(text),
    setScale,
    setCorner(c: "left" | "right") {
      corner = c;
    },
    setPosition: (p: { x: number; b: number }) => {
      leavePerch();
      place(p.x, p.b);
    },
    /** Brings Tekkie back to its corner. */
    resetPosition() {
      leavePerch();
      positionStore.clear();
      place(cornerX(), 0);
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

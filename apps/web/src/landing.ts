// Tekkie landing page: one fixed, full-viewport 3D stage behind the copy. Tekkie walks from section to
// section as you scroll, looks at your pointer, reacts to clicks and to the cards you hover, and the
// mode picker changes its body, skin and outfit live.
import { TekkieCharacter, type Emote, type FormKind } from "./mascot/TekkieCharacter";
import { SKINS, type Accessory, type Skin } from "./mascot/skins";
import { icon } from "./icons";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Where the voice API lives: same host on Render, set at build time for other hosts (see .env.vercel). */
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/+$/, "");
const DOWNLOAD_URL = `${API_BASE}/downloads/tekkie-extension.zip`;
const narrow = () => innerWidth < 1000;

// --- Stage ---------------------------------------------------------------------------------------

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const bubble = document.getElementById("bubble") as HTMLDivElement;
const character = new TekkieCharacter(canvas, "robot");
character.fidgets = !reduced;

/** Where Tekkie stands (stage units), how big it is, where the camera orbits, and how visible it is. */
interface Key {
  x: number;
  y: number;
  scale: number;
  yaw: number;
  az: number;
  el: number;
  dist: number;
  opacity: number;
}
const BASE: Key = { x: 0, y: 0, scale: 1, yaw: 0, az: 0, el: 0.04, dist: 8.2, opacity: 1 };

/** Put Tekkie's body centre at a point of an element's box (fractions of its width/height; may exceed 0..1). */
interface Anchor {
  sel: string;
  ax: number;
  ay: number;
}
/** Sit on the top edge of an element. */
interface Perch {
  sel: string;
  /** 0..1 along the element's width. */
  along: number;
}
interface Placement {
  anchor?: Anchor;
  perch?: Perch;
  /** Body height in CSS pixels, capped by maxVh × viewport height (and by the anchor's width). */
  height: number;
  maxVh: number;
  opacity?: number;
}
interface Stop {
  desktop: Placement;
  mobile: Placement;
  yaw: number;
  az: number;
  el: number;
  dist?: number;
  line: string;
  emote?: Emote;
  dance?: boolean;
}
const HIDDEN: Placement = { anchor: { sel: "body", ax: 0.5, ay: 0 }, height: 200, maxVh: 0.3, opacity: 0 };

/** One stop per `[data-stop]` section, in document order. */
const STOPS: Stop[] = [
  {
    desktop: { anchor: { sel: ".hero-inner", ax: 1.2, ay: 0.3 }, height: 300, maxVh: 0.42 },
    mobile: { anchor: { sel: ".hero", ax: 0.5, ay: 0.8 }, height: 280, maxVh: 0.36 },
    yaw: -0.3, az: -0.06, el: 0.06, line: "Hi! I'm Tekkie", emote: "wave",
  },
  {
    desktop: { anchor: { sel: ".statement .wrap", ax: 0.9, ay: 0.12 }, height: 250, maxVh: 0.32 },
    mobile: HIDDEN,
    yaw: -0.3, az: -0.05, el: 0.06, line: "Talk to me, I listen", emote: "nod",
  },
  {
    desktop: { anchor: { sel: ".modes .stage-gap", ax: 0.5, ay: 0.5 }, height: 360, maxVh: 0.5 },
    mobile: HIDDEN,
    yaw: 0.4, az: 0.1, el: 0.08, line: "Pick a mode, I'll change outfit", emote: "nod",
  },
  {
    desktop: { perch: { sel: ".col.tekkie", along: 0.8 }, height: 190, maxVh: 0.3 },
    mobile: HIDDEN,
    yaw: -0.35, az: -0.08, el: 0.05, line: "Legacy? Never heard of it", emote: "think",
  },
  {
    desktop: { anchor: { sel: ".paths .stage-gap", ax: 0.5, ay: 0.5 }, height: 340, maxVh: 0.48 },
    mobile: HIDDEN,
    yaw: 0.35, az: 0.08, el: 0.06, line: "Install me, or embed me", emote: "shrug",
  },
  {
    desktop: { perch: { sel: ".install-steps li:nth-child(4)", along: 0.72 }, height: 150, maxVh: 0.22 },
    mobile: HIDDEN,
    yaw: -0.25, az: -0.04, el: 0.06, line: "Two minutes, promise", emote: "nod",
  },
  {
    desktop: { perch: { sel: ".cards .card:nth-child(2)", along: 0.72 }, height: 170, maxVh: 0.28 },
    mobile: HIDDEN,
    yaw: 0, az: -0.04, el: 0.06, line: "Hover a card, I'll react", emote: "lookaround",
  },
  {
    desktop: { perch: { sel: "#testimonials-root", along: 0.95 }, height: 140, maxVh: 0.2 },
    mobile: HIDDEN,
    yaw: -0.3, az: -0.04, el: 0.06, line: "Hover to pause a column", emote: "lookaround",
  },
  {
    desktop: { anchor: { sel: ".faq .stage-gap", ax: 0.5, ay: 0.45 }, height: 320, maxVh: 0.45 },
    mobile: HIDDEN,
    yaw: 0.45, az: 0.1, el: 0.05, line: "Ask me anything", emote: "think",
  },
  {
    desktop: { anchor: { sel: ".closing .wrap", ax: 1.05, ay: 0.5 }, height: 290, maxVh: 0.4 },
    mobile: { anchor: { sel: ".closing", ax: 0.5, ay: 0.78 }, height: 240, maxVh: 0.32 },
    yaw: -0.35, az: -0.05, el: 0.08, dist: 7.8, line: "Let's go!", emote: "celebrate", dance: true,
  },
  {
    desktop: { anchor: { sel: ".footer", ax: 0.5, ay: 1.6 }, height: 240, maxVh: 0.3, opacity: 0 },
    mobile: { anchor: { sel: ".footer", ax: 0.5, ay: 1.6 }, height: 200, maxVh: 0.3, opacity: 0 },
    yaw: 0, az: 0, el: 0.04, line: "",
  },
];
const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-stop]"));

const FOV_TAN = Math.tan((30 / 2) * (Math.PI / 180));
/** Standing height of the body at scale 1, and the body centre and seat relative to the character's origin (stage units). */
const BODY_H = 2.75;
const CENTRE_Y = -0.25;
const SEAT_Y = -1.55;
/** Width of the body as a fraction of its height, for keeping it inside the viewport. */
const BODY_ASPECT = 0.58;

function stageUnitsPerPx(dist: number) {
  return (2 * dist * FOV_TAN) / innerHeight;
}

/** The key for one stop, measured against the live layout, with a correction pass through the real camera. */
function keyOf(i: number): Key {
  const stop = STOPS[i];
  const p = narrow() ? stop.mobile : stop.desktop;
  const dist = stop.dist ?? BASE.dist;
  const key: Key = { ...BASE, yaw: stop.yaw, az: stop.az, el: stop.el, dist, opacity: p.opacity ?? 1 };
  const el = document.querySelector(p.anchor?.sel ?? p.perch?.sel ?? "body");
  if (!el) return key;
  const r = el.getBoundingClientRect();
  let height = Math.min(p.height, p.maxVh * innerHeight);
  if (p.anchor && !p.perch) height = Math.min(height, r.width * 1.4);
  const upp = stageUnitsPerPx(dist);
  key.scale = (height * upp) / BODY_H;
  const halfW = height * BODY_ASPECT * 0.5 + 8;
  let px: number;
  let py: number;
  let pin: number;
  if (p.perch) {
    px = r.left + r.width * p.perch.along;
    py = r.top;
    pin = SEAT_Y;
  } else {
    px = r.left + r.width * p.anchor!.ax;
    py = r.top + r.height * p.anchor!.ay;
    pin = CENTRE_Y;
  }
  px = Math.min(innerWidth - halfW, Math.max(halfW, px));
  // First estimate from the plane geometry, then one correction pass so the pinned point lands on target.
  key.x = (px - innerWidth / 2) * upp;
  key.y = (innerHeight / 2 - py) * upp + BASE.el * dist * 0.5 - pin * key.scale;
  character.setCamera(key.az, key.el, key.dist);
  character.place(key.x, key.y, 0, key.scale, key.yaw);
  const got = character.toScreen(0, pin, 0, innerWidth, innerHeight);
  key.x += (px - got.x) * upp;
  key.y += (got.y - py) * upp;
  return key;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const smooth = (c: number, t: number, rate: number, dt: number) => c + (t - c) * (1 - Math.exp(-rate * dt));

/** The key for the current scroll position: a smoothstep between the two nearest section centres. */
function targetKey(): { key: Key; near: number } {
  const centre = scrollY + innerHeight / 2;
  const anchors = sections.map((s) => s.offsetTop + Math.min(s.offsetHeight, innerHeight) / 2);
  anchors[0] = innerHeight / 2; // the hero is "reached" at the very top
  let i = 0;
  while (i < anchors.length - 2 && centre > anchors[i + 1]) i++;
  const t = smoothstep((centre - anchors[i]) / Math.max(1, anchors[i + 1] - anchors[i]));
  const a = keyOf(i);
  const b = keyOf(Math.min(i + 1, STOPS.length - 1));
  const key = { ...a };
  for (const k of Object.keys(a) as (keyof Key)[]) key[k] = lerp(a[k], b[k], t);
  return { key, near: t < 0.5 ? i : Math.min(i + 1, STOPS.length - 1) };
}

const cur: Key = { ...keyOf(0) };
const pointer = { x: innerWidth / 2, y: innerHeight / 2, fresh: false };
let hovered = false;
let sitting = false;
let last = performance.now();
let width = 0;
let height = 0;

function resize() {
  width = innerWidth;
  height = innerHeight;
  character.resize(width, height);
}
addEventListener("resize", resize);
resize();

addEventListener("pointermove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.fresh = true;
});

const INTERACTIVE = "a, button, input, select, textarea, summary, label";
addEventListener("click", (e) => {
  if (!hovered || cur.opacity < 0.5) return;
  if ((e.target as Element).closest?.(INTERACTIVE)) return;
  const fun: Emote[] = ["laugh", "celebrate", "love", "surprised", "nod", "shrug", "eat"];
  character.emote(fun[Math.floor(Math.random() * fun.length)]);
  character.poke();
});

function frame(now: number) {
  // Stage motion uses the real elapsed time (capped at half a second) so Tekkie still settles quickly on
  // slow or throttled devices; the character's own animation clamps its step internally.
  const elapsed = Math.min(0.5, (now - last) / 1000);
  const dt = Math.min(0.05, elapsed);
  last = now;
  const { key: target, near } = reduced ? { key: keyOf(Math.min(currentStop, STOPS.length - 1)), near: currentStop } : targetKey();
  for (const k of Object.keys(cur) as (keyof Key)[]) cur[k] = smooth(cur[k], target[k], reduced ? 30 : 5, elapsed);
  const perched = !!(narrow() ? STOPS[near].mobile : STOPS[near].desktop).perch;
  if (perched !== sitting) {
    sitting = perched;
    character.setSitting(perched);
  }

  // Pointer parallax on the camera, and Tekkie looks at the pointer relative to its own head.
  const px = (pointer.x / width) * 2 - 1;
  const py = (pointer.y / height) * 2 - 1;
  character.setCamera(cur.az + px * 0.05, cur.el - py * 0.03, cur.dist);
  character.place(cur.x, cur.y, 0, cur.scale, cur.yaw);
  const head = character.toScreen(0, 0.9, 0, width, height);
  const feet = character.toScreen(0, -1.6, 0, width, height);
  character.lookAt((pointer.x - head.x) / (width * 0.35), -(pointer.y - head.y) / (height * 0.35));
  const half = Math.abs(feet.y - head.y) * 0.5 + 16;
  const dx = pointer.x - (head.x + feet.x) / 2;
  const dy = pointer.y - (head.y + feet.y) / 2;
  const on = cur.opacity > 0.5 && pointer.fresh && dx * dx + dy * dy < half * half;
  if (on !== hovered) {
    hovered = on;
    character.setHover(on);
    document.body.classList.toggle("tekkie-hover", on);
  }

  canvas.style.opacity = String(cur.opacity);
  const bw = bubble.offsetWidth / 2 + 12;
  bubble.style.left = `${Math.min(width - bw, Math.max(bw, head.x + 10 * cur.scale))}px`;
  bubble.style.top = `${head.y - 34 * cur.scale}px`;
  bubble.classList.toggle("show", bubbleOn && cur.opacity > 0.6);

  character.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Sections: which stop is on screen drives the speech bubble and a reaction ------------------

let currentStop = 0;
let bubbleOn = false;
let bubbleTimer = 0;
function say(text: string, ms = 3200) {
  bubble.textContent = text;
  bubbleOn = text.length > 0;
  clearTimeout(bubbleTimer);
  if (bubbleOn) bubbleTimer = window.setTimeout(() => (bubbleOn = false), ms);
}
const seen = new Set<number>();
const stops = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const i = sections.indexOf(e.target as HTMLElement);
      if (i < 0 || i === currentStop) continue;
      currentStop = i;
      const stop = STOPS[i];
      say(stop.line);
      if (!seen.has(i)) {
        seen.add(i);
        if (stop.emote) character.emote(stop.emote);
        if (stop.dance && !reduced) character.dance();
      }
    }
  },
  { threshold: 0.45 },
);
sections.forEach((s) => stops.observe(s));
setTimeout(() => say(STOPS[0].line, 4000), 900);

// Reveal copy as it scrolls in (Corgi's stagger: rise, un-blur). A direct viewport check on load
// and on scroll backs up the observer, so nothing stays hidden if its callback is late.
const pending = new Set<Element>(Array.from(document.querySelectorAll("[data-reveal]")));
const show = (el: Element) => {
  el.classList.add("in");
  pending.delete(el);
  reveal.unobserve(el);
};
const reveal = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && show(e.target)), { threshold: 0.15 });
pending.forEach((el) => reveal.observe(el));
function revealVisible() {
  for (const el of pending) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight * 0.95) show(el);
  }
}
let revealQueued = false;
addEventListener("scroll", () => {
  if (revealQueued || pending.size === 0) return;
  revealQueued = true;
  requestAnimationFrame(() => {
    revealQueued = false;
    revealVisible();
  });
}, { passive: true });
revealVisible();

// Decorative equaliser bars for the voice card.
const wave = document.querySelector<HTMLElement>(".wave");
if (wave) {
  for (let i = 0; i < 30; i++) {
    const bar = document.createElement("i");
    bar.style.setProperty("--i", String(i));
    bar.style.setProperty("--h", (0.35 + 0.6 * Math.abs(Math.sin(i * 1.7))).toFixed(2));
    wave.appendChild(bar);
  }
}

// The testimonials are a React island: load React and Tailwind only when the section is near.
const tmRoot = document.getElementById("testimonials-root");
if (tmRoot) {
  const loadTm = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      loadTm.disconnect();
      void import("./testimonials-island").then((m) => m.mountTestimonials(tmRoot));
    },
    { rootMargin: "700px 0px" },
  );
  loadTm.observe(tmRoot);
}

// Static icons in the markup: <span data-icon="mic"></span>.
document.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon ?? "")));

// --- Modes: body + skin + outfit + modules ------------------------------------------------------

interface Mode {
  name: string;
  form: FormKind;
  skin: string;
  accessory: Accessory | null;
  emote: Emote;
  chips: { label: string; icon: string; blurb: string }[];
}
const MODES: Record<string, Mode> = {
  browse: {
    name: "Browse",
    form: "robot",
    skin: "classic",
    accessory: null,
    emote: "wave",
    chips: [
      { label: "Voice", icon: "mic", blurb: "Realtime speech-to-speech. Talk over it and it stops to listen." },
      { label: "Browser agent", icon: "cursor", blurb: "Opens sites by name, clicks with real input, fills forms, closes cookie banners (choosing the private option)." },
      { label: "Screen", icon: "eye", blurb: "“What's on my screen?” sends a screenshot of your tab, only when you ask." },
      { label: "Tabs", icon: "tabs", blurb: "Lists, switches and closes tabs, pauses music in any tab, closes duplicates." },
    ],
  },
  learn: {
    name: "Learn",
    form: "humanoid",
    skin: "street",
    accessory: "glasses",
    emote: "think",
    chips: [
      { label: "Tutor mode", icon: "cap", blurb: "Hints instead of answers, kid-safe topics, no buying or signing up. Locked behind a parent PIN." },
      { label: "Explain", icon: "bulb", blurb: "Highlight text, right-click, ask Tekkie: explain, summarize, translate or read aloud." },
      { label: "Quick maths", icon: "calc", blurb: "A quick-fire maths game with a daily streak that counts the days you show up." },
      { label: "Notes", icon: "note", blurb: "“Note this” and “add milk to my to-do list” land in the popup where you can edit them." },
    ],
  },
  work: {
    name: "Work",
    form: "robot",
    skin: "galaxy",
    accessory: null,
    emote: "nod",
    chips: [
      { label: "Gmail drafts", icon: "mail", blurb: "Drafts emails in Gmail from what you say, ready for you to check and send." },
      { label: "Calendar", icon: "calendar", blurb: "Creates Google Calendar events and sets reminders: “remind me in 10 minutes to stretch”." },
      { label: "Checklists", icon: "check", blurb: "Bigger jobs get a checklist; Tekkie points at the next thing to click with a glowing arrow." },
      { label: "Memory", icon: "chip", blurb: "Remembers your name and what you like, if you ask it to. Delete any of it, or everything, any time." },
    ],
  },
  play: {
    name: "Play",
    form: "creature",
    skin: "halloween",
    accessory: "witch-hat",
    emote: "celebrate",
    chips: [
      { label: "Pet care", icon: "cookie", blurb: "Feed, play, pet and nap. Food, mood and energy drift over time; the bond level unlocks skins." },
      { label: "Games", icon: "gamepad", blurb: "Rock paper scissors, tic-tac-toe, catch me, memory match and quick maths." },
      { label: "Climbing", icon: "climb", blurb: "Jumps onto buttons, headings and pictures on the page and sits there for a while." },
      { label: "Feelings", icon: "heart", blurb: "Laughs, celebrates with confetti, yawns, snacks, dozes off when you're away, grabs its hat when you scroll fast." },
    ],
  },
};

const tabs = document.getElementById("mode-tabs")!;
const chipsEl = document.getElementById("chips")!;
const blurbEl = document.getElementById("mode-blurb")!;
const nameEl = document.getElementById("mode-name")!;
let currentMode = MODES.browse;
let currentSkin: Skin = SKINS[0];

function setMode(id: string) {
  const mode = MODES[id] ?? MODES.browse;
  currentMode = mode;
  currentSkin = SKINS.find((s) => s.id === mode.skin) ?? SKINS[0];
  tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === id)));
  nameEl.textContent = mode.name;
  blurbEl.innerHTML = "Click any <strong>module</strong> to see what it does.";
  chipsEl.innerHTML = "";
  for (const chip of mode.chips) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `${icon(chip.icon)}${chip.label}`;
    b.addEventListener("click", () => {
      chipsEl.querySelectorAll("button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      blurbEl.innerHTML = `<strong>${chip.label}.</strong> ${chip.blurb}`;
      character.emote("nod");
    });
    chipsEl.appendChild(b);
  }
  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "plus";
  plus.textContent = "+ custom";
  plus.addEventListener("click", () => {
    blurbEl.innerHTML = "<strong>Custom.</strong> Pick only the modules you want from the Playground, or bring your own rigged .glb.";
    character.emote("shrug");
  });
  chipsEl.appendChild(plus);

  if (character.currentForm !== mode.form) character.setForm(mode.form);
  character.setSkin(currentSkin);
  character.setAccessory(mode.accessory);
  character.emote(mode.emote);
  say(`${mode.name} mode, ready`, 2200);
}
tabs.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("button[data-mode]");
  if (b?.dataset.mode) setMode(b.dataset.mode);
});
setMode("browse");

// Feature cards: hovering one makes Tekkie act it out.
document.querySelectorAll<HTMLElement>(".card[data-emote]").forEach((card) => {
  let armed = true;
  card.addEventListener("pointerenter", () => {
    if (!armed) return;
    armed = false;
    character.emote(card.dataset.emote as Emote);
    setTimeout(() => (armed = true), 2500);
  });
});

// --- Chrome: banner, menu, launch the real floating widget ------------------------------------

document.getElementById("banner-close")!.addEventListener("click", () => document.getElementById("banner")!.classList.add("hidden"));
const menu = document.getElementById("menu")!;
const links = document.getElementById("links")!;
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

let widget: Promise<unknown> | null = null;
async function launch() {
  if (widget) return widget;
  say("Coming right up!", 2000);
  character.emote("celebrate");
  widget = Promise.all([import("./widget/TekkieWidget"), import("./voice/LiveVoiceSession")]).then(([{ mountTekkie }, { LiveVoiceSession }]) =>
    mountTekkie({ voice: new LiveVoiceSession(API_BASE), form: currentMode.form, skin: currentSkin, accessory: currentMode.accessory }),
  );
  return widget;
}
document.querySelectorAll<HTMLButtonElement>("[data-launch]").forEach((b) => b.addEventListener("click", () => void launch()));

// --- Download and install ------------------------------------------------------------------------

// The zip is served by the voice server; on another host (Vercel) the links point there.
document.querySelectorAll<HTMLAnchorElement>("a[data-download]").forEach((a) => {
  a.href = DOWNLOAD_URL;
  a.addEventListener("click", () => {
    character.emote("celebrate");
    say("Unzip me, then Load unpacked", 4200);
  });
});
fetch(`${API_BASE}/downloads/tekkie-extension.json`)
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((info: { version: string; bytes: number }) => {
    const meta = document.getElementById("install-meta");
    if (meta) meta.textContent = `Chrome extension · v${info.version} · ${(info.bytes / 1024 / 1024).toFixed(1)} MB zip`;
  })
  .catch(() => {
    /* keep the generic label */
  });
document.querySelectorAll<HTMLButtonElement>("button[data-copy]").forEach((b) =>
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy ?? "");
      const label = b.textContent;
      b.classList.add("done");
      b.textContent = "Copied";
      setTimeout(() => {
        b.textContent = label;
        b.classList.remove("done");
      }, 1400);
    } catch {
      /* clipboard blocked: the text is still visible to copy by hand */
    }
  }),
);

import { TekkieCharacter } from "../../web/src/mascot/TekkieCharacter";
import { DEFAULT_SKIN, SKINS } from "../../web/src/mascot/skins";
import { LiveVoiceSession, type VoiceState } from "../../web/src/voice/LiveVoiceSession";
import { type AppSettings, isConfigured, loadSettings, saveSettings, toConnection } from "./settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const STATUS: Record<VoiceState, string> = {
  idle: "Tap to talk",
  connecting: "Connecting…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Talking…",
  error: "Something went wrong",
};

let settings = loadSettings();

// --- Character ---------------------------------------------------------------
const stage = $<HTMLDivElement>("stage");
const character = new TekkieCharacter($<HTMLCanvasElement>("tekkie"));
character.setSkin(SKINS.find((s) => s.id === settings.skin) ?? DEFAULT_SKIN);
const sizeCanvas = () => character.resize(stage.clientWidth, stage.clientHeight);
new ResizeObserver(sizeCanvas).observe(stage);
sizeCanvas();

// --- Voice -------------------------------------------------------------------
const voice = new LiveVoiceSession(toConnection(settings), { halfDuplex: !settings.interrupt });
const statusEl = $<HTMLSpanElement>("status");
const youEl = $<HTMLDivElement>("you");
const saidEl = $<HTMLDivElement>("said");
const micBtn = $<HTMLButtonElement>("mic");

function show(text: string, you?: string, error = false) {
  if (you !== undefined) youEl.textContent = you ? `You: ${you}` : "";
  saidEl.textContent = text;
  saidEl.classList.toggle("error", error);
  saidEl.scrollTop = saidEl.scrollHeight;
}

let lastUserLine = "";
voice.on("caption", (who, text, final) => {
  if (who === "user") {
    lastUserLine = text;
    show(final ? "…" : "", text);
  } else {
    show(text, lastUserLine);
  }
});
voice.on("error", (message) => show(message, "", true));
voice.on("state", (state) => {
  character.setState(state);
  statusEl.textContent = STATUS[state];
  statusEl.dataset.state = state;
  micBtn.classList.toggle("live", voice.active);
  micBtn.setAttribute("aria-pressed", String(voice.active));
  micBtn.setAttribute("aria-label", voice.active ? "Stop talking" : "Start talking");
  if (state === "listening" && !lastUserLine) show("I'm listening — go ahead!", "");
  if (state === "idle") lastUserLine = "";
});

function startVoice() {
  if (!isConfigured(settings)) return openSettings();
  void voice.start();
}

micBtn.addEventListener("click", () => (voice.active ? voice.stop() : startVoice()));

stage.addEventListener("pointerdown", (e) => {
  character.poke();
  lookAtTouch(e);
  if (!voice.active) startVoice();
});
stage.addEventListener("pointermove", lookAtTouch);

function lookAtTouch(e: PointerEvent) {
  const r = stage.getBoundingClientRect();
  character.lookAt((e.clientX - r.left - r.width / 2) / (r.width / 2), -(e.clientY - r.top - r.height * 0.45) / (r.height / 2));
}

// No mouse on a phone, so Tekkie glances around on its own.
setInterval(() => {
  if (voice.current === "speaking" || voice.current === "listening") character.lookAt(0, 0);
  else character.lookAt((Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 0.8);
}, 2600);

// Don't keep the mic open when the app goes to the background.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && voice.active) voice.stop();
});

// --- Typing ------------------------------------------------------------------
const typeForm = $<HTMLFormElement>("type-form");
const typeInput = $<HTMLInputElement>("type-input");
$<HTMLButtonElement>("keyboard").addEventListener("click", () => {
  typeForm.classList.toggle("open");
  if (typeForm.classList.contains("open")) typeInput.focus();
});
typeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = typeInput.value.trim();
  if (!text) return;
  if (!isConfigured(settings)) return openSettings();
  typeInput.value = "";
  typeInput.blur();
  if (!voice.active) await voice.start();
  voice.sendText(text);
});

// --- Skins -------------------------------------------------------------------
const skinsEl = $<HTMLDivElement>("skins");
for (const skin of SKINS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(skin.id === settings.skin));
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.background = `#${skin.body.toString(16).padStart(6, "0")}`;
  btn.append(swatch, skin.name);
  btn.addEventListener("click", () => {
    character.setSkin(skin);
    settings = { ...settings, skin: skin.id };
    saveSettings(settings);
    skinsEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  });
  skinsEl.appendChild(btn);
}

// --- Settings ----------------------------------------------------------------
const dialog = $<HTMLDialogElement>("settings");
const form = $<HTMLFormElement>("settings-form");
const checkEl = $<HTMLParagraphElement>("settings-check");
const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string) => form.elements.namedItem(name) as T;

function syncModeSections() {
  const mode = (form.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value ?? "apiKey") as AppSettings["mode"];
  form.querySelectorAll<HTMLElement>("[data-mode]").forEach((el) => (el.hidden = el.dataset.mode !== mode));
}

function openSettings() {
  form.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((r) => (r.checked = r.value === settings.mode));
  field<HTMLInputElement>("apiKey").value = settings.apiKey;
  field<HTMLInputElement>("model").value = settings.model;
  field<HTMLSelectElement>("voice").value = settings.voice;
  field<HTMLInputElement>("serverUrl").value = settings.serverUrl;
  field<HTMLInputElement>("interrupt").checked = settings.interrupt;
  checkEl.textContent = "";
  checkEl.className = "check";
  syncModeSections();
  dialog.showModal();
}

form.addEventListener("change", syncModeSections);
$<HTMLButtonElement>("open-settings").addEventListener("click", openSettings);
$<HTMLButtonElement>("settings-cancel").addEventListener("click", () => dialog.close());

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const next: AppSettings = {
    ...settings,
    mode: (form.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value ?? "apiKey") as AppSettings["mode"],
    apiKey: field<HTMLInputElement>("apiKey").value.trim(),
    model: field<HTMLInputElement>("model").value.trim(),
    voice: field<HTMLSelectElement>("voice").value,
    serverUrl: field<HTMLInputElement>("serverUrl").value.trim(),
    interrupt: field<HTMLInputElement>("interrupt").checked,
  };
  if (!isConfigured(next)) {
    checkEl.className = "check bad";
    checkEl.textContent = next.mode === "apiKey" ? "Paste your Gemini API key." : "Enter the server address.";
    return;
  }
  if (next.mode === "server" && !(await serverReachable(next))) return;

  settings = next;
  saveSettings(settings);
  voice.stop();
  voice.connection = toConnection(settings);
  voice.options = { halfDuplex: !settings.interrupt };
  dialog.close();
  show("All set! Tap the mic and say hello.", "");
});

async function serverReachable(s: AppSettings) {
  checkEl.className = "check";
  checkEl.textContent = "Checking server…";
  const base = s.serverUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(6000) });
    const h = await res.json();
    if (!h.voiceConfigured) throw new Error("The server has no Gemini key in its .env.");
    return true;
  } catch (err) {
    checkEl.className = "check bad";
    checkEl.textContent =
      err instanceof Error && err.message.includes(".env")
        ? err.message
        : `Can't reach ${base}. Is the server running, and is the phone on the same Wi-Fi?`;
    return false;
  }
}

// --- Render loop -------------------------------------------------------------
let last = performance.now();
const loop = (now: number) => {
  character.setLevels(voice.outputLevel, voice.inputLevel);
  character.update((now - last) / 1000);
  last = now;
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

setTimeout(() => {
  character.wave();
  if (!isConfigured(settings)) openSettings();
}, 700);

import { FORMS, TekkieCharacter } from "../../web/src/mascot/TekkieCharacter";
import { ACCESSORIES, SKINS, type Accessory } from "../../web/src/mascot/skins";
import { decay, levelOf, newCare, type CareState } from "../../web/src/widget/care";
import { RemoteVoiceSession } from "./remote-voice";
import { base64ToBytes, bytesToBase64, loadList, loadSettings, MODEL_KEY, resolveAccessory, resolveSkin, saveList, saveSettings, sha256, type ListName, type StoredModel } from "./settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const num = (h: string) => parseInt(h.slice(1), 16);

let settings = await loadSettings();
const care = decay(((await chrome.storage.local.get("care")).care as CareState | undefined) ?? newCare());
const level = levelOf(care.xp);

// --- Tekkie says hi from the popup too, and follows the pointer. ------------------------------
const canvas = $<HTMLCanvasElement>("mascot");
const mascot = new TekkieCharacter(canvas, settings.form === "glb" ? "robot" : settings.form);
mascot.setSkin(resolveSkin(settings, level));
mascot.setAccessory(resolveAccessory(settings, level));
mascot.setMood(care);
if (settings.form === "glb") void wearStoredModel();

async function wearStoredModel() {
  const stored = (await chrome.storage.local.get(MODEL_KEY))[MODEL_KEY] as StoredModel | undefined;
  if (!stored?.data) return;
  try {
    await mascot.loadModel(base64ToBytes(stored.data));
  } catch {
    /* the page shows the robot instead */
  }
}
mascot.resize(canvas.clientWidth, canvas.clientHeight);
setTimeout(() => mascot.wave(), 300);
canvas.addEventListener("click", () => mascot.emote(["laugh", "love", "celebrate", "surprised"][Math.floor(Math.random() * 4)] as "laugh"));
window.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  mascot.lookAt((e.clientX - (r.left + r.width / 2)) / 250, -(e.clientY - (r.top + r.height * 0.4)) / 200);
});
let last = performance.now();
const frame = (now: number) => {
  mascot.update((now - last) / 1000);
  last = now;
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

// --- Control panel: show Tekkie on the page, talk to it, type to it. -----------------------------
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const caption = $("caption");

async function showOnPage() {
  if (!tab?.id) return;
  await saveSettings({ enabled: true });
  enabledBox.checked = true;
  const ask = () => chrome.tabs.sendMessage(tab.id!, { type: "tekkie:show" });
  try {
    await ask();
  } catch {
    // The tab was open before Tekkie was installed or reloaded: put Tekkie into it now.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await ask();
    } catch {
      caption.textContent = "Chrome doesn't let extensions run on this page. Open a normal website and try again.";
    }
  }
}

const talkBtn = $<HTMLButtonElement>("talk");
const voice = new RemoteVoiceSession();
const STATE_LABEL = { idle: "Talk", connecting: "Connecting…", listening: "Stop", thinking: "Stop", speaking: "Stop", error: "Talk" } as const;
voice.on("state", (state) => {
  talkBtn.textContent = STATE_LABEL[state];
  talkBtn.setAttribute("aria-pressed", String(voice.active));
  mascot.setState(state);
  if (state === "listening" && !caption.textContent) caption.textContent = "Listening… say something!";
  if (state === "idle") caption.textContent = "";
});
voice.on("caption", (who, text) => (caption.textContent = who === "user" ? `You: ${text}` : text));
voice.on("error", (message) => (caption.textContent = message));
voice.on("emote", (kind) => mascot.emote(kind as "laugh"));
$("show").addEventListener("click", () => void showOnPage());
talkBtn.addEventListener("click", async () => {
  if (voice.active) return voice.stop();
  void showOnPage(); // so you can see Tekkie react while you talk
  await voice.start();
});
$("say").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("say-text");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  if (!voice.active) await voice.start();
  voice.sendText(text);
});

// --- This site ------------------------------------------------------------------------------
const host = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).hostname : "";
const siteHide = $<HTMLInputElement>("site-hide");
const siteNoControl = $<HTMLInputElement>("site-nocontrol");
$("site-name").textContent = host ? `(${host})` : "(not available on this page)";
siteHide.disabled = siteNoControl.disabled = !host;
siteHide.checked = Boolean(host && settings.sites[host]?.hide);
siteNoControl.checked = Boolean(host && settings.sites[host]?.noControl);
async function saveSite() {
  settings = await loadSettings();
  const sites = { ...settings.sites, [host]: { hide: siteHide.checked, noControl: siteNoControl.checked } };
  if (!siteHide.checked && !siteNoControl.checked) delete sites[host];
  await saveSettings({ sites });
}
siteHide.addEventListener("change", () => void saveSite());
siteNoControl.addEventListener("change", () => void saveSite());

// --- Voice ----------------------------------------------------------------------------------
const voiceSel = $<HTMLSelectElement>("voice");
const langSel = $<HTMLSelectElement>("language");
const wake = $<HTMLInputElement>("wake");
wake.checked = settings.wakeWord;
wake.addEventListener("change", () => void saveSettings({ wakeWord: wake.checked }));
voiceSel.addEventListener("change", () => void saveSettings({ voiceName: voiceSel.value }));
langSel.addEventListener("change", () => void saveSettings({ language: langSel.value }));
function fillSelect(sel: HTMLSelectElement, entries: [string, string][], current: string) {
  for (const [value, label] of entries) sel.add(new Option(label, value, false, value === current));
}
$("shortcuts").addEventListener("click", () => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

// --- Look & feel -----------------------------------------------------------------------------
$("bond").textContent = `(bond level ${level}${care.streak ? ` · 🔥 ${care.streak}-day streak` : ""})`;

const formsEl = $("forms");
function renderForms() {
  formsEl.innerHTML = "";
  for (const form of FORMS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${form.icon} ${form.name}`;
    btn.title = form.blurb;
    btn.setAttribute("aria-pressed", String(form.id === settings.form));
    btn.addEventListener("click", async () => {
      await saveSettings({ form: form.id });
      settings = await loadSettings();
      mascot.setForm(form.id);
      mascot.wave();
      renderForms();
    });
    formsEl.appendChild(btn);
  }
}
renderForms();

const modelFile = $<HTMLInputElement>("model-file");
const modelMsg = $("model-msg");
async function showModelState() {
  const stored = (await chrome.storage.local.get(MODEL_KEY))[MODEL_KEY] as StoredModel | undefined;
  modelMsg.className = "note";
  modelMsg.textContent = stored ? `${settings.form === "glb" ? "Wearing" : "Saved"}: ${stored.name} (${Math.round(stored.data.length * 0.75 / 1024)} KB)` : "";
  $<HTMLButtonElement>("model-clear").disabled = !stored;
}
modelFile.addEventListener("change", async () => {
  const f = modelFile.files?.[0];
  if (!f) return;
  if (f.size > 25 * 1024 * 1024) {
    modelMsg.className = "note warn";
    modelMsg.textContent = "That model is over 25 MB. Try a lighter one.";
    return;
  }
  try {
    const bytes = await f.arrayBuffer();
    await mascot.loadModel(bytes.slice(0)); // check it loads before keeping it
    await chrome.storage.local.set({ [MODEL_KEY]: { name: f.name, data: bytesToBase64(bytes) } satisfies StoredModel });
    await saveSettings({ form: "glb" });
    settings = await loadSettings();
    renderForms();
    mascot.wave();
  } catch (err) {
    modelMsg.className = "note warn";
    modelMsg.textContent = `Couldn't load that model: ${err instanceof Error ? err.message : String(err)}`;
    return;
  }
  void showModelState();
});
$("model-clear").addEventListener("click", async () => {
  await chrome.storage.local.remove(MODEL_KEY);
  if (settings.form === "glb") {
    await saveSettings({ form: "robot" });
    settings = await loadSettings();
    mascot.setForm("robot");
    renderForms();
  }
  modelFile.value = "";
  void showModelState();
});
void showModelState();

const hatsEl = $("hats");
function renderHats() {
  hatsEl.innerHTML = "";
  for (const hat of ACCESSORIES) {
    const locked = (hat.unlockLevel ?? 1) > level;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = locked ? `🔒 ${hat.name}` : `${hat.icon} ${hat.name}`;
    btn.title = locked ? `Unlocks at bond level ${hat.unlockLevel}` : hat.name;
    btn.disabled = locked;
    btn.setAttribute("aria-pressed", String((resolveAccessory(settings, level) ?? "none") === hat.id));
    btn.addEventListener("click", async () => {
      const accessory: Accessory | "" = hat.id === "none" ? "" : hat.id;
      await saveSettings({ accessory });
      settings = await loadSettings();
      mascot.setAccessory(resolveAccessory(settings, level));
      renderHats();
    });
    hatsEl.appendChild(btn);
  }
}
renderHats();

const soundsBox = $<HTMLInputElement>("sounds");
soundsBox.checked = settings.sounds;
soundsBox.addEventListener("change", () => void saveSettings({ sounds: soundsBox.checked }));
const fidgetsBox = $<HTMLInputElement>("fidgets");
fidgetsBox.checked = settings.fidgets;
fidgetsBox.addEventListener("change", () => {
  mascot.fidgets = fidgetsBox.checked;
  void saveSettings({ fidgets: fidgetsBox.checked });
});
const skinsEl = $("skins");
function renderSkins() {
  skinsEl.innerHTML = "";
  for (const skin of SKINS) {
    const locked = (skin.unlockLevel ?? 1) > level;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = locked ? `🔒 ${skin.name}` : skin.name;
    btn.title = locked ? `Unlocks at bond level ${skin.unlockLevel}: feed, pet and play with Tekkie` : skin.name;
    btn.disabled = locked;
    btn.setAttribute("aria-pressed", String(skin.id === settings.skinId));
    btn.addEventListener("click", () => wear(skin.id));
    skinsEl.appendChild(btn);
  }
}
async function wear(skinId: string) {
  await saveSettings({ skinId });
  settings = await loadSettings();
  mascot.setSkin(resolveSkin(settings, level));
  mascot.wave();
  renderSkins();
  $<HTMLButtonElement>("wear-custom").setAttribute("aria-pressed", String(skinId === "custom"));
}
renderSkins();

(["body", "visor", "glow", "sneaker"] as const).forEach((key) => {
  const input = $<HTMLInputElement>(`c-${key}`);
  input.value = hex(settings.customColors[key]);
  input.addEventListener("input", async () => {
    const customColors = { ...settings.customColors, [key]: num(input.value) };
    await saveSettings({ customColors });
    settings = await loadSettings();
    if (settings.skinId === "custom") mascot.setSkin(resolveSkin(settings, level));
  });
});
$("wear-custom").setAttribute("aria-pressed", String(settings.skinId === "custom"));
$("wear-custom").addEventListener("click", () => void wear("custom"));

const scale = $<HTMLInputElement>("scale");
scale.value = String(settings.scale);
scale.addEventListener("change", () => void saveSettings({ scale: Number(scale.value) }));
const cornerBtns = [...document.querySelectorAll<HTMLButtonElement>("[data-corner]")];
const showCorner = () => cornerBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.corner === settings.corner)));
cornerBtns.forEach((b) =>
  b.addEventListener("click", async () => {
    await saveSettings({ corner: b.dataset.corner === "left" ? "left" : "right" });
    settings = await loadSettings();
    showCorner();
  }),
);
showCorner();

// --- Memory, notes, to-dos, reminders ------------------------------------------------------------
async function renderList(name: ListName, el: HTMLElement, opts: { toggle?: boolean; when?: boolean } = {}) {
  const items = await loadList(name);
  el.innerHTML = "";
  if (!items.length) {
    el.innerHTML = `<li class="empty">Nothing yet.</li>`;
    return items;
  }
  for (const item of [...items].reverse()) {
    const li = document.createElement("li");
    li.className = item.done ? "done" : "";
    const text = document.createElement("span");
    text.textContent = opts.when && item.due ? `${item.text} · ${new Date(item.due).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : item.text;
    li.appendChild(text);
    if (opts.toggle) {
      const tick = document.createElement("button");
      tick.type = "button";
      tick.textContent = item.done ? "↺" : "✓";
      tick.title = item.done ? "Not done" : "Done";
      tick.addEventListener("click", async () => {
        const all = await loadList(name);
        const hit = all.find((i) => i.id === item.id);
        if (hit) hit.done = !hit.done;
        await saveList(name, all);
      });
      li.appendChild(tick);
    }
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.title = "Delete";
    del.addEventListener("click", async () => {
      await saveList(name, (await loadList(name)).filter((i) => i.id !== item.id));
      if (name === "reminders") void chrome.alarms.clear(`reminder:${item.id}`);
    });
    li.appendChild(del);
    el.appendChild(li);
  }
  return items;
}

async function renderLists() {
  const memory = await renderList("memory", $("memory"));
  $("memory-count").textContent = memory.length ? `(${memory.length})` : "";
  const todos = await renderList("todos", $("todos"), { toggle: true });
  await renderList("reminders", $("reminders"), { when: true });
  const notes = await renderList("notes", $("notes"));
  const open = todos.filter((t) => !t.done).length;
  $("notes-count").textContent = notes.length || open ? `(${notes.length} notes, ${open} to-dos)` : "";
}
$("forget-all").addEventListener("click", async () => {
  await saveList("memory", []);
});
void renderLists();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.memory || changes.notes || changes.todos || changes.reminders)) void renderLists();
});

// --- Tutor mode (parent PIN) ------------------------------------------------------------------
const pin = $<HTMLInputElement>("pin");
const pinMsg = $("pin-msg");
const tutorBtn = $<HTMLButtonElement>("tutor-toggle");
const lockable = ["control", "screen", "server", "site-hide", "site-nocontrol", "forget-all", "enabled"];
function showTutor() {
  $("tutor-state").textContent = settings.tutor ? "(on)" : "";
  tutorBtn.textContent = settings.tutor ? "Turn off" : "Turn on";
  pin.placeholder = settings.tutorPinHash ? "Parent PIN" : "Choose a parent PIN (4+ digits)";
  // A child shouldn't be able to switch the guard rails off.
  for (const id of lockable) $<HTMLInputElement>(id).disabled = settings.tutor || (id.startsWith("site-") && !host);
}
tutorBtn.addEventListener("click", async () => {
  const code = pin.value.trim();
  pin.value = "";
  if (!/^\d{4,}$/.test(code)) {
    pinMsg.className = "note warn";
    pinMsg.textContent = "Enter a PIN of at least 4 digits.";
    return;
  }
  const hash = await sha256(code);
  if (settings.tutorPinHash && hash !== settings.tutorPinHash) {
    pinMsg.className = "note warn";
    pinMsg.textContent = "That PIN isn't right.";
    return;
  }
  await saveSettings({ tutor: !settings.tutor, tutorPinHash: hash });
  settings = await loadSettings();
  pinMsg.className = "note ok";
  pinMsg.textContent = settings.tutor ? "Tutor mode is on. It applies from the next conversation." : "Tutor mode is off.";
  showTutor();
});

// --- Settings --------------------------------------------------------------------------------
const enabledBox = $<HTMLInputElement>("enabled");
const server = $<HTMLInputElement>("server");
const status = $("status");
enabledBox.checked = settings.enabled;
enabledBox.addEventListener("change", () => void saveSettings({ enabled: enabledBox.checked }));
const control = $<HTMLInputElement>("control");
control.checked = settings.browserControl;
control.addEventListener("change", () => void saveSettings({ browserControl: control.checked }));
const screen = $<HTMLInputElement>("screen");
screen.checked = settings.screenReading;
screen.addEventListener("change", () => void saveSettings({ screenReading: screen.checked }));
showTutor();

let filledVoices = false;
async function checkServer(url: string) {
  status.className = "note";
  status.textContent = "Checking…";
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/api/health`);
    const h = (await res.json()) as { voiceConfigured: boolean; voices?: string[]; languages?: Record<string, string> };
    status.className = h.voiceConfigured ? "note ok" : "note warn";
    status.textContent = h.voiceConfigured ? "Voice server ready" : "Server is running but has no GEMINI_API_KEY";
    if (!filledVoices) {
      filledVoices = true;
      fillSelect(voiceSel, (h.voices ?? []).map((v) => [v, v]), settings.voiceName);
      fillSelect(langSel, Object.entries(h.languages ?? {}), settings.language);
    }
  } catch {
    status.className = "note warn";
    status.textContent = "Can't reach the server. It may be waking up; try again in a moment.";
  }
}
server.value = settings.serverUrl;
void checkServer(settings.serverUrl);
server.addEventListener("change", () => {
  const url = server.value.trim();
  try {
    new URL(url);
  } catch {
    status.className = "note warn";
    status.textContent = "Enter a full URL, like http://localhost:8787";
    return;
  }
  void saveSettings({ serverUrl: url });
  void checkServer(url);
});
$("mic").addEventListener("click", () => void chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") }));

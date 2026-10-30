import { TekkieCharacter } from "../../web/src/mascot/TekkieCharacter";
import { SKINS } from "../../web/src/mascot/skins";
import { loadSettings, saveSettings } from "./settings";

const enabled = document.getElementById("enabled") as HTMLInputElement;
const server = document.getElementById("server") as HTMLInputElement;
const status = document.getElementById("status")!;
const skinsEl = document.getElementById("skins")!;

async function checkServer(url: string) {
  status.className = "";
  status.textContent = "Checking…";
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/api/health`);
    const h = (await res.json()) as { voiceConfigured: boolean };
    status.className = h.voiceConfigured ? "ok" : "warn";
    status.textContent = h.voiceConfigured ? "Voice server ready" : "Server is running but has no GEMINI_API_KEY";
  } catch {
    status.className = "warn";
    status.textContent = "Can't reach the server. Is npm run dev running?";
  }
}

const settings = await loadSettings();

// Tekkie says hi from the popup too, and follows the pointer.
const canvas = document.getElementById("mascot") as HTMLCanvasElement;
const mascot = new TekkieCharacter(canvas);
mascot.setSkin(SKINS.find((s) => s.id === settings.skinId) ?? SKINS[0]);
mascot.resize(canvas.clientWidth, canvas.clientHeight);
setTimeout(() => mascot.wave(), 300);
canvas.addEventListener("click", () => mascot.poke());
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
enabled.checked = settings.enabled;
server.value = settings.serverUrl;
void checkServer(settings.serverUrl);

enabled.addEventListener("change", () => void saveSettings({ enabled: enabled.checked }));

const control = document.getElementById("control") as HTMLInputElement;
control.checked = settings.browserControl;
control.addEventListener("change", () => void saveSettings({ browserControl: control.checked }));

server.addEventListener("change", () => {
  const url = server.value.trim();
  try {
    new URL(url);
  } catch {
    status.className = "warn";
    status.textContent = "Enter a full URL, like http://localhost:8787";
    return;
  }
  void saveSettings({ serverUrl: url });
  void checkServer(url);
});

// Reading the screen needs Chrome's "access all sites" permission, which only a click can grant.
const SCREEN = { origins: ["<all_urls>"] };
const screenBtn = document.getElementById("screen") as HTMLButtonElement;
const screenNote = document.getElementById("screen-note")!;
async function showScreenState() {
  const on = await chrome.permissions.contains(SCREEN);
  screenBtn.setAttribute("aria-pressed", String(on));
  screenBtn.textContent = on ? "Screen reading is on" : "Let Tekkie see the screen";
  screenNote.textContent = on ? "Tekkie only looks when you ask it to. Tap to turn off." : "Tekkie takes a screenshot of your tab only when you ask what's on screen.";
}
screenBtn.addEventListener("click", async () => {
  if (await chrome.permissions.contains(SCREEN)) await chrome.permissions.remove(SCREEN);
  else await chrome.permissions.request(SCREEN);
  void showScreenState();
});
void showScreenState();

for (const skin of SKINS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = skin.name;
  btn.setAttribute("aria-pressed", String(skin.id === settings.skinId));
  btn.addEventListener("click", () => {
    void saveSettings({ skinId: skin.id });
    mascot.setSkin(skin);
    mascot.wave();
    skinsEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  });
  skinsEl.appendChild(btn);
}

document.getElementById("mic")!.addEventListener("click", () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
});

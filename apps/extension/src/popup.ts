import { TekkieCharacter } from "../../web/src/mascot/TekkieCharacter";
import { SKINS } from "../../web/src/mascot/skins";
import { RemoteVoiceSession } from "./remote-voice";
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

// --- Control panel: show Tekkie on the page, talk to it, type to it. -----------------------------

async function showOnPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await saveSettings({ enabled: true });
  enabled.checked = true;
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

const caption = document.getElementById("caption")!;
const talkBtn = document.getElementById("talk") as HTMLButtonElement;
const voice = new RemoteVoiceSession();
const STATE_LABEL = { idle: "Talk", connecting: "Connecting…", listening: "Stop", thinking: "Stop", speaking: "Stop", error: "Talk" } as const;
voice.on("state", (state) => {
  talkBtn.textContent = STATE_LABEL[state];
  talkBtn.setAttribute("aria-pressed", String(voice.active));
  if (state === "listening" && !caption.textContent) caption.textContent = "Listening… say something!";
  if (state === "idle") caption.textContent = "";
});
voice.on("caption", (who, text) => {
  caption.textContent = who === "user" ? `You: ${text}` : text;
});
voice.on("error", (message) => {
  caption.textContent = message;
});
document.getElementById("show")!.addEventListener("click", () => void showOnPage());
talkBtn.addEventListener("click", async () => {
  if (voice.active) return voice.stop();
  void showOnPage(); // so you can see Tekkie react while you talk
  await voice.start();
});
document.getElementById("say")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("say-text") as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  if (!voice.active) await voice.start();
  voice.sendText(text);
});

const screen = document.getElementById("screen") as HTMLInputElement;
screen.checked = settings.screenReading;
screen.addEventListener("change", () => void saveSettings({ screenReading: screen.checked }));

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

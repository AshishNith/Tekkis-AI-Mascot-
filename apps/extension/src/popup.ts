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

for (const skin of SKINS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = skin.name;
  btn.setAttribute("aria-pressed", String(skin.id === settings.skinId));
  btn.addEventListener("click", () => {
    void saveSettings({ skinId: skin.id });
    skinsEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  });
  skinsEl.appendChild(btn);
}

document.getElementById("mic")!.addEventListener("click", () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
});

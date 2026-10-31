import { mountTekkie } from "./widget/TekkieWidget";
import { ACCESSORIES, SKINS } from "./mascot/skins";
import { FORMS } from "./mascot/TekkieCharacter";
import { LiveVoiceSession } from "./voice/LiveVoiceSession";

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/+$/, "");
const tekkie = mountTekkie({ voice: new LiveVoiceSession(API_BASE) });

function picker<T extends { id: string }>(el: HTMLElement, items: T[], label: (i: T) => string, pick: (i: T) => void, first = items[0].id) {
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(item.id === first));
    btn.innerHTML = label(item);
    btn.addEventListener("click", () => {
      pick(item);
      el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    });
    el.appendChild(btn);
  }
}

picker(document.getElementById("forms")!, FORMS, (f) => `${f.icon} ${f.name}`, (f) => tekkie.setForm(f.id));
picker(document.getElementById("skins")!, SKINS, (s) => `<span class="swatch" style="background:#${s.body.toString(16).padStart(6, "0")}"></span>${s.name}`, (s) => tekkie.setSkin(s));
picker(document.getElementById("hats")!, ACCESSORIES, (a) => `${a.icon} ${a.name}`, (a) => tekkie.setAccessory(a.id === "none" ? null : a.id));

// Drop in your own rigged .glb (Meshy, Ready Player Me, Mixamo...).
const file = document.getElementById("model") as HTMLInputElement;
file.addEventListener("change", async () => {
  const f = file.files?.[0];
  if (!f) return;
  try {
    await tekkie.loadModel(await f.arrayBuffer());
  } catch (err) {
    alert(`Couldn't load that model: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// Tell the developer whether voice is wired up.
const statusEl = document.getElementById("server-status")!;
fetch(`${API_BASE}/api/health`)
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((h: { voiceConfigured: boolean; model: string }) => {
    if (h.voiceConfigured) {
      statusEl.className = "status ok";
      statusEl.textContent = `Voice server ready · model ${h.model}`;
    } else {
      statusEl.className = "status warn";
      statusEl.innerHTML = "Voice server is running but has no key. Add <code>GEMINI_API_KEY</code> to <code>.env</code> and restart.";
    }
  })
  .catch(() => {
    statusEl.className = "status warn";
    statusEl.innerHTML = "Voice server not reachable. Run <code>npm run dev</code> from the repo root.";
  });

import { mountTekkie } from "./widget/TekkieWidget";
import { SKINS } from "./mascot/skins";

const tekkie = mountTekkie();

// Skin picker for the playground page.
const skinsEl = document.getElementById("skins")!;
for (const skin of SKINS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(skin.id === SKINS[0].id));
  btn.innerHTML = `<span class="swatch" style="background:#${skin.body.toString(16).padStart(6, "0")}"></span>${skin.name}`;
  btn.addEventListener("click", () => {
    tekkie.setSkin(skin);
    skinsEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  });
  skinsEl.appendChild(btn);
}

// Tell the developer whether voice is wired up.
const statusEl = document.getElementById("server-status")!;
fetch("/api/health")
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

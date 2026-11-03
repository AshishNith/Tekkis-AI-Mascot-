// Scoped inside the widget's shadow root so host-site CSS can't break Tekkie (and vice versa).
export const WIDGET_CSS = `
:host {
  --tk-surface: #ffffff;
  --tk-text: #1d1838;
  --tk-muted: #6b6690;
  --tk-border: rgba(40, 30, 90, 0.12);
  --tk-accent: #7c5cff;
  --tk-accent-text: #ffffff;
  --tk-danger: #e0364f;
  --tk-shadow: 0 10px 30px rgba(30, 20, 80, 0.18);
  all: initial;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :host {
    --tk-surface: #1f1b36;
    --tk-text: #f1efff;
    --tk-muted: #a7a2c9;
    --tk-border: rgba(255, 255, 255, 0.12);
    --tk-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  }
}
.tekkie {
  position: fixed;
  z-index: 2147483000;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}
.scale {
  width: 210px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.bubble {
  pointer-events: auto;
  box-sizing: border-box;
  max-width: 260px;
  min-width: 140px;
  margin-bottom: -6px;
  padding: 10px 14px;
  border-radius: 16px;
  background: var(--tk-surface);
  color: var(--tk-text);
  border: 1px solid var(--tk-border);
  box-shadow: var(--tk-shadow);
  font-size: 14px;
  line-height: 1.4;
  opacity: 0;
  transform: translateY(6px) scale(0.98);
  transition: opacity 0.2s ease, transform 0.2s ease;
  position: relative;
}
.bubble.show { opacity: 1; transform: none; }
/* In the extension's iframe an invisible bubble would still block clicks on the page below it. */
.embedded .bubble:not(.show) { display: none; }
.bubble::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -7px;
  width: 12px;
  height: 12px;
  background: var(--tk-surface);
  border-right: 1px solid var(--tk-border);
  border-bottom: 1px solid var(--tk-border);
  transform: translateX(-50%) rotate(45deg);
}
.you { color: var(--tk-muted); font-size: 12px; margin-bottom: 4px; }
.you:empty { display: none; }
.said { max-height: 7.2em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; }
.bubble.error .said { color: var(--tk-danger); }
.bubble .act:empty { display: none; }
.bubble .act { margin-top: 8px; display: flex; justify-content: flex-end; }
.memory { display: grid; grid-template-columns: repeat(4, 48px); gap: 6px; justify-content: center; }
.mem-card { width: 48px; height: 48px; padding: 0; justify-content: center; font-size: 22px; border-radius: 10px; box-shadow: none; background: rgba(124, 92, 255, 0.18); }
.mem-card.up { background: var(--tk-surface); }
.mem-card.done { background: rgba(26, 154, 82, 0.2); opacity: 0.8; }
.game-q { text-align: center; font-size: 22px; font-weight: 700; margin: 8px 0; }
.game-form { display: flex; gap: 6px; justify-content: center; }
.game-form input { width: 110px; }
.streak { margin: -6px 0 8px; color: var(--tk-muted); }
.stagewrap { position: relative; width: 210px; }
.tray {
  position: absolute;
  top: 8%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.tray.left { left: -4px; }
.tray.right { right: -4px; }
button.chip {
  width: 36px;
  height: 36px;
  padding: 0;
  justify-content: center;
  font-size: 17px;
  line-height: 1;
  opacity: 0;
  transform: scale(0.5) translateX(var(--tk-from, 0));
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.3, 1.5, 0.5, 1), background 0.15s;
}
.tray.left .chip { --tk-from: 14px; }
.tray.right .chip { --tk-from: -14px; }
.stagewrap.open .chip { opacity: 1; transform: none; pointer-events: auto; }
.stagewrap.open .chip:nth-child(2) { transition-delay: 0.04s; }
.stagewrap.open .chip:nth-child(3) { transition-delay: 0.08s; }
.stagewrap.open .chip:nth-child(4) { transition-delay: 0.12s; }
.stagewrap.open .chip:nth-child(5) { transition-delay: 0.16s; }
button.chip.on { outline: 2px solid var(--tk-accent); }
.stagewrap.open .chip:hover { transform: scale(1.14); }
button.chip[aria-pressed="true"], button.chip.live { background: var(--tk-accent); border-color: transparent; }
button.chip.live { background: var(--tk-danger); }
.stage {
  pointer-events: auto;
  width: 210px;
  height: 240px;
  cursor: grab;
  touch-action: none;
}
.stage:active { cursor: grabbing; }
.stage canvas { width: 100%; height: 100%; display: block; }
.controls {
  display: flex;
  gap: 6px;
  margin-top: -10px;
  align-items: center;
}
button {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--tk-border);
  background: var(--tk-surface);
  color: var(--tk-text);
  border-radius: 999px;
  height: 34px;
  padding: 0 14px;
  cursor: pointer;
  box-shadow: var(--tk-shadow);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
button:focus-visible, input:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 2px; }
button.talk { background: var(--tk-accent); color: var(--tk-accent-text); border-color: transparent; }
button.talk.live { background: var(--tk-danger); }
button.icon { width: 34px; padding: 0; justify-content: center; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: 0.9; }
.live .dot { animation: tk-pulse 1s ease-in-out infinite; }
@keyframes tk-pulse { 50% { opacity: 0.3; } }
form.type {
  display: none;
  margin-top: 8px;
  gap: 6px;
}
form.type.open { display: flex; }
input {
  font: inherit;
  font-size: 13px;
  width: 170px;
  height: 34px;
  box-sizing: border-box;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--tk-border);
  background: var(--tk-surface);
  color: var(--tk-text);
  box-shadow: var(--tk-shadow);
}
/* The Talk and type buttons only show while the pointer is on Tekkie (or while you're typing). */
.controls, form.type { opacity: 0; pointer-events: none; transition: opacity 0.2s, transform 0.2s; transform: translateY(-6px); }
.tekkie.hovering .controls, .tekkie.hovering form.type, form.type:focus-within { opacity: 1; pointer-events: auto; transform: none; }

/* Hidden for a while: only a small tab at the bottom edge brings Tekkie back. */
.tekkie.hidden { display: none; }
.peek {
  position: fixed;
  z-index: 2147483000;
  bottom: 16px;
  right: 16px;
  display: none;
  height: 30px;
  padding: 0 12px;
  font-size: 12px;
  opacity: 0.85;
}
.peek.left { right: auto; left: 16px; }
.peek.show { display: inline-flex; animation: tk-pop 0.18s ease-out; }
.peek:hover { opacity: 1; }

/* Sleeping: floating z's. */
.zz { position: absolute; right: 52px; top: 18px; font: 700 18px/1 ui-rounded, system-ui, sans-serif; color: #b9b2ff; opacity: 0; pointer-events: none; }
.zz span { display: inline-block; }
.sleeping .zz { opacity: 1; }
.sleeping .zz, .sleeping .zz span { animation: tk-zz 2.4s ease-in-out infinite; }
.zz span:nth-child(1) { font-size: 14px; animation-delay: 0.4s; }
.zz span:nth-child(2) { font-size: 11px; animation-delay: 0.8s; }
@keyframes tk-zz { 0% { transform: translate(0, 6px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translate(10px, -16px); opacity: 0; } }

/* Panels above Tekkie: history, plan, games, care. */
.panel {
  pointer-events: auto;
  box-sizing: border-box;
  width: 260px;
  max-height: 380px;
  display: none;
  flex-direction: column;
  margin-bottom: 8px;
  border-radius: 16px;
  background: var(--tk-surface);
  color: var(--tk-text);
  border: 1px solid var(--tk-border);
  box-shadow: var(--tk-shadow);
  font-size: 13px;
  line-height: 1.4;
  overflow: hidden;
}
.panel.show { display: flex; animation: tk-pop 0.18s ease-out; }
@keyframes tk-pop { from { transform: translateY(6px) scale(0.97); opacity: 0; } }
.panel header { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 6px 14px; font-weight: 700; }
.panel-close { width: 26px; height: 26px; padding: 0; justify-content: center; box-shadow: none; font-size: 16px; }
.panel-body { padding: 0 12px 12px; overflow: auto; }
.muted { color: var(--tk-muted); margin: 6px 0; }
button.small { height: 24px; padding: 0 9px; font-size: 11px; box-shadow: none; }
.history { list-style: none; margin: 8px 0 0; padding: 0; max-height: 220px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.history li { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; align-items: start; padding: 6px 8px; border-radius: 10px; background: rgba(124, 92, 255, 0.08); }
.history li.user { background: rgba(127, 127, 160, 0.1); }
.history .who { font-weight: 700; font-size: 11px; color: var(--tk-muted); }
.history .line { grid-column: 1 / -1; user-select: text; -webkit-user-select: text; }
.history .copy-line { grid-row: 1; grid-column: 2; justify-self: end; }
.plan-title { font-weight: 700; margin: 4px 0 6px; }
.progress { height: 6px; border-radius: 6px; background: rgba(127, 127, 160, 0.2); overflow: hidden; margin-bottom: 8px; }
.progress span { display: block; height: 100%; background: var(--tk-accent); transition: width 0.3s; }
.plan { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.plan li { display: flex; gap: 8px; align-items: baseline; }
.plan .tick { width: 14px; text-align: center; font-weight: 700; color: var(--tk-muted); }
.plan li.done { color: var(--tk-muted); text-decoration: line-through; }
.plan li.done .tick { color: #1a9a52; }
.plan li.doing { font-weight: 700; }
.plan li.doing .tick { color: var(--tk-accent); }
.plan li.failed .tick { color: var(--tk-danger); }
.game-list { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 8px; }
.game-pick { height: 30px; padding: 0 10px; font-size: 12px; box-shadow: none; }
.game-row { display: flex; gap: 8px; justify-content: center; }
.game-btn { width: 52px; height: 52px; font-size: 24px; justify-content: center; padding: 0; }
.game-score { text-align: center; font-weight: 700; margin: 4px 0 8px; }
.game-msg { text-align: center; margin: 8px 0 4px; }
.game-start { margin: 6px auto 0; display: flex; }
.ttt { display: grid; grid-template-columns: repeat(3, 52px); gap: 6px; justify-content: center; }
.ttt-cell { width: 52px; height: 52px; padding: 0; justify-content: center; font-size: 22px; border-radius: 12px; box-shadow: none; }
.level { margin: 4px 0 10px; }
.stat { display: grid; grid-template-columns: 78px 1fr; align-items: center; gap: 8px; margin-bottom: 6px; }
.meter { height: 8px; border-radius: 8px; background: rgba(127, 127, 160, 0.2); overflow: hidden; }
.meter span { display: block; height: 100%; border-radius: 8px; transition: width 0.4s; }
.food .meter span { background: #ff9a3c; }
.mood .meter span { background: #ff6fb5; }
.energy .meter span { background: #4dd8ff; }
.care-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
.care-actions button { justify-content: center; box-shadow: none; }

@media (max-width: 480px) {
  .scale { width: 160px; }
  .stagewrap, .stage { width: 160px; }
  .stage { height: 185px; }
  .bubble { max-width: 220px; font-size: 13px; }
  .panel { width: 230px; }
}
`;

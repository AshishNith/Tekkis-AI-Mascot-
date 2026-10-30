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
  width: 210px;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
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
  pointer-events: auto;
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
  pointer-events: auto;
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
@media (max-width: 480px) {
  .tekkie:not(.embedded) { width: 160px; }
  .tekkie:not(.embedded) .stage { width: 160px; height: 185px; }
  .bubble { max-width: 220px; font-size: 13px; }
}
`;

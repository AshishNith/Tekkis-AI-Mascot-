# Tekkie — AI mascot

A playful 3D AI buddy that floats over your screen and talks with you in real time.
This repo is built step by step; see [`docs/PLAN.md`](docs/PLAN.md) for decisions and roadmap.

**Step 1 (this commit):** a 3D Tekkie character with realtime voice conversation.

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

Add your Gemini API key (from https://aistudio.google.com/apikey) to `.env` as `GEMINI_API_KEY`, then:

```bash
npm run dev
```

Open http://localhost:5173, tap Tekkie (or press **Talk**), allow the microphone and start talking.
Headphones give the best experience (no echo).

To check which realtime models your key can use:

```bash
npm run models -w server
```

### Chrome extension

Tekkie also ships as a Chrome extension that floats over every website (`apps/extension`).

```bash
npm run build:extension
```

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `apps/extension/dist`.
2. Chrome opens a tab asking for the microphone. Allow it once and it works on every site.
3. Keep the voice server running (`npm run dev`, or just `npm run dev -w server`). The toolbar popup lets you switch Tekkie on/off, pick a skin and set the server URL (default `http://localhost:8787`).

**Browser control:** ask Tekkie to "search for sneakers", "click the second result", "scroll down" or "go back". It can read the page, click, type, scroll and open links or tabs, and shows a purple ring around whatever it touches. It never types into password or payment fields and asks you before risky buttons (buy, pay, send, delete). Clicks, typing, hover and key presses are sent as real browser input (through Chrome's debugger), so they work on sites that ignore scripted events; Chrome shows its "started debugging this browser" bar while Tekkie is acting, and it lets go when the chat ends. Tekkie can also list, switch and close tabs, reload, and go back/forward. Turn it off in the toolbar popup.

**Screen reading:** ask "what's on my screen?" and Tekkie takes a screenshot of your current tab and sends it to Gemini. Only when you ask. Switch it off under Settings in the popup.

Tekkie draws itself straight into the page (in a shadow root), while the voice engine, microphone and speaker run in the extension's background page, so strict site security rules can't block it and the chat survives page changes. Tekkie follows you from tab to tab (it is added to the tab you switch to, and its position stays in sync). Click the toolbar icon for the control panel: **Show Tekkie on this page**, **Talk**, and a text box.

### Making Tekkie feel alive

Tekkie is lit like a glossy plastic-and-metal toy (physically based materials and a studio reflection map), with jointed legs and arms. It wanders along the bottom of the page on its own, turning to face where it is going, and sometimes stops to wave or dance. Hover over it and it leans toward your pointer, blushes, waves, and shows option chips: **talk**, **what's on my screen**, **dance**, **follow my cursor** and **walk around on its own**. It stays still when you are talking to it, dragging it, or have reduced motion switched on in your system.

### Everything Tekkie can do

- **Talk your way:** click Talk, hold <kbd>Alt</kbd>+<kbd>T</kbd> on any page (hold-to-talk), press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> anywhere, or say "Hey Tekkie" (optional wake word). <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> shows or hides Tekkie. Pick its voice and reply language in the popup.
- **Chat history:** the 📜 chip shows the whole conversation with copy buttons, in every tab.
- **Feelings:** Tekkie laughs, celebrates (with confetti), looks surprised, sad, in love or munches a snack, on its own during a chat or when something happens. It dozes off when you've been away for a while.
- **Mini-games:** rock paper scissors, tic-tac-toe and "catch me" (🎮 chip).
- **Climbing:** it jumps onto buttons, headings and pictures on the page and sits there for a while.
- **Pet care:** feed, play, pet (or rub your cursor over it) and let it nap (🍪 chip). Food, mood and energy change over time; caring for it raises the bond level, which unlocks skins.
- **Page help:** right-click selected text → Ask Tekkie (explain, summarize, translate, read aloud). Tekkie can point at the next thing to click with a glowing arrow, and shows a checklist for bigger jobs.
- **Notes & reminders:** "note this", "add milk to my to-do list", "remind me in 10 minutes to stretch". See and edit them in the popup.
- **Memory:** Tekkie remembers what you ask it to (your name, what you like) and you can delete any of it, or everything, in the popup.
- **Tutor mode:** a parent-PIN-locked kid-safe mode: hints instead of answers, child-friendly topics, no buying or signing up.
- **Per-site controls:** hide Tekkie, or stop it clicking and typing, on specific websites.
- **Your look:** your own colours, size and home corner.

### Production build

```bash
npm run build && npm start
```

The server then serves the built site and the API on `PORT` (default 8787).

## How it works

```
Browser (apps/web)                         Server (server/)                 Google
──────────────────                         ────────────────                 ──────
Tekkie widget ── POST /api/live-token ───► mints 1-use ephemeral token ──► Gemini API
     │                                     (model, voice, persona locked)
     └── WebSocket (mic 16 kHz PCM ⇄ voice 24 kHz PCM) ─────────────────► Gemini Live
```

- The real API key never leaves the server. The browser gets a single-use token that expires
  in a minute if unused and that can only open a Tekkie session (model, voice and persona locked).
- Audio streams directly between the browser and Gemini, so the server stays tiny and cheap.
- The token endpoint is rate-limited per IP and only accepts allowed origins (`ALLOWED_ORIGINS`).

## Project layout

| Path | What |
|---|---|
| `apps/web/src/mascot/TekkieCharacter.ts` | The 3D character (Three.js): hover, blink, cursor-follow, lip sync, wave, states |
| `apps/web/src/mascot/skins.ts` | Skins as data (colours + accessory) — basis for the skins store |
| `apps/web/src/voice/LiveVoiceSession.ts` | Realtime conversation with Gemini Live: states, captions, interruptions |
| `apps/web/src/voice/audio.ts`, `pcm-capture-worklet.js` | Mic capture (16 kHz PCM) and gap-free playback with loudness for lip sync |
| `apps/web/src/widget/` | Floating, draggable widget in a Shadow DOM (safe to drop on any site) |
| `server/src/` | Token server, Tekkie's persona, model listing script |

## Tekkie's states

The antenna shows what Tekkie is doing: **green** listening · **yellow** thinking/connecting ·
**skin glow** talking · **red** error.

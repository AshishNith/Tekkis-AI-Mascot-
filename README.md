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

**Browser control:** ask Tekkie to "search for sneakers", "click the second result", "scroll down" or "go back". It can read the page, click, type, scroll and open links or tabs, and shows a purple ring around whatever it touches. It never types into password or payment fields and asks you before risky buttons (buy, pay, send, delete). Turn it off in the toolbar popup.

Tekkie lives in an extension iframe so the mic permission is per extension, not per site. Sites with a strict `frame-src` CSP can block it.

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

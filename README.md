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

### Production build

```bash
npm run build && npm start
```

The server then serves the built site and the API on `PORT` (default 8787).

## Android app (APK)

`apps/mobile` wraps Tekkie in a native Android app with [Capacitor](https://capacitorjs.com): full-screen
Tekkie, a big mic button, captions, skins and a Settings screen.

**Install:** copy `tekkie.apk` to your phone, open it, and allow "Install unknown apps" when Android asks.
On first launch Tekkie opens Settings — pick how it connects:

- **My Gemini key** — saved only on that phone (Android backup is disabled for the app). Best for testing.
- **Tekkie server** — e.g. your PC on the same Wi-Fi: run `npm run dev` and type in the
  `On your phone (same Wi-Fi): http://…:8787` address it prints. Allow Node.js through the Windows firewall
  if asked. This is the production path (later on AWS).

"Let me interrupt Tekkie" is off by default: on a phone speaker Tekkie would otherwise hear itself.
Turn it on with headphones.

**Build the APK yourself** (needs Android Studio or the Android SDK + JDK 21):

```bash
npm run build:mobile
```

Then open `apps/mobile/android` in Android Studio and press Run, or build from that folder with
`gradlew assembleDebug` (Windows: `gradlew.bat assembleDebug`). The APK lands in
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

App icons and splash screens come from `apps/mobile/assets/` (regenerate with
`npx @capacitor/assets generate --android --assetPath assets` inside `apps/mobile`).

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
| `apps/mobile/` | Android app (Capacitor): phone layout, settings, connection modes |
| `shared/tekkie-persona.md` | Tekkie's personality, used by the server and the app |
| `server/src/` | Token server and model listing script |

## Tekkie's states

The antenna shows what Tekkie is doing: **green** listening · **yellow** thinking/connecting ·
**skin glow** talking · **red** error.

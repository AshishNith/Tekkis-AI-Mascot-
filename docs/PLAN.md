# Tekkie — plan

## Decisions (agreed 30 Oct 2026)

| Topic | Decision |
|---|---|
| MVP platform | Chrome extension + embeddable website widget (one web codebase) |
| Screen awareness | Continuous activity memory, opt-in with clear consent; on-device by default |
| AI brain + voice | Gemini Live (realtime speech-to-speech), behind a thin layer so models can be swapped |
| 3D character | Procedural Three.js Tekkie now; a designer's rigged GLB can replace it later |
| December MVP scope | Voice/text chat, page/screen help, tutor hint mode, platform guide, memory, subscriptions, skins store, referral codes |
| Repo / hosting | Separate project from the 5-tool platform; hosted on AWS |

Timeline from the 28 Oct meeting: project start no later than 28 Nov, launch mid/late December.

## Roadmap

1. **3D character + realtime voice** ✅ — floating draggable Tekkie, lip sync, states, Gemini Live voice, skins as data.
   - **Android app** ✅ — Capacitor APK with full-screen Tekkie, settings, key-on-device or server connection. Floating over other apps (Android overlay bubble) comes later as a native feature.
2. **Chrome extension shell** — MV3 extension that injects the widget on any site, settings popup, mic permission flow.
3. **Screen awareness (on demand)** — read the active tab (text + screenshot) and send it to Gemini so Tekkie can answer "what's this?".
4. **Accounts + memory** — sign-in, remembered facts/preferences, opt-in activity timeline stored locally with a consent screen and a delete-all button.
5. **Tutor mode** — hint-not-answer behaviour, kid-safe mode, parent controls.
6. **Platform guide** — Tekkie points at and explains buttons on our own site (tool calling + element highlighting).
7. **Monetisation** — Stripe subscriptions (Free / Premium / Premium+), skins store, referral codes.
8. **B2B widget** — one-line embed for other businesses, their own knowledge base and branding, site analytics.
9. **Launch hardening** — AWS deploy, monitoring, per-user usage caps and cost tracking.

## Principles

- Ask before collecting anything; keep personal data on the device unless the user opts in.
- No selling of personal data. Aggregate, anonymous insights only, with consent.
- Children's data needs parental consent; tutor mode defaults to the strictest settings.
- The Gemini key never reaches the browser; voice sessions use short-lived locked tokens.

// Headless capture rig for the launch video: a bare TekkieCharacter on a transparent canvas,
// stepped frame by frame from Playwright through window.rig. Not part of the shipped site.
import { TekkieCharacter, type Emote, type FormKind } from "./mascot/TekkieCharacter";
import type { VoiceState } from "./voice/LiveVoiceSession";
import { ACCESSORIES, SKINS } from "./mascot/skins";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const W = Number(params.get("w") ?? 900);
const H = Number(params.get("h") ?? 900);
canvas.width = W;
canvas.height = H;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;

const character = new TekkieCharacter(canvas, (params.get("form") as FormKind) ?? "robot");
character.resize(W, H);
character.setCamera(Number(params.get("az") ?? 0.15), Number(params.get("el") ?? 0.12), Number(params.get("dist") ?? 6.2), Number(params.get("ty") ?? 0.1));
character.place(0, 0, 0, Number(params.get("scale") ?? 1), 0);

const rig = {
  character,
  step(dt: number) {
    character.update(dt);
  },
  form: (k: FormKind) => character.setForm(k),
  skin: (id: string) => {
    const s = SKINS.find((x) => x.id === id);
    if (s) character.setSkin(s);
  },
  hat: (id: string | null) => character.setAccessory(id && ACCESSORIES.some((a) => a.id === id) ? (id as never) : null),
  state: (s: VoiceState) => character.setState(s),
  levels: (out: number, inp: number, wide: number) => character.setLevels(out, inp, wide),
  emote: (k: Emote) => character.emote(k),
  wave: () => character.wave(),
  dance: () => character.dance(),
  walk: (d: number) => character.setWalk(d),
  look: (x: number, y: number) => character.lookAt(x, y),
  hover: (on: boolean) => character.setHover(on),
  sleepy: (on: boolean) => character.setSleepy(on),
  sit: (on: boolean) => character.setSitting(on),
  mood: (energy: number, mood: number) => character.setMood({ energy, mood }),
  camera: (az: number, el: number, dist: number, ty = 0.1) => character.setCamera(az, el, dist, ty),
  place: (x: number, y: number, z = 0, scale = 1, yaw = 0) => character.place(x, y, z, scale, yaw),
};
(window as unknown as { rig: typeof rig }).rig = rig;
// Settle materials/env before the first screenshot.
for (let i = 0; i < 3; i++) character.update(1 / 30);

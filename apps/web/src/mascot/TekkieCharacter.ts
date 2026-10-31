import * as THREE from "three";
import { DEFAULT_SKIN, type Accessory, type Skin } from "./skins";
import type { VoiceState } from "../voice/LiveVoiceSession";
import { FLOOR_Y, disposeMaterials, makeMaterials, smooth, type Face, type Form, type FormKind, type Materials, type Pose } from "./forms/common";
import { RobotForm } from "./forms/robot";
import { HumanoidForm } from "./forms/humanoid";
import { CreatureForm } from "./forms/creature";
import { GlbForm } from "./forms/glb";

export type { FormKind } from "./forms/common";
export { FORMS } from "./forms/common";

const STATE_GLOW: Partial<Record<VoiceState, number>> = {
  listening: 0x4dff88,
  connecting: 0xffd84d,
  thinking: 0xffd84d,
  error: 0xff4d5e,
};

const DANCE_SECONDS = 4.2;

/** Short full-body reactions, triggered by the widget, the AI (emote tool) or Tekkie's own idle fidgets. */
export type Emote =
  | "laugh"
  | "celebrate"
  | "surprised"
  | "sad"
  | "love"
  | "eat"
  | "nod"
  | "shake"
  | "shrug"
  | "think"
  | "angry"
  | "yawn"
  | "stretch"
  | "wave"
  | "lookaround";
export const EMOTES: Emote[] = ["laugh", "celebrate", "surprised", "sad", "love", "eat", "nod", "shake", "shrug", "think", "angry", "yawn", "stretch", "wave"];
const EMOTE_SECONDS: Record<Emote, number> = {
  laugh: 2.2,
  celebrate: 2.6,
  surprised: 1.6,
  sad: 2.6,
  love: 2.4,
  eat: 2.0,
  nod: 1.2,
  shake: 1.3,
  shrug: 1.6,
  think: 2.4,
  angry: 2.2,
  yawn: 2.6,
  stretch: 2.4,
  wave: 1.6,
  lookaround: 3.2,
};
const IDLE_FIDGETS: Emote[] = ["lookaround", "stretch", "shrug", "nod", "lookaround", "think"];
const CONFETTI_COLORS = [0xff4f81, 0xffd84d, 0x4dff88, 0x7ff6ff, 0x9d7bff, 0xff9a3c];

function blobShadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(20,10,40,0.35)");
  grad.addColorStop(0.5, "rgba(20,10,40,0.14)");
  grad.addColorStop(1, "rgba(20,10,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** A small photo studio (sky gradient, big soft key box, cool fill, warm rim) baked into an environment map. */
function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: "varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "varying vec3 p; void main(){ float h = normalize(p).y; vec3 top = vec3(0.55,0.6,0.85); vec3 mid = vec3(0.82,0.84,0.95); vec3 bottom = vec3(0.35,0.3,0.45); vec3 c = h > 0.0 ? mix(mid, top, h) : mix(mid, bottom, -h); gl_FragColor = vec4(c * 0.9, 1.0); }",
    }),
  );
  scene.add(sky);
  const box = (w: number, h: number, intensity: number, color: number, pos: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.material.color.multiplyScalar(intensity);
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  box(6, 6, 6, 0xffffff, [4, 5, 6]); // key
  box(8, 4, 2.5, 0xbfd4ff, [-7, 2, 3]); // cool fill
  box(3, 6, 5, 0xffd9b0, [-4, 3, -7]); // warm rim
  box(10, 2, 1.5, 0xffffff, [0, 8, 0]); // top light
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return tex;
}

/**
 * Tekkie on a canvas: a lit studio scene with one of several bodies ("forms") in it, driven by the
 * voice state, the pointer, moods and short emotes. The forms share one animation driver, so a
 * robot, a buddy, a critter or a dropped-in GLB all walk, dance, blink and lip-sync the same way.
 */
export class TekkieCharacter {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private envMap: THREE.Texture;
  private mats: Materials = makeMaterials();

  private rig = new THREE.Group();
  private float = new THREE.Group();
  private key: THREE.DirectionalLight;
  private keyBase = new THREE.Vector3(2.6, 4.5, 4.5);
  /** Extra body turn set by the host page (e.g. facing the copy next to it). */
  private yawOffset = 0;
  private camTarget = new THREE.Vector3(0, 0.05, 0);
  private form!: Form;
  private shadowFloor: THREE.Mesh;
  private blob: THREE.Mesh;
  private confetti: { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 }[] = [];

  private skin: Skin = DEFAULT_SKIN;
  private accessoryOverride: Accessory | null = null;
  private state: VoiceState = "idle";
  private look = new THREE.Vector2();
  private lookSmoothed = new THREE.Vector2();
  private glance = new THREE.Vector2();
  private level = 0;
  private micLevel = 0;
  private wide = 0.5;
  private wideSmoothed = 0.5;
  private time = 0;
  private nextBlink = 2;
  private blinkT = -1;
  private waveT = -1;
  private pokeT = -1;
  private danceT = -1;
  private lastRigRotY = 0;
  private talkLevel = 0;
  private walkDir = 0;
  private walk = 0;
  private walkPhase = 0;
  private faceYaw = 0;
  private hovered = false;
  private hoverBlend = 0;
  private happy = 0;
  private emoteKind: Emote | null = null;
  private emoteT = 0;
  private nextFidget = 8;
  private sleepy = false;
  private sleepBlend = 0;
  private sitting = false;
  private sitBlend = 0;
  private confettiT = -1;
  private tired = 0;
  private grumpy = 0;
  fidgets = true;

  /** Called whenever an emote starts (the widget plays a sound). */
  onEmote?: (kind: Emote, idle: boolean) => void;
  /** Called on each footstep while walking. */
  onStep?: () => void;

  constructor(canvas: HTMLCanvasElement, form: FormKind = "robot") {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera.position.set(0, 0.3, 8.2);
    this.camera.lookAt(0, 0.05, 0);

    this.envMap = studioEnvironment(this.renderer);
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.75;

    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x6b5a8c, 0.5));
    const key = new THREE.DirectionalLight(0xfff4e8, 2.2);
    key.position.copy(this.keyBase);
    key.castShadow = true;
    this.key = key;
    this.scene.add(key.target);
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -2.6;
    key.shadow.camera.right = key.shadow.camera.top = 2.6;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 14;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ec5ff, 1.4);
    rim.position.set(-3.5, 2, -3);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-2, 1, 4);
    this.scene.add(fill);

    this.scene.add(this.rig);
    this.rig.add(this.float);

    // Floor: a real contact shadow from the key light, plus a soft blob for ambient darkening.
    this.shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.28, transparent: true }));
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.position.y = FLOOR_Y;
    this.shadowFloor.receiveShadow = true;
    this.rig.add(this.shadowFloor);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = FLOOR_Y + 0.005;
    this.rig.add(this.blob);

    const bit = new THREE.PlaneGeometry(0.09, 0.05);
    for (let i = 0; i < 32; i++) {
      const mesh = new THREE.Mesh(bit, new THREE.MeshBasicMaterial({ color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], side: THREE.DoubleSide, transparent: true }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.confetti.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }

    this.setForm(form);
  }

  get currentForm(): FormKind {
    return this.form.kind;
  }

  /** Switches the body. The skin, hat and mood carry over. */
  setForm(kind: FormKind | Form) {
    const next: Form = typeof kind === "string" ? (kind === "humanoid" ? new HumanoidForm(this.mats) : kind === "creature" ? new CreatureForm(this.mats) : new RobotForm(this.mats)) : kind;
    if (this.form) {
      this.float.remove(this.form.root);
      this.form.dispose();
    }
    this.form = next;
    next.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.float.add(next.root);
    this.applySkin();
    this.poke();
  }

  /** Loads a .glb (rigged model) and wears it. Falls back to the robot if it can't be read. */
  async loadModel(bytes: ArrayBuffer) {
    const form = await GlbForm.load(bytes);
    this.setForm(form);
  }

  private applySkin() {
    this.form.applySkin(this.skin);
    const wear = this.accessoryOverride ?? this.skin.accessory;
    for (const [id, group] of this.form.accessories) group.visible = id === wear;
    this.form.applySkin(this.skin); // some forms hide bits under hats
  }

  setSkin(skin: Skin) {
    this.skin = skin;
    this.applySkin();
    this.poke();
  }

  /** Wear a hat or outfit regardless of the skin (null = whatever the skin says). */
  setAccessory(accessory: Accessory | null) {
    this.accessoryOverride = accessory;
    this.applySkin();
  }

  setState(state: VoiceState) {
    if (state === this.state) return;
    if (state === "listening" && this.state === "connecting") this.wave();
    this.state = state;
  }

  /** Where the user's pointer is relative to Tekkie, roughly -1..1 on each axis. */
  lookAt(x: number, y: number) {
    this.look.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
  }

  /** Audio loudness and mouth shape: Tekkie's voice drives the mouth, the mic drives the "listening" pulse. */
  setLevels(output: number, input: number, wide = 0.5) {
    this.level = output;
    this.micLevel = input;
    this.wide = wide;
  }

  /** How Tekkie is feeling from its care stats (0..100 each): tired and grumpy show in the idle pose. */
  setMood(m: { energy: number; mood: number }) {
    this.tired = THREE.MathUtils.clamp((45 - m.energy) / 45, 0, 1);
    this.grumpy = THREE.MathUtils.clamp((30 - m.mood) / 30, 0, 1);
  }

  wave() {
    this.waveT = 0;
    (this.form as GlbForm).cue?.("wave");
  }

  poke() {
    this.pokeT = 0;
  }

  /** Walk left (-1) or right (1), or stand still (0). Call every frame while moving. */
  setWalk(direction: number) {
    this.walkDir = Math.sign(direction);
  }

  /** The pointer is over Tekkie: lean in, light up, look happy. */
  setHover(on: boolean) {
    if (on && !this.hovered) {
      this.poke();
      if (this.waveT < 0) this.wave();
    }
    this.hovered = on;
  }

  dance() {
    this.danceT = 0;
  }

  /** A short full-body reaction. */
  emote(kind: Emote, idle = false) {
    if (idle && this.emoteKind) return; // never interrupt a real feeling with a fidget
    this.emoteKind = kind;
    this.emoteT = 0;
    if (kind === "celebrate") this.burstConfetti();
    if (kind === "wave") this.wave();
    if (kind === "lookaround") this.glance.set(Math.random() < 0.5 ? -1 : 1, 0.3 + Math.random() * 0.5);
    this.onEmote?.(kind, idle);
  }

  /** Dozing off after a long time with nothing happening. */
  setSleepy(on: boolean) {
    this.sleepy = on;
  }

  /** Sitting on the edge of something, legs dangling. */
  setSitting(on: boolean) {
    this.sitting = on;
  }

  private burstConfetti() {
    this.confettiT = 0;
    for (const c of this.confetti) {
      c.mesh.visible = true;
      c.mesh.position.set((Math.random() - 0.5) * 0.4, 1.1 * this.rig.scale.y, (Math.random() - 0.5) * 0.4).add(this.rig.position);
      c.vel.set((Math.random() - 0.5) * 3.2, 2.6 + Math.random() * 2.2, (Math.random() - 0.5) * 1.5);
      c.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      (c.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    }
  }

  get dancing() {
    return this.danceT >= 0;
  }

  /**
   * Moves the whole character (and its light and shadow) around the stage, so a page can walk
   * Tekkie from one section to the next. Scale is uniform; yaw is an extra body turn in radians.
   */
  place(x: number, y: number, z = 0, scale = 1, yaw = 0) {
    this.rig.position.set(x, y, z);
    this.rig.scale.setScalar(scale);
    this.yawOffset = yaw;
    this.key.position.copy(this.keyBase).add(this.rig.position);
    this.key.target.position.copy(this.rig.position);
  }

  /** Orbits the camera around the stage: azimuth/elevation in radians, distance in scene units. */
  setCamera(azimuth: number, elevation: number, distance: number, targetY = 0.05) {
    this.camTarget.set(0, targetY, 0);
    this.camera.position.set(
      Math.sin(azimuth) * Math.cos(elevation) * distance,
      Math.sin(elevation) * distance + targetY,
      Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    this.camera.lookAt(this.camTarget);
    // Keep the projection usable before the next render (toScreen reads these matrices).
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
  }

  /** Where a point on the character (stage units, relative to its feet) lands on the canvas, in pixels. */
  toScreen(dx: number, dy: number, dz: number, width: number, height: number) {
    const v = new THREE.Vector3(dx, dy, dz).multiplyScalar(this.rig.scale.x).add(this.rig.position).project(this.camera);
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible: v.z < 1 };
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    const t = (this.time += dt);
    const s = this.state;
    const speaking = s === "speaking";
    const thinking = s === "thinking" || s === "connecting";
    const form = this.form;

    // Speech loudness, boosted and smoothed so the mouth reads clearly; the shape follows a beat behind.
    const target = speaking ? Math.min(1, this.level * 5) : 0;
    const talk = (this.talkLevel = smooth(this.talkLevel, target, target > this.talkLevel ? 30 : 12, dt));
    this.wideSmoothed = smooth(this.wideSmoothed, this.wide, 14, dt);

    // Walking fades in and out; the stride phase only advances while moving.
    this.walk = smooth(this.walk, this.walkDir !== 0 ? 1 : 0, 9, dt);
    const prevPhase = this.walkPhase;
    this.walkPhase += dt * 9.5 * this.walk;
    const stride = this.walk;
    const phase = this.walkPhase;
    if (stride > 0.5 && Math.floor(prevPhase / Math.PI) !== Math.floor(phase / Math.PI)) this.onStep?.();
    const facing = this.walkDir !== 0 ? this.walkDir * 0.95 : 0;
    this.faceYaw = smooth(this.faceYaw, facing, 7, dt);

    // Emote clock: `e` is 0..1..0 over the emote so poses ease in and out.
    let e = 0;
    const emote = this.emoteKind;
    if (emote) {
      this.emoteT += dt;
      const len = EMOTE_SECONDS[emote];
      e = Math.min(1, this.emoteT / 0.2) * Math.min(1, (len - this.emoteT) / 0.3);
      if (this.emoteT > len) this.emoteKind = null;
    }
    const is = (k: Emote) => (emote === k ? Math.max(0, e) : 0);
    const laugh = is("laugh"), celebrate = is("celebrate"), surprised = is("surprised"), sad = is("sad"), love = is("love"), eat = is("eat");
    const nod = is("nod"), shake = is("shake"), shrug = is("shrug"), think = is("think"), angry = is("angry"), yawn = is("yawn"), stretch = is("stretch"), lookaround = is("lookaround");
    this.sleepBlend = smooth(this.sleepBlend, this.sleepy && s === "idle" ? 1 : 0, 2.5, dt);
    const sleep = this.sleepBlend;
    this.sitBlend = smooth(this.sitBlend, this.sitting ? 1 : 0, 8, dt);
    const sit = this.sitBlend;
    const tired = this.tired * (1 - sleep);
    const grumpy = this.grumpy;

    // Idle fidgets: now and then, when nothing else is going on.
    const busy = s !== "idle" || stride > 0.1 || this.danceT >= 0 || emote || this.sleepy || this.hovered;
    if (this.fidgets && !busy) {
      this.nextFidget -= dt;
      if (this.nextFidget <= 0) {
        this.nextFidget = 7 + Math.random() * 9;
        const pick = tired > 0.4 && Math.random() < 0.5 ? "yawn" : IDLE_FIDGETS[Math.floor(Math.random() * IDLE_FIDGETS.length)];
        this.emote(pick, true);
      }
    } else if (busy && !emote) this.nextFidget = Math.max(this.nextFidget, 4);

    // Dance clock and hover blend.
    let dance = 0;
    if (this.danceT >= 0) {
      this.danceT += dt;
      dance = Math.min(1, this.danceT / 0.3) * Math.min(1, (DANCE_SECONDS - this.danceT) / 0.4);
      if (this.danceT > DANCE_SECONDS) this.danceT = -1;
    }
    this.hoverBlend = smooth(this.hoverBlend, this.hovered ? 1 : 0, 8, dt);
    const hover = this.hoverBlend;
    this.happy = smooth(this.happy, Math.max(hover * 0.85, dance, this.waveT >= 0 ? 0.6 : 0, laugh, celebrate, love, eat * 0.8, nod * 0.4) * (1 - grumpy * 0.5), 8, dt);
    const happy = this.happy;

    // Hover and squash.
    let squash = talk * 0.06;
    if (this.pokeT >= 0) {
      this.pokeT += dt;
      squash += Math.sin(this.pokeT * 18) * Math.exp(-this.pokeT * 5) * 0.12;
      if (this.pokeT > 1.2) this.pokeT = -1;
    }
    squash -= stretch * 0.1 * Math.sin(Math.min(1, this.emoteT / 1.2) * Math.PI); // stretching up makes it taller
    const bounce =
      Math.abs(Math.sin(phase)) * 0.075 * stride +
      Math.abs(Math.sin(t * 7)) * 0.17 * dance +
      Math.abs(Math.sin(this.emoteT * 9)) * 0.28 * celebrate +
      Math.abs(Math.sin(this.emoteT * 16)) * 0.05 * laugh;
    const still = (1 - stride) * (1 - dance) * (1 - sit) * (1 - sleep * 0.7);
    const bobRate = 1.7 - sleep * 0.9 - tired * 0.6;
    this.float.position.y =
      Math.sin(t * bobRate) * 0.08 * still + bounce + talk * 0.05 + Math.sin(t * 8) * 0.012 * hover - sad * 0.08 - sit * form.sitDrop - tired * 0.05;
    this.float.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    const lift = Math.min(1, Math.max(0, (this.float.position.y + 0.1) / 0.3));
    this.blob.scale.setScalar(1 - lift * 0.15);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = (0.9 - lift * 0.3) * (1 - sit);
    (this.shadowFloor.material as THREE.ShadowMaterial).opacity = 0.28 * (1 - sit);

    // Follow the pointer (harder when hovered); thinking glances up and aside; "lookaround" drifts.
    const lookTarget = thinking || think > 0.3 ? new THREE.Vector2(0.55, 0.7) : lookaround > 0.3 ? this.glance.clone().multiplyScalar(Math.sin(this.emoteT * 1.5)) : this.look;
    this.lookSmoothed.x = smooth(this.lookSmoothed.x, lookTarget.x, 6 + hover * 4, dt);
    this.lookSmoothed.y = smooth(this.lookSmoothed.y, lookTarget.y, 6 + hover * 4, dt);
    const lx = this.lookSmoothed.x;
    const ly = this.lookSmoothed.y;
    const turnAway = 1 - Math.min(1, Math.abs(this.faceYaw));
    const headSeparate = form.head !== form.root;
    const bodyLook = headSeparate ? 0.5 : 1;
    this.rig.rotation.y =
      this.yawOffset +
      lx * (0.42 + hover * 0.3) * turnAway * bodyLook +
      this.faceYaw +
      (s === "connecting" ? Math.sin(t * 6) * 0.08 : 0) +
      Math.sin(t * 3.5) * 0.6 * dance +
      Math.sin(this.emoteT * 14) * 0.25 * shake;
    this.rig.rotation.x =
      -ly * (0.18 + hover * 0.14) * bodyLook +
      (s === "listening" ? 0.06 : 0) +
      stride * 0.07 +
      hover * 0.05 +
      sad * 0.25 +
      sleep * 0.22 -
      surprised * 0.2 +
      laugh * 0.1 +
      Math.sin(this.emoteT * 10) * 0.12 * nod +
      tired * 0.12 -
      stretch * 0.15 +
      yawn * 0.1;
    this.rig.rotation.z =
      Math.sin(t * 1.1) * 0.03 -
      lx * 0.05 +
      Math.sin(phase) * 0.035 * stride +
      Math.sin(t * 7) * 0.13 * dance +
      Math.sin(this.emoteT * 30) * 0.05 * laugh +
      Math.sin(t * 0.6) * 0.12 * sleep +
      Math.sin(this.emoteT * 4) * 0.08 * love +
      think * 0.12 +
      shrug * 0.06;
    if (headSeparate) {
      form.head.rotation.y = smooth(form.head.rotation.y, lx * 0.45 * turnAway + Math.sin(this.emoteT * 14) * 0.3 * shake + think * 0.2, 10, dt);
      form.head.rotation.x = smooth(form.head.rotation.x, -ly * 0.3 + Math.sin(this.emoteT * 10) * 0.15 * nod + sleep * 0.25 + sad * 0.15 - surprised * 0.1, 10, dt);
      form.head.rotation.z = smooth(form.head.rotation.z, think * 0.18 + Math.sin(t * 1.3) * 0.02 + love * 0.1, 8, dt);
    }

    // Blinking.
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    let lid = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      lid = Math.abs(Math.cos(Math.min(this.blinkT / 0.16, 1) * Math.PI));
      lid = Math.max(lid, 0.08);
      if (this.blinkT > 0.16) this.blinkT = -1;
    }
    const yawnOpen = yawn * Math.sin(Math.min(1, this.emoteT / EMOTE_SECONDS.yawn) * Math.PI);
    const chomp = Math.max(
      laugh * (0.5 + 0.5 * Math.abs(Math.sin(this.emoteT * 14))),
      eat * Math.abs(Math.sin(this.emoteT * 9)),
      surprised * 0.7,
      yawnOpen,
      angry * 0.3,
    );
    const face: Face = {
      lid: Math.min(lid, 1 - yawnOpen * 0.7) * (s === "listening" ? 1.1 : s === "error" ? 0.6 : 1),
      lookX: lx,
      lookY: ly,
      open: speaking ? talk : 0,
      wide: speaking ? this.wideSmoothed : surprised > 0.3 ? 0 : 0.5,
      happy,
      sad: Math.max(sad, grumpy * 0.3),
      surprised,
      love,
      sleep,
      angry: Math.max(angry, grumpy * 0.5),
      chomp,
      tired,
    };
    form.setFace(face);

    // Status lamp.
    const glow = celebrate > 0.2 ? 0xffd84d : love > 0.2 ? 0xff6fb5 : angry > 0.2 ? 0xff5a4d : hover > 0.5 && !STATE_GLOW[s] ? 0xff9ad0 : STATE_GLOW[s] ?? this.skin.glow;
    let pulse = 1 + Math.sin(t * 3) * 0.08 + hover * 0.3 * Math.abs(Math.sin(t * 6));
    if (s === "listening") pulse = 1 + Math.min(this.micLevel * 8, 0.8);
    if (thinking) pulse = 0.8 + Math.abs(Math.sin(t * 5)) * 0.5;
    if (speaking) pulse = 1 + talk * 0.7;
    form.setGlow(glow, pulse);

    // Arms: gentle sway, a swing opposite the legs when walking, talking gestures, and emotes.
    const rest = form.kind === "humanoid" ? 0.18 : form.kind === "creature" ? 0.6 : 0.35;
    form.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      let rz = side * (rest + Math.sin(t * 1.7 + i) * 0.06 + talk * 0.25 + stride * 0.08 - tired * 0.08);
      let rx = (speaking ? Math.sin(t * 7 + i * 2) * talk * 0.4 : 0) + Math.sin(phase + (i === 0 ? 0 : Math.PI)) * 0.6 * stride;
      const L = THREE.MathUtils.lerp;
      if ((thinking || think > 0) && side === 1) {
        const k = thinking ? 1 : think;
        rz = L(rz, 2.3, k); // hand up to scratch its head
        rx = L(rx, -0.6, k);
      }
      if (celebrate > 0) {
        rz = L(rz, side * (2.6 + Math.sin(this.emoteT * 12 + i) * 0.3), celebrate);
        rx = L(rx, 0, celebrate);
      }
      if (laugh > 0) {
        rz = L(rz, side * 0.15, laugh);
        rx = L(rx, -0.9 + Math.sin(this.emoteT * 16) * 0.1, laugh);
      }
      if (surprised > 0) rz = L(rz, side * 1.3, surprised);
      if (sad > 0 || sleep > 0) rz = L(rz, side * 0.12, Math.max(sad, sleep));
      if (love > 0) {
        rz = L(rz, side * 0.5, love);
        rx = L(rx, -1.2, love);
      }
      if (eat > 0 && side === 1) {
        rz = L(rz, 1.9, eat);
        rx = L(rx, -1.1, eat);
      }
      if (shrug > 0) {
        rz = L(rz, side * 1.1, shrug);
        rx = L(rx, -0.5, shrug);
      }
      if (angry > 0) {
        rz = L(rz, side * 0.25, angry); // fists down at the sides
        rx = L(rx, 0.3, angry);
      }
      if (stretch > 0) {
        const up = Math.sin(Math.min(1, this.emoteT / 1.2) * Math.PI);
        rz = L(rz, side * 2.9, stretch * up);
        rx = L(rx, 0, stretch);
      }
      if (yawn > 0 && side === 1) {
        rz = L(rz, 1.6, yawn * yawnOpen);
        rx = L(rx, -1.3, yawn * yawnOpen);
      }
      if (dance > 0) {
        rz = L(rz, side * (2.1 + Math.sin(t * 7 + i * Math.PI) * 0.55), dance);
        rx = L(rx, 0, dance);
      }
      if (this.waveT >= 0 && side === 1) {
        const w = Math.min(this.waveT / 0.25, 1) * Math.min((1.6 - this.waveT) / 0.25, 1);
        rz = L(rz, 2.6 + Math.sin(this.waveT * 14) * 0.35, Math.max(0, w));
      }
      arm.rotation.z = smooth(arm.rotation.z, rz, 12, dt);
      arm.rotation.x = smooth(arm.rotation.x, rx, 12, dt);
    });
    if (this.waveT >= 0) {
      this.waveT += dt;
      if (this.waveT > 1.6) this.waveT = -1;
    }

    // Legs: a stride when walking, a jig when dancing, a foot tap when thinking, otherwise a dangle.
    form.legs.forEach((leg, i) => {
      const p = phase + (i === 0 ? 0 : Math.PI);
      const dangle = Math.sin(t * 1.7 - 0.6 + i * 0.8) * 0.12 + talk * 0.1;
      const stepDance = Math.sin(t * 7 + i * Math.PI);
      const tap = i === 1 ? Math.max(0, Math.sin(t * 9)) * 0.3 * think : 0;
      const standHip = THREE.MathUtils.lerp(dangle, -Math.sin(p) * 0.7, stride) * (1 - dance) + stepDance * 0.45 * dance - tap * 0.4;
      const standKnee = Math.max(0, Math.cos(p)) * 0.95 * stride * (1 - dance) + Math.max(0, stepDance) * 0.7 * dance + tap;
      const kick = Math.sin(t * 2.2 + i * Math.PI) * 0.18;
      leg.hip.rotation.x = THREE.MathUtils.lerp(standHip, -1.35, sit);
      leg.knee.rotation.x = THREE.MathUtils.lerp(standKnee, 1.3 + kick, sit);
    });

    const turn = this.rig.rotation.y - this.lastRigRotY;
    this.lastRigRotY = this.rig.rotation.y;
    const pose: Pose = {
      t,
      talk,
      stride,
      phase,
      dance,
      hover,
      happy,
      sad,
      surprised,
      love,
      sleep,
      sit,
      tired,
      listening: s === "listening",
      thinking,
      speaking,
      micLevel: this.micLevel,
      turn,
    };
    form.animate(pose, dt);

    // Confetti falls with a bit of drag and fades out.
    if (this.confettiT >= 0) {
      this.confettiT += dt;
      for (const c of this.confetti) {
        c.vel.y -= 6 * dt;
        c.vel.multiplyScalar(1 - 0.8 * dt);
        c.mesh.position.addScaledVector(c.vel, dt);
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.y += c.spin.y * dt;
        (c.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - this.confettiT / 2.2);
      }
      if (this.confettiT > 2.2) {
        this.confettiT = -1;
        for (const c of this.confetti) c.mesh.visible = false;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.form.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    disposeMaterials(this.mats);
    for (const c of this.confetti) (c.mesh.material as THREE.Material).dispose();
    this.envMap.dispose();
  }
}

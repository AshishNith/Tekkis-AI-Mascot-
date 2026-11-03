// Shared building blocks for Tekkie's bodies ("forms"): materials, eyes, sneakers, hats and the
// interface the character animator drives. Every form lives in the same frame: the floor is at
// y = FLOOR_Y, the body stands around the origin, and the camera looks at it from z = +8.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Accessory, Skin } from "../skins";

export type FormKind = "robot" | "humanoid" | "creature" | "yeti" | "glb";

/** The bodies Tekkie can wear, the default first. */
export const FORMS: { id: FormKind; name: string; icon: string; blurb: string }[] = [
  { id: "yeti", name: "Yeti", icon: "🥽", blurb: "A fluffy blue yeti in goggles and a headset" },
  { id: "robot", name: "Robot", icon: "🤖", blurb: "Glossy little bot with a screen face" },
  { id: "humanoid", name: "Buddy", icon: "🧑‍🚀", blurb: "A stylised assistant in a hoodie" },
  { id: "creature", name: "Critter", icon: "🐾", blurb: "A fluffy big-eyed pet" },
];
export const DEFAULT_FORM: FormKind = FORMS[0].id;

export const FLOOR_Y = -1.62;
export const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** What the face should show this frame; every value 0..1 (look is -1..1). */
export interface Face {
  lid: number;
  lookX: number;
  lookY: number;
  /** Mouth opening from the voice. */
  open: number;
  /** Mouth shape: 0 = round "oh", 1 = wide "ee". */
  wide: number;
  happy: number;
  sad: number;
  surprised: number;
  love: number;
  sleep: number;
  angry: number;
  /** Mouth open for non-speech reasons (laughing, yawning, eating). */
  chomp: number;
  tired: number;
}

/** Whole-body blends the form may use for its own extras (antenna, ears, tail, hair). */
export interface Pose {
  t: number;
  talk: number;
  stride: number;
  /** Moving fast enough to run; only forms with a run clip show the difference. */
  running: boolean;
  /** How fast the body is moving over the ground, in world units per second, when known. */
  speed?: number;
  phase: number;
  dance: number;
  hover: number;
  happy: number;
  sad: number;
  surprised: number;
  love: number;
  sleep: number;
  sit: number;
  tired: number;
  listening: boolean;
  thinking: boolean;
  speaking: boolean;
  micLevel: number;
  /** Change in body yaw since last frame (for springy bits). */
  turn: number;
}

export interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
}

export interface Form {
  readonly kind: FormKind;
  readonly root: THREE.Group;
  /** Turns toward the look target on top of the body turn (the body itself for the robot). */
  readonly head: THREE.Object3D;
  readonly arms: THREE.Group[];
  readonly legs: Leg[];
  readonly accessories: Map<Accessory, THREE.Group>;
  /** Where the body sits when perched, relative to standing (hips drop by this much). */
  readonly sitDrop: number;
  applySkin(skin: Skin): void;
  setFace(f: Face): void;
  animate(p: Pose, dt: number): void;
  /** The status lamp colour and pulse (0.8..1.8). */
  setGlow(hex: number, pulse: number): void;
  dispose(): void;
}

/** Physically based materials shared by the forms; skins recolour them. */
export function makeMaterials() {
  return {
    body: new THREE.MeshPhysicalMaterial({ roughness: 0.38, metalness: 0.02, clearcoat: 0.9, clearcoatRoughness: 0.18 }),
    visor: new THREE.MeshPhysicalMaterial({
      roughness: 0.06,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 0.8,
      iridescence: 0.25,
      iridescenceIOR: 1.6,
    }),
    metal: new THREE.MeshStandardMaterial({ color: 0xcfd3e2, metalness: 0.95, roughness: 0.22 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2a2740, metalness: 0.85, roughness: 0.35 }),
    glow: new THREE.MeshBasicMaterial({ toneMapped: false }),
    spark: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    cheek: new THREE.MeshBasicMaterial({ color: 0xff7fa8, transparent: true, opacity: 0, depthWrite: false }),
    lamp: new THREE.MeshBasicMaterial({ toneMapped: false }),
    sneaker: new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    stripe: new THREE.MeshStandardMaterial({ roughness: 0.5 }),
    sole: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    glove: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, sheen: 0.6, sheenRoughness: 0.5 }),
    accessory: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    // Humanoid and critter.
    skinTone: new THREE.MeshPhysicalMaterial({ color: 0xf0c4a0, roughness: 0.55, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffd9c2) }),
    hair: new THREE.MeshPhysicalMaterial({ color: 0x3a2a24, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.35 }),
    cloth: new THREE.MeshPhysicalMaterial({ roughness: 0.85, sheen: 0.8, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff) }),
    fur: new THREE.MeshPhysicalMaterial({ roughness: 0.95, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffffff) }),
    fuzz: new THREE.MeshPhysicalMaterial({ roughness: 1, transparent: true, opacity: 0.22, depthWrite: false, sheen: 1, sheenRoughness: 0.4 }),
    eyeWhite: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    iris: new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
    pupil: new THREE.MeshBasicMaterial({ color: 0x0b0814 }),
    lid: new THREE.MeshPhysicalMaterial({ color: 0xf0c4a0, roughness: 0.55 }),
    brow: new THREE.MeshStandardMaterial({ color: 0x3a2a24, roughness: 0.8 }),
    mouthDark: new THREE.MeshStandardMaterial({ color: 0x4a1028, roughness: 0.6 }),
    lips: new THREE.MeshPhysicalMaterial({ color: 0xd9777a, roughness: 0.4, clearcoat: 0.6 }),
    tongue: new THREE.MeshStandardMaterial({ color: 0xe8788a, roughness: 0.5 }),
    nose: new THREE.MeshPhysicalMaterial({ color: 0x3b2630, roughness: 0.3, clearcoat: 1 }),
  };
}
export type Materials = ReturnType<typeof makeMaterials>;

export function disposeMaterials(mats: Materials) {
  Object.values(mats).forEach((m) => m.dispose());
}

export function roundedBox(w: number, h: number, d: number, r: number, mat: THREE.Material) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat);
}

/** Point on a unit sphere in three.js' SphereGeometry angle convention. */
export function spherePoint(phi: number, theta: number, r: number) {
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

export function placeOnSphere(obj: THREE.Object3D, phi: number, theta: number, r: number) {
  const p = spherePoint(phi, theta, r);
  obj.position.copy(p);
  obj.quaternion.setFromUnitVectors(Z_AXIS, p.normalize());
}

// --- Soft glow sprites: cheap "bloom" for lamps and eyes. ----------------------------------------

let glowTexture: THREE.Texture | undefined;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

export function glowSprite(size: number, opacity = 0.6) {
  const mat = new THREE.SpriteMaterial({ map: getGlowTexture(), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

// --- Eyes with a real ball, iris, pupil, highlight and lids. ---------------------------------------

export interface EyeRig {
  group: THREE.Group;
  pupilGroup: THREE.Group;
  lidTop: THREE.Mesh;
  lidBottom: THREE.Mesh;
  /** Opens/closes the lids (1 open) and aims the pupil (-1..1). */
  set(lid: number, lookX: number, lookY: number, squint: number): void;
}

/** A cartoon eyeball of radius r, looking down +z. Lids are sphere caps that slide over it. */
export function buildEye(mats: Materials, r: number, irisScale = 0.55): EyeRig {
  const group = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mats.eyeWhite);
  group.add(ball);
  const pupilGroup = new THREE.Group();
  const iris = new THREE.Mesh(new THREE.SphereGeometry(r * irisScale, 24, 16), mats.iris);
  iris.scale.z = 0.35;
  iris.position.z = r * 0.86;
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * irisScale * 0.52, 20, 12), mats.pupil);
  pupil.scale.z = 0.3;
  pupil.position.z = r * 0.98;
  const spark = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 12, 8), mats.spark);
  spark.position.set(-r * 0.22, r * 0.25, r * 1.02);
  const spark2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.07, 10, 6), mats.spark);
  spark2.position.set(r * 0.2, -r * 0.18, r * 1.03);
  pupilGroup.add(iris, pupil, spark, spark2);
  group.add(pupilGroup);
  const lidGeo = new THREE.SphereGeometry(r * 1.06, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const lidTop = new THREE.Mesh(lidGeo, mats.lid);
  const lidBottom = new THREE.Mesh(lidGeo, mats.lid);
  lidBottom.rotation.x = Math.PI;
  group.add(lidTop, lidBottom);
  return {
    group,
    pupilGroup,
    lidTop,
    lidBottom,
    set(lid, lookX, lookY, squint) {
      // Lids rest just above/below the ball when open and meet in the middle when closed.
      const closed = 1 - lid;
      lidTop.rotation.x = -Math.PI / 2 + 0.45 + closed * 1.1 + squint * 0.35;
      lidBottom.rotation.x = Math.PI / 2 - 0.3 - closed * 1.0 - squint * 0.45;
      lidTop.rotation.z = lidBottom.rotation.z = 0;
      pupilGroup.rotation.set(-lookY * 0.35, lookX * 0.45, 0);
    },
  };
}

// --- Tekkies (sneakers): the one thing every form wears. ------------------------------------------

export function buildSneaker(mats: Materials, side: number, scale = 1) {
  const shoe = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.2, 8, 20), mats.sneaker);
  upper.rotation.x = Math.PI / 2;
  upper.scale.set(1, 1, 0.78);
  const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.22, 8, 20), mats.sole);
  sole.rotation.x = Math.PI / 2;
  sole.scale.set(1, 1, 0.32);
  sole.position.y = -0.09;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.24), mats.stripe);
  stripe.position.set(side * 0.148, -0.01, 0.02);
  stripe.rotation.x = -0.35;
  const laces = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.12), mats.trim);
  laces.position.set(0, 0.11, 0.08);
  laces.rotation.x = 0.4;
  const toe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mats.trim);
  toe.position.set(0, -0.045, 0.2);
  toe.scale.set(1, 0.55, 0.8);
  shoe.add(upper, sole, stripe, laces, toe);
  shoe.scale.setScalar(scale);
  return shoe;
}

// --- Hats and outfits, shared by every form. -------------------------------------------------------

/** Builds every accessory, hidden, parented to `head` at `headR` radius. */
export function buildAccessories(mats: Materials, head: THREE.Object3D, headR: number, topY: number) {
  const out = new Map<Accessory, THREE.Group>();
  const add = (id: Accessory, g: THREE.Group) => {
    g.visible = false;
    head.add(g);
    out.set(id, g);
  };

  const witch = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.95, headR * 0.95, 0.04, 40), mats.accessory);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.55, headR * 1.05, 32), mats.accessory);
  cone.position.y = headR * 0.52;
  cone.rotation.z = -0.18;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.53, headR * 0.56, 0.1, 32), mats.stripe);
  band.position.y = 0.08;
  witch.add(brim, cone, band);
  witch.position.set(0.05, topY - headR * 0.08, -0.05);
  witch.rotation.z = -0.12;
  add("witch-hat", witch);

  const santa = new THREE.Group();
  const sCone = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.62, headR * 0.95, 32), mats.accessory);
  sCone.position.y = headR * 0.45;
  sCone.rotation.z = -0.35;
  const fur = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.62, 0.11, 12, 40), mats.trim);
  fur.rotation.x = Math.PI / 2;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), mats.trim);
  pom.position.set(headR * 0.32, headR * 0.88, 0);
  santa.add(sCone, fur, pom);
  santa.position.set(0, topY - headR * 0.1, -0.05);
  santa.rotation.z = -0.1;
  add("santa-hat", santa);

  const cap = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.04, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2.9), mats.accessory);
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.55, headR * 0.55, 0.04, 32, 1, false, -Math.PI / 2, Math.PI), mats.accessory);
  peak.position.set(0, headR * 0.5, headR * 0.78);
  peak.rotation.x = 0.15;
  cap.add(crown, peak);
  cap.position.y = topY - headR * 0.98;
  add("cap", cap);

  const crownG = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.42, headR * 0.5, 0.2, 24, 1, true), mats.metal);
  crownG.add(ring);
  for (let i = 0; i < 6; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 10), mats.metal);
    const a = (i / 6) * Math.PI * 2;
    spike.position.set(Math.cos(a) * headR * 0.42, 0.17, Math.sin(a) * headR * 0.42);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), mats.lamp);
    gem.position.copy(spike.position).y = 0.05;
    crownG.add(spike, gem);
  }
  crownG.position.y = topY - 0.02;
  add("crown", crownG);

  const glasses = new THREE.Group();
  for (const side of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.26, 0.022, 10, 32), mats.darkMetal);
    rim.position.x = side * headR * 0.3;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(headR * 0.25, 28), mats.visor);
    lens.position.x = side * headR * 0.3;
    glasses.add(rim, lens);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(headR * 0.12, 0.03, 0.03), mats.darkMetal);
  glasses.add(bridge);
  for (const side of [-1, 1]) {
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, headR * 0.9), mats.darkMetal);
    temple.position.set(side * headR * 0.58, 0.02, -headR * 0.4);
    glasses.add(temple);
  }
  glasses.position.set(0, 0, headR * 0.9);
  add("glasses", glasses);

  const bow = new THREE.Group();
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), mats.accessory);
    loop.scale.set(1.3, 0.8, 0.5);
    loop.position.x = side * 0.19;
    bow.add(loop);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), mats.stripe);
  bow.add(knot);
  bow.position.set(headR * 0.5, topY - 0.05, headR * 0.2);
  bow.rotation.set(0.3, 0, -0.5);
  add("bow", bow);

  const scarf = new THREE.Group();
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.78, 0.13, 14, 40), mats.cloth);
  wrap.rotation.x = Math.PI / 2;
  const tail = roundedBox(0.2, 0.55, 0.08, 0.04, mats.cloth);
  tail.position.set(headR * 0.45, -0.32, headR * 0.7);
  tail.rotation.z = 0.15;
  scarf.add(wrap, tail);
  scarf.position.y = -headR * 0.92;
  add("scarf", scarf);

  return out;
}

export const smooth = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));

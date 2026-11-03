// Yeti: a chubby fluffy blue yeti whose peach face peeks out of its fur, with huge violet eyes,
// amber goggles and a gaming headset with a boom mic. It has no neck, so the whole body turns to
// look. The fur is a displaced sphere under a few "shell" layers of strand dots, which gives the
// silhouette a soft fringe without real hair. Classic skin = the reference colours; other skins
// recolour the fur (body), the goggles and headset (visor) and the eyes (glow).
import * as THREE from "three";
import type { Skin } from "../skins";
import { buildAccessories, buildEye, glowSprite, roundedBox, smooth, type EyeRig, type Face, type Form, type Leg, type Materials, type Pose } from "./common";

const RX = 0.85;
const RY = 1.05;
const RZ = 0.8;
const FACE_Y = 0.32;
const BLUE = 0x3d9be6;
const AMBER = 0xf5a63a;
const VIOLET = 0x5d55e2;
const PEACH = 0xf5cdb2;
const LENS_C = new THREE.Vector3(0, 0.38, -0.28);
const LENS_R = 1.2;
const WHITE = new THREE.Color(0xffffff);

// --- Cheap value noise so the fur clumps instead of reading as a smooth ball. ---------------------
function hash(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
const fade = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  const L = THREE.MathUtils.lerp;
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), fx), L(c(0, 1, 0), c(1, 1, 0), fx), fy),
    L(L(c(0, 0, 1), c(1, 0, 1), fx), L(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}
/** Pushes every vertex along its normal by a little noise; seam-safe because the noise is positional. */
function fluff(geo: THREE.BufferGeometry, amp: number, seed = 0) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const d = (noise(p.x * 4 + seed, p.y * 4, p.z * 4) * 0.55 + noise(p.x * 11 + seed, p.y * 11, p.z * 11) * 0.45 - 0.5) * amp;
    p.addScaledVector(n, d);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Shapes the unit body sphere: wider below the middle (pear) and dented where the face sits. */
function shapeBody(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position;
  const p = new THREE.Vector3();
  const faceDir = new THREE.Vector3(0, FACE_Y / RY, 1).normalize();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const r = p.length();
    const dot = p.clone().normalize().dot(faceDir);
    const dent = THREE.MathUtils.smoothstep(dot, 0.78, 0.96) * 0.12;
    const pear = 1 + Math.max(0, -p.y / r) * 0.14;
    p.multiplyScalar(1 - dent);
    pos.setXYZ(i, p.x * pear, p.y, p.z * pear);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Random strand dots; each shell keeps only the brighter ones so the fur thins toward the tips. */
let strandTex: THREE.Texture | undefined;
function strandTexture() {
  if (strandTex) return strandTex;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 14000; i++) {
    const v = 40 + Math.floor(Math.random() * 215);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.arc(Math.random() * 512, Math.random() * 512, 0.8 + Math.random() * 1.8, 0, Math.PI * 2);
    g.fill();
  }
  strandTex = new THREE.CanvasTexture(c);
  strandTex.wrapS = strandTex.wrapT = THREE.RepeatWrapping;
  strandTex.repeat.set(6, 4);
  return strandTex;
}

const SHELLS = [
  { s: 1.025, test: 0.2, op: 0.6 },
  { s: 1.05, test: 0.4, op: 0.48 },
  { s: 1.075, test: 0.6, op: 0.36 },
  { s: 1.1, test: 0.78, op: 0.26 },
];

export class YetiForm implements Form {
  readonly kind = "yeti" as const;
  readonly root = new THREE.Group();
  readonly head: THREE.Object3D;
  readonly arms: THREE.Group[] = [];
  readonly legs: Leg[] = [];
  readonly accessories;
  readonly sitDrop = 0.2;

  // Own materials: the shared fur/fuzz ones are plain, and this body needs strands, plastic and pads.
  private furMat = new THREE.MeshPhysicalMaterial({ roughness: 0.92, metalness: 0, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xbfe0ff) });
  private shellMats: THREE.MeshStandardMaterial[];
  private faceMat = new THREE.MeshPhysicalMaterial({ color: PEACH, roughness: 0.5, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffe0cc), clearcoat: 0.15 });
  private padMat = new THREE.MeshPhysicalMaterial({ roughness: 0.6, sheen: 0.5, sheenRoughness: 0.6 });
  private amber = new THREE.MeshPhysicalMaterial({ color: AMBER, roughness: 0.3, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.15 });
  private amberLight = new THREE.MeshPhysicalMaterial({ color: 0xffd98a, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  private lensMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff4e0,
    transparent: true,
    opacity: 0.28,
    roughness: 0.05,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.2,
  });

  private body: THREE.Group;
  private shells: { mesh: THREE.Mesh; s: number; i: number }[] = [];
  private eyes: EyeRig[] = [];
  private mouthGroup = new THREE.Group();
  private smile: THREE.Mesh;
  private mouthOpen: THREE.Mesh;
  private teeth: THREE.Mesh[] = [];
  private tongue: THREE.Mesh;
  private mic = new THREE.Group();
  private leds: THREE.Sprite[] = [];
  private puff = 0;

  constructor(private mats: Materials) {
    const m = mats;
    this.head = this.root;
    const tex = strandTexture();
    this.shellMats = SHELLS.map(
      (sh) => new THREE.MeshStandardMaterial({ roughness: 1, alphaMap: tex, transparent: true, opacity: sh.op, alphaTest: sh.test, depthWrite: false }),
    );

    // Body: one egg-shaped fluffy mass; head and belly are the same thing.
    const bodyGeo = fluff(shapeBody(new THREE.SphereGeometry(1, 96, 72)), 0.04);
    bodyGeo.scale(RX, RY, RZ);
    bodyGeo.computeVertexNormals();
    this.body = this.furry(bodyGeo);
    this.root.add(this.body);

    // Face: a smooth peach oval set into the fur, with a fluffy hood rim around it.
    const plate = new THREE.Mesh(new THREE.SphereGeometry(0.44, 48, 32), this.faceMat);
    plate.scale.set(1, 0.9, 0.4);
    plate.position.set(0, FACE_Y, 0.62);
    this.root.add(plate);
    const rimGeo = fluff(new THREE.TorusGeometry(0.47, 0.12, 16, 56), 0.02, 3);
    rimGeo.scale(1, 0.92, 1);
    rimGeo.computeVertexNormals();
    const rim = this.furry(rimGeo);
    rim.position.set(0, FACE_Y, 0.66);
    this.root.add(rim);

    // Huge eyes, cheeks, and a mouth with two tiny teeth.
    for (const side of [-1, 1]) {
      const eye = buildEye(m, 0.19, 0.78);
      eye.group.position.set(side * 0.215, 0.39, 0.7);
      eye.group.rotation.y = side * 0.12;
      this.root.add(eye.group);
      this.eyes.push(eye);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.085, 20), m.cheek);
      cheek.position.set(side * 0.31, 0.19, 0.745);
      cheek.rotation.y = side * 0.45;
      this.root.add(cheek);
    }
    this.mouthGroup.position.set(0, 0.11, 0.785);
    this.root.add(this.mouthGroup);
    this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 10, 30, Math.PI), m.mouthDark);
    this.smile.rotation.z = Math.PI;
    this.mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.mouthDark);
    this.tongue = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), m.tongue);
    this.mouthGroup.add(this.smile, this.mouthOpen, this.tongue);
    for (const side of [-1, 1]) {
      const tooth = roundedBox(0.035, 0.04, 0.025, 0.01, m.trim);
      tooth.position.set(side * 0.024, -0.012, 0.01);
      this.mouthGroup.add(tooth);
      this.teeth.push(tooth);
    }

    // Goggles: a rounded frame and a clear visor, both lying on one big sphere so they wrap the face.
    const onLens = (x: number, y: number, push = 0) =>
      new THREE.Vector3(x, y, Math.sqrt(Math.max(0, LENS_R * LENS_R - x * x - (y - LENS_C.y) ** 2)) + LENS_C.z + push);
    const pts: THREE.Vector3[] = [];
    const W = 0.5, H = 0.21, C = 0.14, N = 10;
    const corners: [number, number][] = [
      [W - C, H - C],
      [-(W - C), H - C],
      [-(W - C), -(H - C)],
      [W - C, -(H - C)],
    ];
    corners.forEach(([cx, cy], k) => {
      for (let j = 0; j < N; j++) {
        const a = ((k * 90 + (j * 90) / N) * Math.PI) / 180;
        pts.push(onLens(cx + C * Math.cos(a), LENS_C.y + cy + C * Math.sin(a)));
      }
    });
    const goggles = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, "centripetal"), 120, 0.042, 12, true), this.amber);
    goggles.add(frame);
    const barPts: THREE.Vector3[] = [];
    const stripePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const x = -0.46 + (0.92 * i) / 16;
      barPts.push(onLens(x, LENS_C.y + 0.2, 0.01));
      stripePts.push(onLens(x * 0.9, LENS_C.y + 0.215, 0.05));
    }
    goggles.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barPts), 32, 0.06, 12), this.amber));
    goggles.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stripePts), 32, 0.022, 8), this.amberLight));
    const halfW = Math.asin(0.45 / LENS_R);
    const t0 = Math.acos(0.18 / LENS_R);
    const t1 = Math.acos(-0.18 / LENS_R);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(LENS_R * 0.995, 64, 32, Math.PI / 2 - halfW, halfW * 2, t0, t1 - t0), this.lensMat);
    lens.position.copy(LENS_C);
    lens.userData.noShadow = true;
    goggles.add(lens);
    this.root.add(goggles);

    // Headset: straps from the goggles to a cup on each side, a status LED on each cup, and a boom
    // mic on the left.
    for (const side of [-1, 1]) {
      const strap = new THREE.QuadraticBezierCurve3(onLens(side * 0.52, LENS_C.y), new THREE.Vector3(side * 0.86, 0.44, 0.42), new THREE.Vector3(side * 0.86, 0.3, 0.1));
      this.root.add(new THREE.Mesh(new THREE.TubeGeometry(strap, 24, 0.035, 10), this.amber));
      const cup = new THREE.Group();
      cup.position.set(side * 0.9, 0.28, 0.02);
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 32), this.amber);
      shell.rotation.z = Math.PI / 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 10, 36), m.darkMetal);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = side * 0.075;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), m.lamp);
      led.position.x = side * 0.08;
      const glow = glowSprite(0.3, 0.55);
      led.add(glow);
      this.leds.push(glow);
      cup.add(shell, ring, led);
      this.root.add(cup);
    }
    const micBase = new THREE.Vector3(-0.9, 0.2, 0.14);
    const micCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.12, -0.26, 0.41), new THREE.Vector3(0.6, -0.18, 0.66));
    this.mic.add(new THREE.Mesh(new THREE.TubeGeometry(micCurve, 32, 0.022, 10), this.amber));
    const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.04, 6, 14), m.darkMetal);
    tip.position.copy(micCurve.getPoint(1));
    tip.rotation.z = Math.PI / 2;
    this.mic.add(tip);
    this.mic.position.copy(micBase);
    this.root.add(this.mic);

    // Stubby furry arms; the paws have lighter pads that face the camera when it waves.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.74, -0.12, 0.22);
      const upper = this.furry(fluff(new THREE.CapsuleGeometry(0.15, 0.22, 10, 18), 0.02, 5 + side));
      upper.position.y = -0.16;
      const pawGeo = fluff(new THREE.SphereGeometry(0.18, 32, 24), 0.02, 9 + side);
      pawGeo.scale(1, 1, 0.85);
      pawGeo.computeVertexNormals();
      const paw = this.furry(pawGeo);
      paw.position.y = -0.44;
      pivot.add(upper, paw);
      const pad = (x: number, dy: number, r: number) => {
        const z = 0.85 * Math.sqrt(Math.max(0.002, 0.18 * 0.18 - x * x - dy * dy));
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), this.padMat);
        mesh.position.set(x, -0.44 + dy, z + 0.01);
        mesh.scale.set(1, 1, 0.4);
        pivot.add(mesh);
      };
      pad(0, 0.03, 0.07);
      pad(-0.105, -0.07, 0.036);
      pad(-0.04, -0.12, 0.036);
      pad(0.04, -0.12, 0.036);
      pad(0.105, -0.07, 0.036);
      pivot.rotation.z = side * 0.5;
      this.root.add(pivot);
      this.arms.push(pivot);
    }

    // Short furry legs ending in round feet (no shoes: the yeti goes barefoot).
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.36, -0.92, 0.08);
      const thigh = this.furry(fluff(new THREE.CapsuleGeometry(0.2, 0.08, 8, 18), 0.015, 13 + side));
      thigh.position.y = -0.06;
      const knee = new THREE.Group();
      knee.position.y = -0.14;
      const shin = this.furry(fluff(new THREE.CapsuleGeometry(0.18, 0.06, 8, 18), 0.015, 17 + side));
      shin.position.y = -0.05;
      const footGeo = fluff(new THREE.SphereGeometry(0.2, 28, 20), 0.015, 21 + side);
      footGeo.scale(1.05, 0.65, 1.2);
      footGeo.computeVertexNormals();
      const foot = this.furry(footGeo);
      foot.position.set(0, -0.2, 0.05);
      knee.add(shin, foot);
      hip.add(thigh, knee);
      this.root.add(hip);
      this.legs.push({ hip, knee });
    }

    this.accessories = buildAccessories(m, this.root, 0.9, 1.02);
    this.root.position.y = -0.22;
  }

  /** A furry part: the solid mesh plus the strand shells scaled out around it. */
  private furry(geo: THREE.BufferGeometry) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, this.furMat));
    SHELLS.forEach((sh, i) => {
      const mesh = new THREE.Mesh(geo, this.shellMats[i]);
      mesh.scale.setScalar(sh.s);
      g.add(mesh);
      this.shells.push({ mesh, s: sh.s, i });
    });
    return g;
  }

  applySkin(skin: Skin) {
    const m = this.mats;
    const classic = skin.id === "classic";
    const fur = classic ? BLUE : skin.body;
    const trim = classic || skin.visor === 0x16123a ? AMBER : skin.visor;
    this.furMat.color.setHex(fur);
    this.shellMats.forEach((s, i) => s.color.setHex(fur).lerp(WHITE, 0.01 + i * 0.03));
    this.padMat.color.setHex(fur).lerp(WHITE, 0.5);
    this.amber.color.setHex(trim);
    this.amberLight.color.setHex(trim).lerp(WHITE, 0.45);
    m.iris.color.setHex(classic ? VIOLET : skin.glow);
    const tone = skin.skinTone ?? PEACH;
    this.faceMat.color.setHex(tone);
    m.lid.color.setHex(tone);
    m.darkMetal.color.setHex(0x2a2740);
    m.accessory.color.setHex(skin.accessoryColor);
  }

  setFace(f: Face) {
    const squint = f.happy * 0.5 + f.angry * 0.3 + f.tired * 0.3;
    const lid = Math.min(f.lid, 1 - f.sleep * 0.92) * (1 + f.surprised * 0.3) * (1 - f.sad * 0.2);
    for (const e of this.eyes) e.set(Math.min(1, lid), f.lookX, f.lookY, squint);
    this.mats.cheek.opacity = Math.min(0.85, 0.3 + f.happy * 0.4 + f.love * 0.4);
    const open = Math.max(f.open, f.chomp);
    const shown = open > 0.08;
    this.mouthOpen.visible = this.tongue.visible = shown;
    this.smile.visible = !shown;
    this.smile.rotation.z = f.sad > 0.3 || f.angry > 0.3 ? 0 : Math.PI;
    this.smile.scale.set(1 + f.happy * 0.4, 1 + f.happy * 0.5 - f.sad * 0.4, 1);
    const w = 0.08 + f.wide * 0.07 + f.happy * 0.03 - f.surprised * 0.02;
    const h = 0.02 + open * 0.1;
    this.mouthOpen.scale.set(w, h, 0.04);
    this.teeth.forEach((t, i) => {
      t.visible = !(f.sad > 0.5 || f.angry > 0.5);
      t.position.set((i === 0 ? -1 : 1) * 0.024 * (w / 0.08), shown ? h * 0.55 : -0.012, shown ? 0.02 : 0.01);
    });
    this.tongue.position.set(0, -h * 0.5, 0.02);
    this.tongue.scale.set(w / 0.09, Math.max(0.2, h * 4), 1);
  }

  setGlow(hex: number, pulse: number) {
    this.mats.lamp.color.setHex(hex);
    for (const led of this.leds) {
      (led.material as THREE.SpriteMaterial).color.setHex(hex);
      led.scale.setScalar(0.3 * (0.7 + pulse * 0.35));
    }
  }

  animate(p: Pose, dt: number) {
    // Breathing, a mic that bobs with the voice, and fur that puffs up when excited.
    const breath = 1 + Math.sin(p.t * (p.sleep > 0.5 ? 1.2 : 2.4)) * 0.012;
    this.body.scale.set(breath, 2 - breath, breath);
    this.mic.rotation.x = smooth(this.mic.rotation.x, (p.speaking ? Math.sin(p.t * 9) * 0.03 * p.talk : 0) - p.sleep * 0.08, 10, dt);
    this.puff = smooth(this.puff, p.hover * 0.5 + p.happy * 0.3 + p.surprised * 0.6 + p.dance * 0.4, 6, dt);
    for (const sh of this.shells) sh.mesh.scale.setScalar(sh.s * (1 + this.puff * 0.012 * (sh.i + 1)));
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
      if (o instanceof THREE.Sprite) o.material.dispose();
    });
    for (const mat of [this.furMat, ...this.shellMats, this.faceMat, this.padMat, this.amber, this.amberLight, this.lensMat]) mat.dispose();
  }
}

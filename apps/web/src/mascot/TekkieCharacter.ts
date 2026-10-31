import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DEFAULT_SKIN, type Accessory, type Skin } from "./skins";
import type { VoiceState } from "../voice/LiveVoiceSession";

const STATE_GLOW: Partial<Record<VoiceState, number>> = {
  listening: 0x4dff88,
  connecting: 0xffd84d,
  thinking: 0xffd84d,
  error: 0xff4d5e,
};

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DANCE_SECONDS = 4.2;

function smooth(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function blobShadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(20,10,40,0.5)");
  grad.addColorStop(0.55, "rgba(20,10,40,0.22)");
  grad.addColorStop(1, "rgba(20,10,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Point on the body's unit sphere (three.js SphereGeometry angle convention). */
function spherePoint(phi: number, theta: number, r: number) {
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
}

/**
 * Tekkie, built from primitives so it ships with no model file. Physically based materials and an
 * image-based "studio" light give it a glossy plastic-and-metal look; the joints let it walk, dance
 * and react to the pointer. A rigged GLB from a 3D artist can replace this later behind the same
 * interface (setState / setSkin / update / wave / poke / setWalk / setHover / dance).
 */
export class TekkieCharacter {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private envMap: THREE.Texture;

  private rig = new THREE.Group();
  private float = new THREE.Group();
  private bodyMesh!: THREE.Mesh;
  private eyes: THREE.Group[] = [];
  private cheeks: THREE.Group[] = [];
  private smile!: THREE.Group;
  private talkMouth!: THREE.Group;
  private antenna = new THREE.Group();
  private antennaBulb!: THREE.Mesh;
  private antennaHalo!: THREE.Mesh;
  private arms: THREE.Group[] = [];
  private legs: Leg[] = [];
  private shadow!: THREE.Mesh;
  private accessories = new Map<Accessory, THREE.Group>();

  private mats = {
    body: new THREE.MeshPhysicalMaterial({ roughness: 0.45, metalness: 0.02, clearcoat: 0.8, clearcoatRoughness: 0.25 }),
    visor: new THREE.MeshPhysicalMaterial({ roughness: 0.1, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc4c9d8, metalness: 0.92, roughness: 0.27 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2a2740, metalness: 0.8, roughness: 0.4 }),
    glow: new THREE.MeshBasicMaterial(),
    eyeHalo: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    spark: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    cheek: new THREE.MeshBasicMaterial({ color: 0xff7fa8, transparent: true, opacity: 0, depthWrite: false }),
    antenna: new THREE.MeshBasicMaterial(),
    halo: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    sneaker: new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    stripe: new THREE.MeshStandardMaterial({ roughness: 0.5 }),
    sole: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    glove: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, sheen: 0.6, sheenRoughness: 0.5 }),
    accessory: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
  };

  private skin: Skin = DEFAULT_SKIN;
  private state: VoiceState = "idle";
  private look = new THREE.Vector2();
  private lookSmoothed = new THREE.Vector2();
  private level = 0;
  private micLevel = 0;
  private time = 0;
  private nextBlink = 2;
  private blinkT = -1;
  private waveT = -1;
  private pokeT = -1;
  private danceT = -1;
  private antennaSway = 0;
  private antennaVel = 0;
  private lastRigRotY = 0;
  private talkLevel = 0;

  // Walking: -1 left, 1 right, 0 standing. `walk` fades the stride in and out.
  private walkDir = 0;
  private walk = 0;
  private walkPhase = 0;
  private faceYaw = 0;
  // Hovering the pointer over Tekkie makes it lean in and light up.
  private hovered = false;
  private hoverBlend = 0;
  private happy = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.camera.position.set(0, 0.3, 8.2);
    this.camera.lookAt(0, 0.05, 0);

    // A small studio environment gives the glossy parts something real to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.6;
    room.dispose();
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8cc8, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(2.5, 4, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ec5ff, 1.3);
    rim.position.set(-3.5, 2, -3);
    this.scene.add(rim);

    this.buildCharacter();
    this.setSkin(DEFAULT_SKIN);
  }

  private buildCharacter() {
    this.scene.add(this.rig);
    this.rig.add(this.float);

    // Glossy shell.
    const bodyGeo = new THREE.SphereGeometry(1, 64, 48);
    this.bodyMesh = new THREE.Mesh(bodyGeo, this.mats.body);
    this.bodyMesh.scale.set(1, 0.95, 0.92);
    this.float.add(this.bodyMesh);

    // Seam where the two halves of the shell meet, and a belly light.
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.985, 0.012, 8, 72), this.mats.darkMetal);
    seam.rotation.x = Math.PI / 2;
    seam.position.y = -0.22;
    seam.scale.set(0.97, 0.9, 1);
    this.bodyMesh.add(seam);
    const belly = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), this.mats.antenna);
    belly.position.copy(spherePoint(Math.PI / 2, 2.1, 1.01));
    belly.quaternion.setFromUnitVectors(Z_AXIS, belly.position.clone().normalize());
    this.bodyMesh.add(belly);

    // Glass face screen hugging the front of the body, with a thin metal bezel.
    const visorW = 1.95;
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(1.012, 64, 32, Math.PI / 2 - visorW / 2, visorW, 0.78, 1.12),
      this.mats.visor,
    );
    this.bodyMesh.add(visor);
    const bezel = new THREE.Mesh(
      new THREE.SphereGeometry(1.008, 64, 32, Math.PI / 2 - visorW / 2 - 0.045, visorW + 0.09, 0.735, 1.21),
      this.mats.darkMetal,
    );
    this.bodyMesh.add(bezel);

    // Eyes: a lit capsule, a soft halo and a tiny specular spark, each facing out along the surface.
    for (let i = 0; i < 2; i++) {
      const eye = new THREE.Group();
      eye.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.13, 8, 20), this.mats.glow));
      const halo = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.13, 8, 20), this.mats.eyeHalo);
      halo.scale.set(1.7, 1.5, 1.2);
      eye.add(halo);
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), this.mats.spark);
      spark.position.set(-0.03, 0.07, 0.07);
      eye.add(spark);
      this.bodyMesh.add(eye);
      this.eyes.push(eye);
    }

    // Blush that shows up when Tekkie is happy.
    for (const side of [-1, 1]) {
      const cheek = this.faceFeature(new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), this.mats.cheek));
      this.placeOnFace(cheek, Math.PI / 2 + side * 0.5, 1.5);
      this.cheeks.push(cheek);
    }

    this.smile = this.faceFeature(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.026, 10, 28, Math.PI), this.mats.glow));
    this.smile.children[0].rotation.z = Math.PI;
    this.talkMouth = this.faceFeature(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), this.mats.glow));
    this.placeOnFace(this.smile, Math.PI / 2, 1.6);
    this.placeOnFace(this.talkMouth, Math.PI / 2, 1.6);

    // Side "headphones": a shell cup, a metal cap and a lit ring.
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 32), this.mats.sneaker);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.135, 28), this.mats.metal);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.011, 8, 36), this.mats.antenna);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = side * 0.067;
      ear.add(cup, cap, ring);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(side * 0.97, 0.12, 0);
      this.float.add(ear);
    }

    // Antenna: a metal stem and a lamp that shows Tekkie's state through its colour.
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.05, 20), this.mats.metal);
    collar.position.y = 0.02;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.34, 12), this.mats.metal);
    stem.position.y = 0.19;
    this.antennaBulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 18), this.mats.antenna);
    this.antennaBulb.position.y = 0.4;
    this.antennaHalo = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), this.mats.halo);
    this.antennaHalo.position.y = 0.4;
    this.antenna.add(collar, stem, this.antennaBulb, this.antennaHalo);
    this.antenna.position.y = 0.9;
    this.float.add(this.antenna);

    // Arms: shoulder joint, metal upper arm, rounded glove.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.86, -0.2, 0.05);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), this.mats.metal);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.24, 8, 14), this.mats.body);
      arm.position.y = -0.2;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20), this.mats.metal);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.36;
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 16), this.mats.glove);
      glove.position.y = -0.44;
      glove.scale.set(1, 0.95, 1.05);
      pivot.add(shoulder, arm, cuff, glove);
      pivot.rotation.z = side * 0.35;
      this.float.add(pivot);
      this.arms.push(pivot);
    }

    // Jointed legs (hip, knee) ending in a pair of tekkies (sneakers).
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.36, -0.78, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.2, 12), this.mats.metal);
      thigh.position.y = -0.1;
      const knee = new THREE.Group();
      knee.position.y = -0.2;
      const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), this.mats.darkMetal);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.044, 0.18, 12), this.mats.metal);
      shin.position.y = -0.09;
      const shoe = this.buildSneaker(side);
      shoe.position.set(0, -0.2, 0.06);
      shoe.rotation.y = side * 0.25;
      knee.add(kneeCap, shin, shoe);
      hip.add(thigh, knee);
      this.float.add(hip);
      this.legs.push({ hip, knee });
    }

    this.buildAccessories();

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -1.62;
    this.rig.add(this.shadow);
  }

  private buildSneaker(side: number) {
    const shoe = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.2, 8, 20), this.mats.sneaker);
    upper.rotation.x = Math.PI / 2;
    upper.scale.set(1, 1, 0.78);
    const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.22, 8, 20), this.mats.sole);
    sole.rotation.x = Math.PI / 2;
    sole.scale.set(1, 1, 0.32);
    sole.position.y = -0.09;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.24), this.mats.stripe);
    stripe.position.set(side * 0.148, -0.01, 0.02);
    stripe.rotation.x = -0.35;
    const laces = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.12), this.mats.trim);
    laces.position.set(0, 0.11, 0.08);
    laces.rotation.x = 0.4;
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), this.mats.trim);
    toe.position.set(0, -0.045, 0.2);
    toe.scale.set(1, 0.55, 0.8);
    shoe.add(upper, sole, stripe, laces, toe);
    return shoe;
  }

  private buildAccessories() {
    const witch = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.04, 40), this.mats.accessory);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.05, 32), this.mats.accessory);
    cone.position.y = 0.52;
    cone.rotation.z = -0.18;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.56, 0.1, 32), this.mats.stripe);
    band.position.y = 0.08;
    witch.add(brim, cone, band);
    witch.position.set(0.05, 0.82, -0.05);
    witch.rotation.z = -0.12;

    const santa = new THREE.Group();
    const sCone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.95, 32), this.mats.accessory);
    sCone.position.y = 0.45;
    sCone.rotation.z = -0.35;
    const fur = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.11, 12, 40), this.mats.trim);
    fur.rotation.x = Math.PI / 2;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), this.mats.trim);
    pom.position.set(0.32, 0.88, 0);
    santa.add(sCone, fur, pom);
    santa.position.set(0, 0.8, -0.05);
    santa.rotation.z = -0.1;

    const cap = new THREE.Group();
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.04, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2.9), this.mats.accessory);
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 32, 1, false, -Math.PI / 2, Math.PI), this.mats.accessory);
    peak.position.set(0, 0.5, 0.78);
    peak.rotation.x = 0.15;
    cap.add(crown, peak);
    cap.scale.set(1, 0.95, 0.92);
    cap.position.y = 0.02;

    for (const [id, group] of [["witch-hat", witch], ["santa-hat", santa], ["cap", cap]] as const) {
      group.visible = false;
      this.float.add(group);
      this.accessories.set(id, group);
    }
  }

  private faceFeature(mesh: THREE.Mesh) {
    const g = new THREE.Group();
    g.add(mesh);
    this.bodyMesh.add(g);
    return g;
  }

  private placeOnFace(group: THREE.Group, phi: number, theta: number) {
    const p = spherePoint(phi, theta, 1.03);
    group.position.copy(p);
    group.quaternion.setFromUnitVectors(Z_AXIS, p.normalize());
  }

  setSkin(skin: Skin) {
    this.skin = skin;
    this.mats.body.color.setHex(skin.body);
    this.mats.visor.color.setHex(skin.visor);
    this.mats.glow.color.setHex(skin.glow);
    this.mats.eyeHalo.color.setHex(skin.glow);
    this.mats.sneaker.color.setHex(skin.sneaker);
    this.mats.stripe.color.setHex(skin.sneakerStripe);
    this.mats.sole.color.setHex(skin.sole);
    this.mats.accessory.color.setHex(skin.accessoryColor);
    for (const [id, group] of this.accessories) group.visible = id === skin.accessory;
    // Tall hats would swallow the antenna, so hide it under them.
    this.antenna.visible = skin.accessory !== "witch-hat" && skin.accessory !== "santa-hat";
    this.poke();
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

  /** Audio loudness: Tekkie's voice drives the mouth, the mic drives the "listening" pulse. */
  setLevels(output: number, input: number) {
    this.level = output;
    this.micLevel = input;
  }

  wave() {
    this.waveT = 0;
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

  get dancing() {
    return this.danceT >= 0;
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

    // Speech loudness, boosted and smoothed so the mouth reads clearly.
    const target = speaking ? Math.min(1, this.level * 5) : 0;
    const talk = (this.talkLevel = smooth(this.talkLevel, target, target > this.talkLevel ? 30 : 12, dt));

    // Walking fades in and out; the stride phase only advances while moving.
    this.walk = smooth(this.walk, this.walkDir !== 0 ? 1 : 0, 9, dt);
    this.walkPhase += dt * 9.5 * this.walk;
    const stride = this.walk;
    const phase = this.walkPhase;
    const facing = this.walkDir !== 0 ? this.walkDir * 0.95 : 0;
    this.faceYaw = smooth(this.faceYaw, facing, 7, dt);

    // Dance clock and hover blend.
    let dance = 0;
    if (this.danceT >= 0) {
      this.danceT += dt;
      dance = Math.min(1, this.danceT / 0.3) * Math.min(1, (DANCE_SECONDS - this.danceT) / 0.4);
      if (this.danceT > DANCE_SECONDS) this.danceT = -1;
    }
    this.hoverBlend = smooth(this.hoverBlend, this.hovered ? 1 : 0, 8, dt);
    const hover = this.hoverBlend;
    this.happy = smooth(this.happy, Math.max(hover * 0.85, dance, this.waveT >= 0 ? 0.6 : 0), 8, dt);

    // Hover and squash.
    let squash = talk * 0.06;
    if (this.pokeT >= 0) {
      this.pokeT += dt;
      squash += Math.sin(this.pokeT * 18) * Math.exp(-this.pokeT * 5) * 0.12;
      if (this.pokeT > 1.2) this.pokeT = -1;
    }
    const bounce = Math.abs(Math.sin(phase)) * 0.075 * stride + Math.abs(Math.sin(t * 7)) * 0.17 * dance;
    this.float.position.y = Math.sin(t * 1.7) * 0.08 * (1 - stride) * (1 - dance) + bounce + talk * 0.05 + Math.sin(t * 8) * 0.012 * hover;
    this.float.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    const lift = Math.min(1, Math.max(0, (this.float.position.y + 0.1) / 0.3));
    this.shadow.scale.setScalar(1 - lift * 0.15);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.9 - lift * 0.3;

    // Follow the pointer (harder when hovered); when thinking, glance up and to the side.
    const lookTarget = thinking ? new THREE.Vector2(0.55, 0.7) : this.look;
    this.lookSmoothed.x = smooth(this.lookSmoothed.x, lookTarget.x, 6 + hover * 4, dt);
    this.lookSmoothed.y = smooth(this.lookSmoothed.y, lookTarget.y, 6 + hover * 4, dt);
    const lx = this.lookSmoothed.x;
    const ly = this.lookSmoothed.y;
    const turnAway = 1 - Math.min(1, Math.abs(this.faceYaw)); // while walking, face the way it is going
    this.rig.rotation.y =
      lx * (0.42 + hover * 0.3) * turnAway +
      this.faceYaw +
      (s === "connecting" ? Math.sin(t * 6) * 0.08 : 0) +
      Math.sin(t * 3.5) * 0.6 * dance;
    this.rig.rotation.x = -ly * (0.18 + hover * 0.14) + (s === "listening" ? 0.06 : 0) + stride * 0.07 + hover * 0.05;
    this.rig.rotation.z = Math.sin(t * 1.1) * 0.03 - lx * 0.05 + Math.sin(phase) * 0.035 * stride + Math.sin(t * 7) * 0.13 * dance;

    // Eyes slide across the visor toward the look target and blink now and then.
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
    const eyeOpen = s === "listening" ? 1.15 : s === "error" ? 0.6 : 1;
    this.eyes.forEach((eye, i) => {
      const side = i === 0 ? -1 : 1;
      this.placeOnFace(eye, Math.PI / 2 + side * 0.3 - lx * 0.14, 1.27 - ly * 0.1);
      // Happy eyes squint into little arcs.
      eye.scale.set(1 + this.happy * 0.25, lid * eyeOpen * (1 - this.happy * 0.5), 1);
    });
    this.mats.cheek.opacity = this.happy * 0.55;

    // Mouth: smile at rest, an open oval that tracks loudness while talking.
    this.talkMouth.visible = speaking && talk > 0.1;
    this.smile.visible = !this.talkMouth.visible;
    this.talkMouth.children[0].scale.set(0.1 + talk * 0.04, 0.035 + talk * 0.09, 0.04);
    this.smile.children[0].rotation.z = s === "error" ? 0 : Math.PI;
    this.smile.scale.setScalar((s === "listening" ? 0.85 : 1) * (1 + this.happy * 0.35));

    // Antenna colour and pulse by state.
    const glow = hover > 0.5 && !STATE_GLOW[s] ? 0xff9ad0 : STATE_GLOW[s] ?? this.skin.glow;
    this.mats.antenna.color.setHex(glow);
    this.mats.halo.color.setHex(glow);
    let pulse = 1 + Math.sin(t * 3) * 0.08 + hover * 0.3 * Math.abs(Math.sin(t * 6));
    if (s === "listening") pulse = 1 + Math.min(this.micLevel * 8, 0.8);
    if (thinking) pulse = 0.8 + Math.abs(Math.sin(t * 5)) * 0.5;
    if (speaking) pulse = 1 + talk * 0.7;
    this.antennaHalo.scale.setScalar(pulse);
    // Spring so the antenna wobbles when Tekkie turns or steps.
    const turn = this.rig.rotation.y - this.lastRigRotY;
    this.lastRigRotY = this.rig.rotation.y;
    this.antennaVel += (-this.antennaSway * 60 - this.antennaVel * 6) * dt - turn * 4 + Math.cos(phase * 2) * stride * dt * 3;
    this.antennaSway += this.antennaVel * dt;
    this.antenna.rotation.z = this.antennaSway + Math.sin(t * 1.3) * 0.05;

    // Arms: gentle sway, a swing opposite the legs when walking, talking gestures, and a wave.
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      let rz = side * (0.35 + Math.sin(t * 1.7 + i) * 0.06 + talk * 0.25 + stride * 0.08);
      let rx = (speaking ? Math.sin(t * 7 + i * 2) * talk * 0.4 : 0) + Math.sin(phase + (i === 0 ? 0 : Math.PI)) * 0.6 * stride;
      if (thinking && side === 1) {
        rz = 2.3; // hand up to scratch its head
        rx = -0.6;
      }
      if (dance > 0) {
        rz = THREE.MathUtils.lerp(rz, side * (2.1 + Math.sin(t * 7 + i * Math.PI) * 0.55), dance);
        rx = THREE.MathUtils.lerp(rx, 0, dance);
      }
      if (this.waveT >= 0 && side === 1) {
        const w = Math.min(this.waveT / 0.25, 1) * Math.min((1.6 - this.waveT) / 0.25, 1);
        rz = THREE.MathUtils.lerp(rz, 2.6 + Math.sin(this.waveT * 14) * 0.35, Math.max(0, w));
      }
      arm.rotation.z = smooth(arm.rotation.z, rz, 12, dt);
      arm.rotation.x = smooth(arm.rotation.x, rx, 12, dt);
    });
    if (this.waveT >= 0) {
      this.waveT += dt;
      if (this.waveT > 1.6) this.waveT = -1;
    }

    // Legs: a proper stride when walking (swing at the hip, bend at the knee), a jig when dancing,
    // otherwise they dangle a beat behind the body.
    this.legs.forEach((leg, i) => {
      const p = phase + (i === 0 ? 0 : Math.PI);
      const dangle = Math.sin(t * 1.7 - 0.6 + i * 0.8) * 0.12 + talk * 0.1;
      const stepDance = Math.sin(t * 7 + i * Math.PI);
      leg.hip.rotation.x = THREE.MathUtils.lerp(dangle, -Math.sin(p) * 0.7, stride) * (1 - dance) + stepDance * 0.45 * dance;
      leg.knee.rotation.x = Math.max(0, Math.cos(p)) * 0.95 * stride * (1 - dance) + Math.max(0, stepDance) * 0.7 * dance;
    });

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    Object.values(this.mats).forEach((m) => m.dispose());
    this.envMap.dispose();
  }
}

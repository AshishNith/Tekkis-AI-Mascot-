import * as THREE from "three";
import { DEFAULT_SKIN, type Accessory, type Skin } from "./skins";
import type { VoiceState } from "../voice/LiveVoiceSession";

const STATE_GLOW: Partial<Record<VoiceState, number>> = {
  listening: 0x4dff88,
  connecting: 0xffd84d,
  thinking: 0xffd84d,
  error: 0xff4d5e,
};

const Z_AXIS = new THREE.Vector3(0, 0, 1);

function smooth(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function toonGradient() {
  const tex = new THREE.DataTexture(new Uint8Array([90, 175, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function blobShadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(20,10,40,0.45)");
  grad.addColorStop(1, "rgba(20,10,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Point on the body's unit sphere (three.js SphereGeometry angle convention). */
function spherePoint(phi: number, theta: number, r: number) {
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

/**
 * Tekkie, built from primitives so it ships with no model file. A rigged GLB from a 3D artist
 * can replace this later behind the same interface (setState / setSkin / update / wave / poke).
 */
export class TekkieCharacter {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private gradient = toonGradient();

  private rig = new THREE.Group();
  private float = new THREE.Group();
  private bodyMesh!: THREE.Mesh;
  private eyes: THREE.Group[] = [];
  private smile!: THREE.Group;
  private talkMouth!: THREE.Group;
  private antenna = new THREE.Group();
  private antennaBulb!: THREE.Mesh;
  private antennaHalo!: THREE.Mesh;
  private arms: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private shadow!: THREE.Mesh;
  private accessories = new Map<Accessory, THREE.Group>();

  private mats = {
    body: new THREE.MeshToonMaterial({ gradientMap: this.gradient }),
    outline: new THREE.MeshBasicMaterial({ color: 0x1a1030, side: THREE.BackSide }),
    visor: new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.15 }),
    glow: new THREE.MeshBasicMaterial(),
    antenna: new THREE.MeshBasicMaterial(),
    halo: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    sneaker: new THREE.MeshToonMaterial({ gradientMap: this.gradient }),
    stripe: new THREE.MeshToonMaterial({ gradientMap: this.gradient }),
    sole: new THREE.MeshToonMaterial({ gradientMap: this.gradient }),
    glove: new THREE.MeshToonMaterial({ gradientMap: this.gradient, color: 0xffffff }),
    accessory: new THREE.MeshToonMaterial({ gradientMap: this.gradient }),
    trim: new THREE.MeshToonMaterial({ gradientMap: this.gradient, color: 0xffffff }),
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
  private antennaSway = 0;
  private antennaVel = 0;
  private lastRigRotY = 0;
  private talkLevel = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.camera.position.set(0, 0.3, 8.2);
    this.camera.lookAt(0, 0.05, 0);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8cc8, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 4, 5);
    this.scene.add(key);

    this.buildCharacter();
    this.setSkin(DEFAULT_SKIN);
  }

  private buildCharacter() {
    this.scene.add(this.rig);
    this.rig.add(this.float);

    // Body with an inverted-hull outline for a sticker-like cartoon edge.
    const bodyGeo = new THREE.SphereGeometry(1, 48, 32);
    this.bodyMesh = new THREE.Mesh(bodyGeo, this.mats.body);
    this.bodyMesh.scale.set(1, 0.95, 0.92);
    const outline = new THREE.Mesh(bodyGeo, this.mats.outline);
    outline.scale.setScalar(1.035);
    this.bodyMesh.add(outline);
    this.float.add(this.bodyMesh);

    // Glossy face screen hugging the front of the body.
    const visorW = 1.95;
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(1.012, 48, 24, Math.PI / 2 - visorW / 2, visorW, 0.78, 1.12),
      this.mats.visor,
    );
    this.bodyMesh.add(visor);

    // Eyes and mouth sit on the visor, each in a group facing out along the surface normal.
    for (let i = 0; i < 2; i++) {
      const eye = new THREE.Group();
      eye.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.13, 6, 16), this.mats.glow));
      this.bodyMesh.add(eye);
      this.eyes.push(eye);
    }

    this.smile = this.faceFeature(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.026, 8, 24, Math.PI), this.mats.glow));
    this.smile.children[0].rotation.z = Math.PI;
    this.talkMouth = this.faceFeature(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), this.mats.glow));
    this.placeOnFace(this.smile, Math.PI / 2, 1.6);
    this.placeOnFace(this.talkMouth, Math.PI / 2, 1.6);

    // Side "headphone" discs.
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 24), this.mats.sneaker);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(side * 0.97, 0.12, 0);
      this.float.add(ear);
    }

    // Antenna: shows Tekkie's state through its colour.
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.034, 0.34, 10), this.mats.outline);
    stem.position.y = 0.17;
    this.antennaBulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), this.mats.antenna);
    this.antennaBulb.position.y = 0.38;
    this.antennaHalo = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), this.mats.halo);
    this.antennaHalo.position.y = 0.38;
    this.antenna.add(stem, this.antennaBulb, this.antennaHalo);
    this.antenna.position.y = 0.9;
    this.float.add(this.antenna);

    // Arms with white cartoon gloves, pivoting at the shoulder.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.86, -0.2, 0.05);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.24, 6, 12), this.mats.body);
      arm.position.y = -0.2;
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), this.mats.glove);
      glove.position.y = -0.42;
      pivot.add(arm, glove);
      pivot.rotation.z = side * 0.35;
      this.float.add(pivot);
      this.arms.push(pivot);
    }

    // Short legs ending in a pair of tekkies (sneakers).
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.36, -0.78, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.32, 10), this.mats.outline);
      leg.position.y = -0.18;
      const shoe = this.buildSneaker(side);
      shoe.position.set(0, -0.4, 0.06);
      shoe.rotation.y = side * 0.25;
      hip.add(leg, shoe);
      this.float.add(hip);
      this.legs.push(hip);
    }

    this.buildAccessories();

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -1.62;
    this.rig.add(this.shadow);
  }

  private buildSneaker(side: number) {
    const shoe = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.2, 6, 16), this.mats.sneaker);
    upper.rotation.x = Math.PI / 2;
    upper.scale.set(1, 1, 0.78);
    const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.22, 6, 16), this.mats.sole);
    sole.rotation.x = Math.PI / 2;
    sole.scale.set(1, 1, 0.32);
    sole.position.y = -0.09;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.24), this.mats.stripe);
    stripe.position.set(side * 0.148, -0.01, 0.02);
    stripe.rotation.x = -0.35;
    const laces = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.12), this.mats.trim);
    laces.position.set(0, 0.11, 0.08);
    laces.rotation.x = 0.4;
    shoe.add(upper, sole, stripe, laces);
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

    // Hover and squash.
    let squash = talk * 0.06;
    if (this.pokeT >= 0) {
      this.pokeT += dt;
      squash += Math.sin(this.pokeT * 18) * Math.exp(-this.pokeT * 5) * 0.12;
      if (this.pokeT > 1.2) this.pokeT = -1;
    }
    this.float.position.y = Math.sin(t * 1.7) * 0.08 + talk * 0.05;
    this.float.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    const lift = (this.float.position.y + 0.1) / 0.3;
    this.shadow.scale.setScalar(1 - lift * 0.15);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.9 - lift * 0.3;

    // Follow the pointer; when thinking, glance up and to the side.
    const lookTarget = thinking ? new THREE.Vector2(0.55, 0.7) : this.look;
    this.lookSmoothed.x = smooth(this.lookSmoothed.x, lookTarget.x, 6, dt);
    this.lookSmoothed.y = smooth(this.lookSmoothed.y, lookTarget.y, 6, dt);
    const lx = this.lookSmoothed.x;
    const ly = this.lookSmoothed.y;
    this.rig.rotation.y = lx * 0.42 + (s === "connecting" ? Math.sin(t * 6) * 0.08 : 0);
    this.rig.rotation.x = -ly * 0.18 + (s === "listening" ? 0.06 : 0);
    this.rig.rotation.z = Math.sin(t * 1.1) * 0.03 - lx * 0.05;

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
      eye.scale.set(1, lid * eyeOpen, 1);
    });

    // Mouth: smile at rest, an open oval that tracks loudness while talking.
    this.talkMouth.visible = speaking && talk > 0.1;
    this.smile.visible = !this.talkMouth.visible;
    this.talkMouth.children[0].scale.set(0.1 + talk * 0.04, 0.035 + talk * 0.09, 0.04);
    this.smile.children[0].rotation.z = s === "error" ? 0 : Math.PI;
    this.smile.scale.setScalar(s === "listening" ? 0.85 : 1);

    // Antenna colour and pulse by state.
    const glow = STATE_GLOW[s] ?? this.skin.glow;
    this.mats.antenna.color.setHex(glow);
    this.mats.halo.color.setHex(glow);
    let pulse = 1 + Math.sin(t * 3) * 0.08;
    if (s === "listening") pulse = 1 + Math.min(this.micLevel * 8, 0.8);
    if (thinking) pulse = 0.8 + Math.abs(Math.sin(t * 5)) * 0.5;
    if (speaking) pulse = 1 + talk * 0.7;
    this.antennaHalo.scale.setScalar(pulse);
    // Spring so the antenna wobbles when Tekkie turns.
    const turn = this.rig.rotation.y - this.lastRigRotY;
    this.lastRigRotY = this.rig.rotation.y;
    this.antennaVel += (-this.antennaSway * 60 - this.antennaVel * 6) * dt - turn * 4;
    this.antennaSway += this.antennaVel * dt;
    this.antenna.rotation.z = this.antennaSway + Math.sin(t * 1.3) * 0.05;

    // Arms: gentle sway, talking gestures, and a wave on greeting.
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      let rz = side * (0.35 + Math.sin(t * 1.7 + i) * 0.06 + talk * 0.25);
      let rx = speaking ? Math.sin(t * 7 + i * 2) * talk * 0.4 : 0;
      if (thinking && side === 1) {
        rz = 2.3; // hand up to scratch its head
        rx = -0.6;
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

    // Legs dangle a beat behind the body.
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(t * 1.7 - 0.6 + i * 0.8) * 0.12 + talk * 0.1;
    });

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    Object.values(this.mats).forEach((m) => m.dispose());
    this.gradient.dispose();
  }
}

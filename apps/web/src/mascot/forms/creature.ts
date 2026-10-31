// Critter: a round fluffy pet with huge eyes, floppy ears, stubby paws, a wagging tail and, of
// course, tekkies. The skin's body colour is the fur, the visor colour the inner ears and belly.
import * as THREE from "three";
import type { Skin } from "../skins";
import { buildAccessories, buildEye, buildSneaker, glowSprite, smooth, type EyeRig, type Face, type Form, type Leg, type Materials, type Pose } from "./common";

const BODY_R = 0.92;

export class CreatureForm implements Form {
  readonly kind = "creature" as const;
  readonly root = new THREE.Group();
  readonly head: THREE.Object3D;
  readonly arms: THREE.Group[] = [];
  readonly legs: Leg[] = [];
  readonly accessories;
  readonly sitDrop = 0.18;

  private body: THREE.Mesh;
  private fuzz: THREE.Mesh;
  private eyes: EyeRig[] = [];
  private ears: THREE.Group[] = [];
  private tail = new THREE.Group();
  private tailSegs: THREE.Mesh[] = [];
  private mouthGroup = new THREE.Group();
  private smile: THREE.Mesh;
  private mouthOpen: THREE.Mesh;
  private tongue: THREE.Mesh;
  private fangs: THREE.Mesh[] = [];
  private cheeks: THREE.Mesh[] = [];
  private tuft: THREE.Mesh;
  private collarGem: THREE.Mesh;
  private gemGlow: THREE.Sprite;
  private earVel = [0, 0];
  private earSway = [0, 0];

  constructor(private mats: Materials) {
    const m = mats;
    this.head = this.root;
    this.body = new THREE.Mesh(new THREE.SphereGeometry(BODY_R, 72, 54), m.fur);
    this.body.scale.set(1, 1.02, 0.95);
    this.root.add(this.body);
    // A faint oversized shell gives the silhouette a soft, furry edge.
    this.fuzz = new THREE.Mesh(new THREE.SphereGeometry(BODY_R * 1.045, 48, 36), m.fuzz);
    this.fuzz.scale.copy(this.body.scale);
    this.root.add(this.fuzz);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(BODY_R * 0.72, 48, 32), m.cloth);
    belly.position.set(0, -0.25, BODY_R * 0.4);
    belly.scale.set(0.85, 0.95, 0.5);
    this.root.add(belly);

    // Big eyes set wide.
    for (const side of [-1, 1]) {
      const eye = buildEye(m, 0.2, 0.68);
      eye.group.position.set(side * 0.34, 0.2, BODY_R * 0.8);
      eye.group.rotation.y = side * 0.25;
      this.root.add(eye.group);
      this.eyes.push(eye);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), m.cheek);
      cheek.position.set(side * 0.5, -0.12, BODY_R * 0.8);
      cheek.rotation.y = side * 0.55;
      this.root.add(cheek);
      this.cheeks.push(cheek);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), m.nose);
    nose.position.set(0, -0.06, BODY_R * 0.97);
    nose.scale.set(1.3, 0.8, 0.8);
    this.root.add(nose);

    this.mouthGroup.position.set(0, -0.26, BODY_R * 0.9);
    this.root.add(this.mouthGroup);
    this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 10, 30, Math.PI), m.nose);
    this.smile.rotation.z = Math.PI;
    this.mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.mouthDark);
    this.tongue = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), m.tongue);
    this.mouthGroup.add(this.smile, this.mouthOpen, this.tongue);
    for (const side of [-1, 1]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 8), m.trim);
      fang.rotation.x = Math.PI;
      fang.position.set(side * 0.09, 0.02, 0.01);
      this.mouthGroup.add(fang);
      this.fangs.push(fang);
    }

    // Floppy ears, jointed at the base so they swing.
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.55, BODY_R * 0.78, -0.1);
      const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 8, 18), m.fur);
      outer.position.y = 0.32;
      outer.scale.set(1, 1, 0.5);
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4, 8, 16), m.cloth);
      inner.position.set(0, 0.32, 0.06);
      inner.scale.set(1, 1, 0.3);
      ear.add(outer, inner);
      ear.rotation.z = side * -0.45;
      this.root.add(ear);
      this.ears.push(ear);
    }
    this.tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 12), m.fur);
    this.tuft.position.set(0, BODY_R * 1.0, 0.05);
    this.tuft.rotation.z = -0.3;
    this.root.add(this.tuft);

    // Collar with a gem that shows the state.
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 12, 40), m.accessory);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, -0.62, 0.22);
    collar.scale.set(1, 1.1, 1);
    this.root.add(collar);
    this.collarGem = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), m.lamp);
    this.collarGem.position.set(0, -0.66, 0.7);
    this.root.add(this.collarGem);
    this.gemGlow = glowSprite(0.5, 0.6);
    this.collarGem.add(this.gemGlow);

    // Stubby paws.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.78, -0.3, 0.2);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.2, 8, 14), m.fur);
      arm.position.y = -0.14;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), m.fur);
      paw.position.y = -0.3;
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), m.cloth);
      pad.position.set(0, -0.33, 0.09);
      pad.scale.set(1, 0.8, 0.5);
      pivot.add(arm, paw, pad);
      pivot.rotation.z = side * 0.6;
      this.root.add(pivot);
      this.arms.push(pivot);
    }

    // Short legs in tekkies.
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.34, -0.8, 0.05);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.12, 8, 12), m.fur);
      thigh.position.y = -0.08;
      const knee = new THREE.Group();
      knee.position.y = -0.16;
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.1, 8, 12), m.fur);
      shin.position.y = -0.08;
      const shoe = buildSneaker(m, side, 1.1);
      shoe.position.set(0, -0.26, 0.07);
      shoe.rotation.y = side * 0.3;
      knee.add(shin, shoe);
      hip.add(thigh, knee);
      this.root.add(hip);
      this.legs.push({ hip, knee });
    }

    // Tail: a chain of balls that wags from the base.
    this.tail.position.set(0, -0.5, -BODY_R * 0.85);
    let parent: THREE.Object3D = this.tail;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.13 - i * 0.012, 14, 10), i === 4 ? m.cloth : m.fur);
      seg.position.set(0, 0.05, -0.16);
      parent.add(seg);
      this.tailSegs.push(seg);
      parent = seg;
    }
    this.root.add(this.tail);

    this.accessories = buildAccessories(m, this.root, BODY_R, BODY_R * 0.98);
    this.root.position.y = -0.1;
  }

  applySkin(skin: Skin) {
    const m = this.mats;
    m.fur.color.setHex(skin.body);
    m.fuzz.color.setHex(skin.body);
    m.cloth.color.setHex(skin.visor === 0x16123a ? 0xffe3ef : skin.visor);
    m.iris.color.setHex(skin.glow);
    m.sneaker.color.setHex(skin.sneaker);
    m.stripe.color.setHex(skin.sneakerStripe);
    m.sole.color.setHex(skin.sole);
    m.accessory.color.setHex(skin.accessoryColor || skin.sneaker);
    m.lid.color.setHex(skin.body);
  }

  setFace(f: Face) {
    const squint = f.happy * 0.5 + f.angry * 0.3 + f.tired * 0.3;
    const lid = Math.min(f.lid, 1 - f.sleep * 0.92) * (1 + f.surprised * 0.3) * (1 - f.sad * 0.2);
    for (const e of this.eyes) e.set(Math.min(1, lid), f.lookX, f.lookY, squint);
    this.mats.cheek.opacity = Math.min(0.85, f.happy * 0.5 + f.love * 0.45);
    const open = Math.max(f.open, f.chomp);
    const shown = open > 0.08;
    this.mouthOpen.visible = this.tongue.visible = shown;
    this.smile.visible = !shown;
    for (const fang of this.fangs) fang.visible = !shown || open < 0.4;
    this.smile.rotation.z = f.sad > 0.3 || f.angry > 0.3 ? 0 : Math.PI;
    this.smile.scale.set(1 + f.happy * 0.4, 1 + f.happy * 0.5 - f.sad * 0.4, 1);
    const w = 0.09 + f.wide * 0.08 + f.happy * 0.03;
    const h = 0.02 + open * 0.11;
    this.mouthOpen.scale.set(w, h, 0.05);
    this.tongue.position.set(0, -h * 0.4, 0.03);
    this.tongue.scale.set(w / 0.1, Math.max(0.3, h * 4), 1);
  }

  setGlow(hex: number, pulse: number) {
    this.mats.lamp.color.setHex(hex);
    (this.gemGlow.material as THREE.SpriteMaterial).color.setHex(hex);
    this.gemGlow.scale.setScalar(0.5 * (0.7 + pulse * 0.35));
  }

  animate(p: Pose, dt: number) {
    // Ears swing on springs and perk up when listening or surprised.
    this.ears.forEach((ear, i) => {
      const side = i === 0 ? -1 : 1;
      this.earVel[i] += (-this.earSway[i] * 50 - this.earVel[i] * 5) * dt - p.turn * 3 * side + Math.cos(p.phase * 2 + i) * p.stride * dt * 2;
      this.earSway[i] += this.earVel[i] * dt;
      const perk = (p.listening ? 0.35 : 0) + p.surprised * 0.5 + p.happy * 0.1 - p.sad * 0.5 - p.sleep * 0.6 - p.tired * 0.2;
      ear.rotation.z = side * (-0.45 - perk) + this.earSway[i];
      ear.rotation.x = Math.sin(p.t * 1.8 + i) * 0.06 - p.sad * 0.3;
    });
    // Tail wags faster the happier Tekkie is.
    const wag = 1.5 + p.happy * 8 + p.dance * 6 + p.hover * 3;
    this.tailSegs.forEach((seg, i) => {
      seg.rotation.y = Math.sin(p.t * wag - i * 0.5) * (0.35 + p.happy * 0.3) * (1 - p.sleep * 0.8);
      seg.rotation.x = -0.25 + Math.sin(p.t * 1.2 + i) * 0.05 - p.sad * 0.3;
    });
    this.tuft.rotation.z = -0.3 + Math.sin(p.t * 2.3) * 0.1 - p.turn * 2;
    // Breathing.
    const breath = 1 + Math.sin(p.t * (p.sleep > 0.5 ? 1.2 : 2.4)) * 0.012;
    this.body.scale.set(breath, 1.02 * (2 - breath), 0.95 * breath);
    this.fuzz.scale.copy(this.body.scale).multiplyScalar(1 + p.hover * 0.02);
    (this.mats.fuzz as THREE.MeshPhysicalMaterial).opacity = smooth((this.mats.fuzz as THREE.MeshPhysicalMaterial).opacity, 0.2 + p.hover * 0.1 + p.love * 0.1, 6, dt);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
      if (o instanceof THREE.Sprite) o.material.dispose();
    });
  }
}

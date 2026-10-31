// Buddy: a stylised little person in a hoodie, with a big head, real eyes, brows and a mouth that
// shapes to the voice. The skin's body colour is the hoodie, the visor colour the hair, the glow the eyes.
import * as THREE from "three";
import type { Skin } from "../skins";
import { buildAccessories, buildEye, buildSneaker, glowSprite, roundedBox, smooth, type EyeRig, type Face, type Form, type Leg, type Materials, type Pose } from "./common";

const HEAD_R = 0.62;
const HEAD_Y = 0.62;

export class HumanoidForm implements Form {
  readonly kind = "humanoid" as const;
  readonly root = new THREE.Group();
  readonly head = new THREE.Group();
  private inner = new THREE.Group();
  readonly arms: THREE.Group[] = [];
  readonly legs: Leg[] = [];
  readonly accessories;
  readonly sitDrop = 0.3;

  private eyes: EyeRig[] = [];
  private brows: THREE.Mesh[] = [];
  private cheeks: THREE.Mesh[] = [];
  private mouthGroup = new THREE.Group();
  private lips: THREE.Mesh;
  private mouthOpen: THREE.Mesh;
  private teeth: THREE.Mesh;
  private tongue: THREE.Mesh;
  private hairTuft: THREE.Mesh;
  private badge: THREE.Mesh;
  private badgeGlow: THREE.Sprite;

  constructor(private mats: Materials) {
    const m = mats;
    // Torso: hoodie with a pocket and strings; hips a little narrower.
    const torso = roundedBox(0.95, 0.9, 0.6, 0.24, m.cloth);
    torso.position.y = -0.38;
    this.root.add(torso);
    const pocket = roundedBox(0.5, 0.22, 0.08, 0.05, m.cloth);
    pocket.position.set(0, -0.62, 0.3);
    this.root.add(pocket);
    for (const side of [-1, 1]) {
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), m.trim);
      string.position.set(side * 0.13, -0.18, 0.31);
      this.root.add(string);
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 12, 32), m.cloth);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.1;
    this.root.add(collar);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.2, 20), m.skinTone);
    neck.position.y = 0.1;
    this.root.add(neck);
    this.badge = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), m.lamp);
    this.badge.position.set(0.28, -0.15, 0.31);
    this.root.add(this.badge);
    this.badgeGlow = glowSprite(0.4, 0.5);
    this.badgeGlow.position.z = 0.04;
    this.badge.add(this.badgeGlow);

    // Head: the outer group turns toward the pointer; everything hangs off the inner one, which nods.
    this.head.position.y = HEAD_Y;
    this.root.add(this.head);
    this.head.add(this.inner);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 64, 48), m.skinTone);
    skull.scale.set(1, 1.04, 0.96);
    this.inner.add(skull);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 0.6, 32, 24), m.skinTone);
    chin.position.set(0, -HEAD_R * 0.5, HEAD_R * 0.12);
    chin.scale.set(1.2, 0.8, 1);
    this.inner.add(chin);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), m.skinTone);
      ear.position.set(side * HEAD_R * 0.98, 0.02, 0);
      ear.scale.set(0.5, 1, 0.8);
      this.inner.add(ear);
    }
    // Hair: a cap, bangs and a little tuft on top.
    const hair = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.06, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.52), m.hair);
    hair.position.y = 0.04;
    this.inner.add(hair);
    for (let i = 0; i < 5; i++) {
      const bang = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), m.hair);
      const a = (i - 2) * 0.32;
      bang.position.set(Math.sin(a) * HEAD_R * 0.9, HEAD_R * 0.55 - Math.abs(a) * 0.08, Math.cos(a) * HEAD_R * 0.9);
      bang.scale.set(1, 1.25, 0.6);
      bang.rotation.y = a;
      this.inner.add(bang);
    }
    this.hairTuft = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 12), m.hair);
    this.hairTuft.position.set(0.08, HEAD_R * 1.08, -0.05);
    this.hairTuft.rotation.z = -0.5;
    this.inner.add(this.hairTuft);

    // Face.
    for (const side of [-1, 1]) {
      const eye = buildEye(m, 0.13, 0.6);
      eye.group.position.set(side * 0.22, 0.02, HEAD_R * 0.86);
      eye.group.rotation.y = side * 0.12;
      this.inner.add(eye.group);
      this.eyes.push(eye);
      const brow = roundedBox(0.2, 0.04, 0.04, 0.015, m.brow);
      brow.position.set(side * 0.22, 0.22, HEAD_R * 0.9);
      this.inner.add(brow);
      this.brows.push(brow);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), m.cheek);
      cheek.position.set(side * 0.33, -0.14, HEAD_R * 0.86);
      cheek.rotation.y = side * 0.5;
      this.inner.add(cheek);
      this.cheeks.push(cheek);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), m.skinTone);
    nose.position.set(0, -0.1, HEAD_R * 0.98);
    nose.scale.set(1, 0.8, 1);
    this.inner.add(nose);

    this.mouthGroup.position.set(0, -0.3, HEAD_R * 0.9);
    this.inner.add(this.mouthGroup);
    this.lips = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.024, 10, 30, Math.PI), m.lips);
    this.lips.rotation.z = Math.PI;
    this.mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.mouthDark);
    this.teeth = roundedBox(0.16, 0.04, 0.03, 0.01, m.trim);
    this.tongue = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), m.tongue);
    this.mouthGroup.add(this.lips, this.mouthOpen, this.teeth, this.tongue);

    // Arms with sleeves and hands.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.5, -0.08, 0);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), m.cloth);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.42, 8, 16), m.cloth);
      sleeve.position.y = -0.28;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 24), m.trim);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.52;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), m.skinTone);
      hand.position.y = -0.62;
      hand.scale.set(1, 1.1, 0.8);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.05, 6, 10), m.skinTone);
      thumb.position.set(side * -0.09, -0.58, 0.05);
      thumb.rotation.z = side * 0.8;
      pivot.add(shoulder, sleeve, cuff, hand, thumb);
      pivot.rotation.z = side * 0.18;
      this.root.add(pivot);
      this.arms.push(pivot);
    }

    // Legs: jeans and tekkies.
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.22, -0.8, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 8, 14), m.darkMetal);
      thigh.position.y = -0.14;
      const knee = new THREE.Group();
      knee.position.y = -0.3;
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.2, 8, 14), m.darkMetal);
      shin.position.y = -0.12;
      const shoe = buildSneaker(m, side, 1.05);
      shoe.position.set(0, -0.33, 0.07);
      shoe.rotation.y = side * 0.15;
      knee.add(shin, shoe);
      hip.add(thigh, knee);
      this.root.add(hip);
      this.legs.push({ hip, knee });
    }

    this.accessories = buildAccessories(m, this.inner, HEAD_R, HEAD_R * 1.02);
    this.root.position.y = 0.05;
  }

  applySkin(skin: Skin) {
    const m = this.mats;
    m.cloth.color.setHex(skin.body);
    m.hair.color.setHex(skin.visor === 0x16123a ? 0x3a2a24 : skin.visor);
    m.brow.color.copy(m.hair.color);
    m.iris.color.setHex(skin.glow);
    m.sneaker.color.setHex(skin.sneaker);
    m.stripe.color.setHex(skin.sneakerStripe);
    m.sole.color.setHex(skin.sole);
    m.accessory.color.setHex(skin.accessoryColor);
    m.darkMetal.color.setHex(0x2f3550);
    const tone = skin.skinTone ?? 0xf0c4a0;
    m.skinTone.color.setHex(tone);
    m.lid.color.setHex(tone);
  }

  setFace(f: Face) {
    const squint = f.happy * 0.6 + f.angry * 0.3 + f.tired * 0.3;
    const lid = Math.min(f.lid, 1 - f.sleep * 0.92) * (1 + f.surprised * 0.3) * (1 - f.sad * 0.25);
    for (const e of this.eyes) e.set(Math.min(1, lid), f.lookX, f.lookY, squint);
    this.brows.forEach((b, i) => {
      const side = i === 0 ? -1 : 1;
      b.position.y = 0.22 + f.surprised * 0.08 - f.angry * 0.05 - f.sleep * 0.03 + f.sad * 0.02;
      b.rotation.z = side * (f.angry * 0.45 - f.sad * 0.3 - f.surprised * 0.05);
    });
    this.mats.cheek.opacity = Math.min(0.85, f.happy * 0.45 + f.love * 0.4);
    // Mouth: lips curve with mood; the opening is a dark ellipse that stretches wide or round.
    const open = Math.max(f.open, f.chomp);
    const shown = open > 0.08;
    this.mouthOpen.visible = this.teeth.visible = this.tongue.visible = shown;
    this.lips.visible = !shown;
    this.lips.rotation.z = f.sad > 0.3 || f.angry > 0.3 ? 0 : Math.PI;
    this.lips.scale.set(1 + f.happy * 0.4, 1 + f.happy * 0.5 - f.sad * 0.4, 1);
    const w = 0.07 + f.wide * 0.08 + f.happy * 0.03 - f.surprised * 0.02;
    const h = 0.02 + open * 0.09;
    this.mouthOpen.scale.set(w, h, 0.04);
    this.teeth.position.y = h * 0.6;
    this.teeth.scale.x = w / 0.09;
    this.tongue.position.set(0, -h * 0.5, 0.02);
    this.tongue.scale.set(w / 0.09, Math.max(0.2, h * 4), 1);
  }

  setGlow(hex: number, pulse: number) {
    this.mats.lamp.color.setHex(hex);
    (this.badgeGlow.material as THREE.SpriteMaterial).color.setHex(hex);
    this.badgeGlow.scale.setScalar(0.4 * (0.7 + pulse * 0.35));
  }

  animate(p: Pose, dt: number) {
    // Head bob and the tuft swaying; shoulders rise when thinking.
    this.head.position.y = HEAD_Y + Math.sin(p.phase * 2) * 0.025 * p.stride + p.talk * 0.01;
    this.hairTuft.rotation.z = -0.5 + Math.sin(p.t * 2.1) * 0.08 - p.turn * 2;
    const nod = p.speaking ? Math.sin(p.t * 6) * 0.04 * p.talk : 0;
    this.inner.rotation.x = smooth(this.inner.rotation.x, nod + p.sleep * 0.3 + p.sad * 0.15, 10, dt);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
      if (o instanceof THREE.Sprite) o.material.dispose();
    });
  }
}

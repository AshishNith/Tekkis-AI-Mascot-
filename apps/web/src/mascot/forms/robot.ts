// The robot: a glossy two-tone shell with a glass screen for a face, headphones, an antenna lamp,
// jointed arms and legs, and a pair of tekkies.
import * as THREE from "three";
import type { Skin } from "../skins";
import { buildAccessories, buildSneaker, glowSprite, placeOnSphere, roundedBox, smooth, spherePoint, type Face, type Form, type Leg, type Materials, type Pose, Z_AXIS } from "./common";

export class RobotForm implements Form {
  readonly kind = "robot" as const;
  readonly root = new THREE.Group();
  readonly head: THREE.Object3D;
  readonly arms: THREE.Group[] = [];
  readonly legs: Leg[] = [];
  readonly accessories;
  readonly sitDrop = 0.22;

  private body: THREE.Mesh;
  private eyes: THREE.Group[] = [];
  private eyeGlows: THREE.Sprite[] = [];
  private cheeks: THREE.Group[] = [];
  private smile: THREE.Group;
  private mouth: THREE.Group;
  private antenna = new THREE.Group();
  private antennaGlow: THREE.Sprite;
  private bellyGlow: THREE.Sprite;
  private earRings: THREE.Mesh[] = [];
  private antennaSway = 0;
  private antennaVel = 0;
  private skin!: Skin;

  constructor(private mats: Materials) {
    this.head = this.root;

    // Shell: a slightly squashed sphere with a darker lower half and a seam between them.
    this.body = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 54), mats.body);
    this.body.scale.set(1, 0.95, 0.92);
    this.root.add(this.body);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(1.004, 72, 32, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), mats.darkMetal);
    this.body.add(lower);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.014, 8, 80), mats.metal);
    seam.rotation.x = Math.PI / 2;
    seam.position.y = -0.37;
    this.body.add(seam);
    // Chest plate with a lit core.
    const plate = roundedBox(0.42, 0.26, 0.08, 0.04, mats.metal);
    plate.position.copy(spherePoint(Math.PI / 2, 2.05, 0.98));
    plate.quaternion.setFromUnitVectors(Z_AXIS, plate.position.clone().normalize());
    this.body.add(plate);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), mats.lamp);
    core.position.z = 0.045;
    plate.add(core);
    this.bellyGlow = glowSprite(0.5, 0.5);
    this.bellyGlow.position.z = 0.1;
    plate.add(this.bellyGlow);
    // Rivets.
    for (const a of [-0.5, 0.5]) {
      for (const th of [1.95, 2.25]) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), mats.metal);
        rivet.position.copy(spherePoint(Math.PI / 2 + a, th, 0.99));
        this.body.add(rivet);
      }
    }

    // Glass screen hugging the front, with a bezel.
    const visorW = 1.95;
    const visor = new THREE.Mesh(new THREE.SphereGeometry(1.012, 72, 36, Math.PI / 2 - visorW / 2, visorW, 0.78, 1.12), mats.visor);
    this.body.add(visor);
    const bezel = new THREE.Mesh(new THREE.SphereGeometry(1.008, 72, 36, Math.PI / 2 - visorW / 2 - 0.045, visorW + 0.09, 0.735, 1.21), mats.darkMetal);
    this.body.add(bezel);
    const screenShade = new THREE.Mesh(new THREE.SphereGeometry(1.0, 72, 36, Math.PI / 2 - visorW / 2, visorW, 0.78, 1.12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    this.body.add(screenShade);

    // Eyes: lit capsules behind the glass, with a soft glow and a spark.
    for (let i = 0; i < 2; i++) {
      const eye = new THREE.Group();
      eye.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.13, 8, 20), mats.glow));
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), mats.spark);
      spark.position.set(-0.03, 0.07, 0.07);
      eye.add(spark);
      const glow = glowSprite(0.75, 0.45);
      glow.position.z = 0.05;
      eye.add(glow);
      this.eyeGlows.push(glow);
      this.body.add(eye);
      this.eyes.push(eye);
    }
    for (const side of [-1, 1]) {
      const cheek = this.faceFeature(new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), mats.cheek));
      placeOnSphere(cheek, Math.PI / 2 + side * 0.5, 1.5, 1.03);
      this.cheeks.push(cheek);
    }
    this.smile = this.faceFeature(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.026, 10, 28, Math.PI), mats.glow));
    this.smile.children[0].rotation.z = Math.PI;
    this.mouth = this.faceFeature(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), mats.glow));
    placeOnSphere(this.smile, Math.PI / 2, 1.6, 1.03);
    placeOnSphere(this.mouth, Math.PI / 2, 1.6, 1.03);

    // Headphones.
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.13, 36), mats.sneaker);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.145, 28), mats.metal);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.012, 8, 40), mats.lamp);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = side * 0.072;
      ear.add(cup, cap, ring);
      this.earRings.push(ring);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(side * 0.97, 0.12, 0);
      this.root.add(ear);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.035, 10, 60, Math.PI), mats.darkMetal);
    band.position.y = 0.12;
    band.scale.set(1, 0.92, 1);
    this.root.add(band);

    // Antenna lamp.
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.05, 20), mats.metal);
    collar.position.y = 0.02;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.34, 12), mats.metal);
    stem.position.y = 0.19;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 18), mats.lamp);
    bulb.position.y = 0.4;
    this.antennaGlow = glowSprite(0.9, 0.7);
    this.antennaGlow.position.y = 0.4;
    this.antenna.add(collar, stem, bulb, this.antennaGlow);
    this.antenna.position.y = 0.9;
    this.root.add(this.antenna);

    // Arms: ball shoulder, shell upper arm, cuff, glove.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.86, -0.2, 0.05);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), mats.metal);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 8, 16), mats.body);
      arm.position.y = -0.2;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.02, 8, 24), mats.metal);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.36;
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), mats.glove);
      glove.position.y = -0.45;
      glove.scale.set(1, 0.95, 1.05);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.06, 6, 10), mats.glove);
      thumb.position.set(side * -0.1, -0.42, 0.06);
      thumb.rotation.z = side * 0.9;
      pivot.add(shoulder, arm, cuff, glove, thumb);
      pivot.rotation.z = side * 0.35;
      this.root.add(pivot);
      this.arms.push(pivot);
    }

    // Legs.
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.36, -0.78, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.052, 0.2, 14), mats.metal);
      thigh.position.y = -0.1;
      const knee = new THREE.Group();
      knee.position.y = -0.2;
      const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 10), mats.darkMetal);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.046, 0.18, 14), mats.metal);
      shin.position.y = -0.09;
      const shoe = buildSneaker(mats, side);
      shoe.position.set(0, -0.2, 0.06);
      shoe.rotation.y = side * 0.25;
      knee.add(kneeCap, shin, shoe);
      hip.add(thigh, knee);
      this.root.add(hip);
      this.legs.push({ hip, knee });
    }

    this.accessories = buildAccessories(mats, this.root, 1, 0.95);
  }

  private faceFeature(mesh: THREE.Mesh) {
    const g = new THREE.Group();
    g.add(mesh);
    this.body.add(g);
    return g;
  }

  applySkin(skin: Skin) {
    this.skin = skin;
    const m = this.mats;
    m.body.color.setHex(skin.body);
    m.visor.color.setHex(skin.visor);
    m.glow.color.setHex(skin.glow);
    m.sneaker.color.setHex(skin.sneaker);
    m.stripe.color.setHex(skin.sneakerStripe);
    m.sole.color.setHex(skin.sole);
    m.accessory.color.setHex(skin.accessoryColor);
    m.cloth.color.setHex(skin.accessoryColor);
    for (const g of this.eyeGlows) (g.material as THREE.SpriteMaterial).color.setHex(skin.glow);
    // Tall hats would swallow the antenna.
    this.antenna.visible = ![...this.accessories].some(([id, g]) => g.visible && (id === "witch-hat" || id === "santa-hat" || id === "crown"));
  }

  setFace(f: Face) {
    const lx = f.lookX;
    const ly = f.lookY;
    const eyeOpen = (1 + f.surprised * 0.45) * (1 - f.sad * 0.35) * (1 - f.sleep * 0.85) * (1 - f.tired * 0.25);
    this.eyes.forEach((eye, i) => {
      const side = i === 0 ? -1 : 1;
      placeOnSphere(eye, Math.PI / 2 + side * 0.3 - lx * 0.14, 1.27 - ly * 0.1, 1.03);
      eye.scale.set(
        (1 + f.happy * 0.25) * (1 + f.surprised * 0.25) * (1 + f.love * 0.2 * Math.abs(Math.sin(performance.now() / 120))),
        Math.max(0.08, f.lid) * eyeOpen * (1 - f.happy * 0.5) * (1 - f.angry * 0.4),
        1,
      );
      eye.rotation.z = side * (f.sad * 0.35 - f.angry * 0.4);
    });
    this.mats.cheek.opacity = Math.min(0.9, f.happy * 0.55 + f.love * 0.35);
    const eyeHex = f.love > 0.3 ? 0xff6fb5 : f.sad > 0.3 ? 0x7fb2ff : f.angry > 0.3 ? 0xff5a4d : this.skin.glow;
    this.mats.glow.color.setHex(eyeHex);
    for (const g of this.eyeGlows) (g.material as THREE.SpriteMaterial).color.setHex(eyeHex);

    const open = Math.max(f.open, f.chomp);
    this.mouth.visible = open > 0.1;
    this.smile.visible = !this.mouth.visible;
    const round = f.surprised > 0.3 ? 1 : 0;
    this.mouth.children[0].scale.set(0.09 + open * 0.03 + f.wide * 0.06 - round * 0.03, 0.03 + open * 0.1 - f.wide * 0.02, 0.04);
    this.smile.children[0].rotation.z = f.sad > 0.3 || f.angry > 0.3 ? 0 : Math.PI;
    this.smile.scale.setScalar((1 + f.happy * 0.35) * (1 - f.sad * 0.2));
  }

  setGlow(hex: number, pulse: number) {
    this.mats.lamp.color.setHex(hex);
    (this.antennaGlow.material as THREE.SpriteMaterial).color.setHex(hex);
    (this.bellyGlow.material as THREE.SpriteMaterial).color.setHex(hex);
    this.antennaGlow.scale.setScalar(0.9 * pulse);
    this.bellyGlow.scale.setScalar(0.45 * (0.8 + pulse * 0.3));
  }

  animate(p: Pose, dt: number) {
    // The antenna is on a spring: it wobbles when the body turns or steps.
    this.antennaVel += (-this.antennaSway * 60 - this.antennaVel * 6) * dt - p.turn * 4 + Math.cos(p.phase * 2) * p.stride * dt * 3;
    if (p.surprised > 0.5 && Math.abs(this.antennaVel) < 2) this.antennaVel += 4;
    this.antennaSway += this.antennaVel * dt;
    this.antenna.rotation.z = this.antennaSway + Math.sin(p.t * 1.3) * 0.05 + p.sad * 0.5 + p.sleep * 0.35;
    // Headphone rings breathe with the music (dance) or the voice.
    const k = 1 + p.dance * 0.15 * Math.abs(Math.sin(p.t * 7)) + p.talk * 0.1;
    for (const r of this.earRings) r.scale.setScalar(smooth(r.scale.x, k, 20, dt));
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
      if (o instanceof THREE.Sprite) o.material.dispose();
    });
  }
}

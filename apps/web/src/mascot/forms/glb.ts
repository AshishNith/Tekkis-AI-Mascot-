// A rigged model from a 3D artist (or a generator like Meshy / Ready Player Me / Mixamo), dropped in
// as a .glb. Animation clips are picked by name (idle / walk / wave / dance / talk), blend shapes drive
// the mouth and blinking when the model has them, and the head bone turns toward the pointer.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Accessory, Skin } from "../skins";
import { FLOOR_Y, type Face, type Form, type Leg, type Pose } from "./common";

const HEIGHT = 2.9;
const CLIP_NAMES = {
  idle: /idle|breath|stand|rest/i,
  walk: /walk|run|jog/i,
  wave: /wave|hello|greet/i,
  dance: /danc|groove/i,
  talk: /talk|speak|speech/i,
  jump: /jump|hop/i,
};
type ClipKind = keyof typeof CLIP_NAMES;

interface Morph {
  mesh: THREE.Mesh;
  index: number;
}

export class GlbForm implements Form {
  readonly kind = "glb" as const;
  readonly root = new THREE.Group();
  readonly head: THREE.Object3D;
  readonly arms: THREE.Group[] = [];
  readonly legs: Leg[] = [];
  readonly accessories = new Map<Accessory, THREE.Group>();
  readonly sitDrop = 0.2;

  private mixer?: THREE.AnimationMixer;
  private actions = new Map<ClipKind, THREE.AnimationAction>();
  private current?: ClipKind;
  private oneShot?: THREE.AnimationAction;
  private mouthMorphs: Morph[] = [];
  private blinkMorphs: Morph[] = [];
  private smileMorphs: Morph[] = [];
  private headBone?: THREE.Object3D;
  private headRest = new THREE.Euler();

  static async load(bytes: ArrayBuffer): Promise<GlbForm> {
    const gltf = await new GLTFLoader().parseAsync(bytes, "");
    return new GlbForm(gltf.scene, gltf.animations);
  }

  private constructor(scene: THREE.Group, clips: THREE.AnimationClip[]) {
    // Fit the model to Tekkie's frame: feet on the floor, about as tall as the robot.
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const scale = HEIGHT / Math.max(size.y, 1e-3);
    scene.scale.setScalar(scale);
    box.setFromObject(scene);
    const centre = box.getCenter(new THREE.Vector3());
    scene.position.set(-centre.x, FLOOR_Y - box.min.y, -centre.z);
    this.root.add(scene);

    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        const dict = o.morphTargetDictionary;
        if (dict) {
          for (const [name, index] of Object.entries(dict)) {
            if (/jawOpen|mouthOpen|viseme_aa|^aa$|MouthOpen|vrc\.v_aa/i.test(name)) this.mouthMorphs.push({ mesh: o, index });
            else if (/eyeBlink|^blink|eyesClosed|eye_close|Blink/i.test(name)) this.blinkMorphs.push({ mesh: o, index });
            else if (/mouthSmile|smile/i.test(name)) this.smileMorphs.push({ mesh: o, index });
          }
        }
      }
      if (!this.headBone && /(^|[:_])head$/i.test(o.name)) this.headBone = o;
    });
    this.head = this.headBone ?? this.root;
    if (this.headBone) this.headRest.copy(this.headBone.rotation);

    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(scene);
      for (const kind of Object.keys(CLIP_NAMES) as ClipKind[]) {
        const clip = clips.find((c) => CLIP_NAMES[kind].test(c.name));
        if (clip) this.actions.set(kind, this.mixer.clipAction(clip));
      }
      // No named idle: the first clip is the idle.
      if (!this.actions.has("idle")) this.actions.set("idle", this.mixer.clipAction(clips[0]));
      this.play("idle");
    } else {
      // No animations: let the procedural rig move the limbs, if we can find them.
      const bone = (re: RegExp) => {
        let hit: THREE.Object3D | undefined;
        scene.traverse((o) => {
          if (!hit && re.test(o.name)) hit = o;
        });
        return hit as THREE.Group | undefined;
      };
      const l = bone(/left(arm|shoulder|upperarm)/i);
      const r = bone(/right(arm|shoulder|upperarm)/i);
      if (l && r) this.arms.push(l, r);
      const lu = bone(/left(upleg|thigh|hip)/i);
      const ru = bone(/right(upleg|thigh|hip)/i);
      const ll = bone(/left(leg|shin|knee)$/i);
      const rl = bone(/right(leg|shin|knee)$/i);
      if (lu && ru && ll && rl) this.legs.push({ hip: lu, knee: ll }, { hip: ru, knee: rl });
    }
  }

  private play(kind: ClipKind) {
    const next = this.actions.get(kind);
    if (!next || this.current === kind) return;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    next.reset().setEffectiveWeight(1).fadeIn(0.3).play();
    prev?.fadeOut(0.3);
    this.current = kind;
  }

  /** Plays a short clip (wave, jump) once on top of whatever is running. */
  cue(kind: "wave" | "jump") {
    const action = this.actions.get(kind);
    if (!action) return;
    this.oneShot?.fadeOut(0.2);
    action.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.15).play();
    action.clampWhenFinished = false;
    this.oneShot = action;
  }

  applySkin(_skin: Skin) {
    /* a real model keeps its own colours */
  }

  setFace(f: Face) {
    const open = Math.max(f.open, f.chomp);
    for (const m of this.mouthMorphs) m.mesh.morphTargetInfluences![m.index] = open;
    for (const m of this.blinkMorphs) m.mesh.morphTargetInfluences![m.index] = Math.max(1 - f.lid, f.sleep * 0.9);
    for (const m of this.smileMorphs) m.mesh.morphTargetInfluences![m.index] = Math.min(1, f.happy * 0.8 + f.love * 0.5);
  }

  animate(p: Pose, dt: number) {
    if (this.mixer) {
      if (p.dance > 0.5) this.play("dance");
      else if (p.stride > 0.5) this.play("walk");
      else if (p.speaking && p.talk > 0.2) this.play("talk");
      else this.play("idle");
      this.mixer.update(dt);
    }
    if (this.headBone) {
      // Look on top of whatever the clip did to the head.
      this.headBone.rotation.y += 0;
    }
  }

  setGlow() {
    /* nothing lit on a plain model */
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
  }
}

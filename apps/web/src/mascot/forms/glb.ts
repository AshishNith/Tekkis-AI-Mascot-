// A rigged model from a 3D artist (or a generator like Meshy / Ready Player Me / Mixamo), dropped in
// as a .glb. Animation clips are picked by name (idle / walk / run / wave / dance / talk), blend shapes drive
// the mouth and blinking when the model has them, and the head bone turns toward the pointer.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Accessory, Skin } from "../skins";
import { FLOOR_Y, type Face, type Form, type FormKind, type Leg, type Pose } from "./common";

const HEIGHT = 2.9;
// Three.js blends clips by relative weight, so a cue has to outweigh the clip underneath it to read fully.
const CUE_WEIGHT = 20;
const CUE_FADE = 0.2;
// A gait clip is sped up or slowed down to match the ground speed, within reason.
const GAIT_SCALE_MIN = 0.6;
const GAIT_SCALE_MAX = 2.4;
const CLIP_NAMES = {
  idle: /idle|breath|stand|rest/i,
  walk: /walk/i,
  run: /run|jog|sprint/i,
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

/**
 * How fast the ground moves under a gait clip's feet: the speed of a foot while it is planted, which is
 * the steady low speed in a cycle (the foot is still against the ground, then whips forward). Sampled
 * from the clip itself, so it works for clips from any tool; undefined when the model has no foot bones.
 */
function measureGaitSpeed(scene: THREE.Object3D, clip: THREE.AnimationClip): number | undefined {
  const feet: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (/foot|ankle|toe/i.test(o.name)) feet.push(o);
  });
  if (!feet.length) return undefined;
  // Remember the pose, sample the clip through a throwaway mixer, then put the pose back.
  const saved = new Map<THREE.Object3D, [THREE.Vector3, THREE.Quaternion, THREE.Vector3]>();
  scene.traverse((o) => saved.set(o, [o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip).play();
  const steps = 48;
  const dt = clip.duration / steps;
  const speeds: number[] = [];
  const prev = feet.map(() => new THREE.Vector3());
  const cur = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    action.time = (i % steps) * dt;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    feet.forEach((foot, f) => {
      foot.getWorldPosition(cur);
      if (i > 0) speeds.push(Math.hypot(cur.x - prev[f].x, cur.z - prev[f].z) / dt);
      prev[f].copy(cur);
    });
  }
  mixer.stopAllAction();
  mixer.uncacheClip(clip);
  for (const [o, [p, q, s]] of saved) {
    o.position.copy(p);
    o.quaternion.copy(q);
    o.scale.copy(s);
  }
  speeds.sort((a, b) => a - b);
  const stance = speeds[Math.floor(speeds.length * 0.3)];
  return stance > 1e-3 ? stance : undefined;
}

export class GlbForm implements Form {
  readonly root = new THREE.Group();
  readonly head: THREE.Object3D;
  readonly arms: THREE.Group[] = [];
  readonly legs: Leg[] = [];
  readonly accessories = new Map<Accessory, THREE.Group>();
  readonly sitDrop = 0.2;

  private mixer?: THREE.AnimationMixer;
  private actions = new Map<ClipKind, THREE.AnimationAction>();
  /** Ground speed each gait clip was made for (world units per second), where it could be measured. */
  private gaitSpeeds = new Map<ClipKind, number>();
  private current?: ClipKind;
  private oneShot?: THREE.AnimationAction;
  private mouthMorphs: Morph[] = [];
  private blinkMorphs: Morph[] = [];
  private smileMorphs: Morph[] = [];
  private headBone?: THREE.Object3D;
  private headRest = new THREE.Euler();

  /** `kind` is the body this model stands for: "glb" for a user's own, or a built-in one it replaces. */
  static async load(bytes: ArrayBuffer, kind: FormKind = "glb"): Promise<GlbForm> {
    const gltf = await new GLTFLoader().parseAsync(bytes, "");
    return new GlbForm(gltf.scene, gltf.animations, kind);
  }

  private constructor(scene: THREE.Group, clips: THREE.AnimationClip[], readonly kind: FormKind) {
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
      for (const kind of ["walk", "run"] as const) {
        const action = this.actions.get(kind);
        const speed = action && measureGaitSpeed(scene, action.getClip());
        if (speed) this.gaitSpeeds.set(kind, speed);
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

  /** A model with only one of walk and run uses it for both. */
  private gait(kind: "walk" | "run"): ClipKind {
    const other = kind === "walk" ? "run" : "walk";
    return this.actions.has(kind) ? kind : other;
  }

  /** The ground speed the clip's feet were made for, in world units per second (unknown for some models). */
  gaitSpeed(kind: "walk" | "run") {
    return this.gaitSpeeds.get(this.gait(kind));
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
    this.oneShot?.fadeOut(CUE_FADE);
    action.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(CUE_WEIGHT).fadeIn(0.15).play();
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
      else if (p.stride > 0.5) this.play(this.gait(p.running ? "run" : "walk"));
      else if (p.speaking && p.talk > 0.2) this.play("talk");
      else this.play("idle");
      // Feet keep pace with the ground: the gait clip runs faster or slower to match the body's speed.
      if (this.current === "walk" || this.current === "run") {
        const made = this.gaitSpeeds.get(this.current);
        this.actions.get(this.current)!.timeScale = p.speed && made ? THREE.MathUtils.clamp(p.speed / made, GAIT_SCALE_MIN, GAIT_SCALE_MAX) : 1;
      }
      // Hand back to the clip underneath before the cue ends, so it doesn't snap.
      if (this.oneShot && this.oneShot.getClip().duration - this.oneShot.time < CUE_FADE) {
        this.oneShot.fadeOut(CUE_FADE);
        this.oneShot = undefined;
      }
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
      if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
          m.dispose();
        }
      }
    });
  }
}

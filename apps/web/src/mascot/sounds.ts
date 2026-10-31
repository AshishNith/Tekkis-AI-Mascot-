// Tiny synthesised sound effects (no audio files): chirps for feelings, a step, a greeting.
// Everything goes through one gain so it stays quiet and can be switched off.
import type { Emote } from "./TekkieCharacter";

type Note = [freq: number, at: number, len: number, type?: OscillatorType, gain?: number];

const TUNES: Partial<Record<Emote | "hello" | "step" | "level" | "pop", Note[]>> = {
  hello: [[660, 0, 0.09], [880, 0.1, 0.12], [1100, 0.22, 0.18]],
  celebrate: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.3]],
  laugh: [[700, 0, 0.07], [620, 0.09, 0.07], [700, 0.18, 0.07], [620, 0.27, 0.07], [700, 0.36, 0.1]],
  surprised: [[500, 0, 0.05, "square", 0.5], [1200, 0.05, 0.18, "square", 0.5]],
  sad: [[440, 0, 0.18], [370, 0.2, 0.2], [294, 0.42, 0.4]],
  love: [[880, 0, 0.12, "sine"], [1175, 0.12, 0.12, "sine"], [1319, 0.24, 0.3, "sine"]],
  eat: [[160, 0, 0.05, "sawtooth", 0.6], [140, 0.12, 0.05, "sawtooth", 0.6], [160, 0.24, 0.05, "sawtooth", 0.6]],
  nod: [[700, 0, 0.06], [900, 0.08, 0.08]],
  shake: [[400, 0, 0.06], [330, 0.09, 0.06]],
  shrug: [[500, 0, 0.08], [500, 0.14, 0.08]],
  think: [[600, 0, 0.1, "triangle"], [750, 0.3, 0.1, "triangle"]],
  angry: [[180, 0, 0.12, "sawtooth", 0.5], [160, 0.14, 0.18, "sawtooth", 0.5]],
  yawn: [[500, 0, 0.3, "sine"], [380, 0.3, 0.5, "sine"]],
  stretch: [[400, 0, 0.3, "sine"], [600, 0.3, 0.25, "sine"]],
  wave: [[800, 0, 0.08], [1000, 0.1, 0.1]],
  level: [[523, 0, 0.08], [659, 0.08, 0.08], [784, 0.16, 0.08], [1047, 0.24, 0.08], [1319, 0.32, 0.35]],
  pop: [[900, 0, 0.04, "triangle"]],
  step: [[120, 0, 0.03, "triangle", 0.3]],
};

export class Chirps {
  private ctx?: AudioContext;
  private master?: GainNode;
  enabled = true;
  volume = 0.12;

  /** Call from a user gesture at least once so the browser lets audio play. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      /* no audio here */
    }
  }

  play(kind: keyof typeof TUNES) {
    const tune = TUNES[kind];
    if (!this.enabled || !tune || !this.ctx || !this.master || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    for (const [freq, at, len, type = "triangle", gain = 1] of tune) {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + at);
      osc.frequency.exponentialRampToValueAtTime(freq * (type === "sine" ? 0.98 : 1.04), now + at + len);
      env.gain.setValueAtTime(0, now + at);
      env.gain.linearRampToValueAtTime(gain, now + at + 0.012);
      env.gain.exponentialRampToValueAtTime(0.001, now + at + len);
      osc.connect(env).connect(this.master);
      osc.start(now + at);
      osc.stop(now + at + len + 0.02);
    }
  }
}

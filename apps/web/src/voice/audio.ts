const workletUrl = new URL("./pcm-capture-worklet.js", import.meta.url);

export function int16ToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToFloat32(b64: string): Float32Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
  return out;
}

/** Captures the microphone as 16 kHz PCM chunks. */
export class MicCapture {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;

  constructor(private onChunk: (pcm: ArrayBuffer, level: number) => void) {}

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule(workletUrl);
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) =>
      this.onChunk(e.data.pcm, e.data.level);
    source.connect(this.node);
  }

  stop() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.node = this.stream = this.ctx = undefined;
  }
}

/** Plays the model's 24 kHz PCM stream gap-free and exposes a live loudness level for lip sync. */
export class PcmPlayer {
  private ctx = new AudioContext({ sampleRate: 24000 });
  private analyser = this.ctx.createAnalyser();
  private levelBuf = new Float32Array(512);
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.analyser.fftSize = 512;
    this.analyser.connect(this.ctx.destination);
  }

  /** Must be called from a user gesture so the browser allows audio. */
  resume() {
    return this.ctx.resume();
  }

  enqueue(base64Pcm: string) {
    const samples = base64ToFloat32(base64Pcm);
    if (!samples.length) return;
    const buffer = this.ctx.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(samples, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser);
    // Small lead time absorbs network jitter between chunks.
    const startAt = Math.max(this.nextStart, this.ctx.currentTime + 0.05);
    src.start(startAt);
    this.nextStart = startAt + buffer.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** Stops everything immediately — used when the user talks over Tekkie. */
  clear() {
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.nextStart = 0;
  }

  get isPlaying() {
    return this.sources.size > 0;
  }

  /** RMS loudness of what is playing right now, 0..~1. */
  level(): number {
    if (!this.isPlaying) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (const v of this.levelBuf) sum += v * v;
    return Math.sqrt(sum / this.levelBuf.length);
  }

  close() {
    this.clear();
    void this.ctx.close();
  }
}

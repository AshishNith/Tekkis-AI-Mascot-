// Runs on the audio thread. Downsamples the mic to 16 kHz mono and posts 16-bit PCM chunks
// (~40 ms each), which is the input format the Gemini Live API expects.
const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 640;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.pos = 0;
    this.acc = 0;
    this.accCount = 0;
    this.out = new Int16Array(CHUNK_SAMPLES);
    this.outLen = 0;
    this.sumSquares = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      // Box-filter average over each output sample's span: cheap anti-aliasing.
      this.acc += channel[i];
      this.accCount++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const s = Math.max(-1, Math.min(1, this.acc / this.accCount));
        this.acc = 0;
        this.accCount = 0;
        this.sumSquares += s * s;
        this.out[this.outLen++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.outLen === CHUNK_SAMPLES) {
          const level = Math.sqrt(this.sumSquares / CHUNK_SAMPLES);
          this.port.postMessage({ pcm: this.out.buffer, level }, [this.out.buffer]);
          this.out = new Int16Array(CHUNK_SAMPLES);
          this.outLen = 0;
          this.sumSquares = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);

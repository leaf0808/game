// 全部音效用 WebAudio 现场合成，不依赖音频文件。
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone({ freq = 440, end = freq, type = 'sine', duration = 0.2, gain = 0.18, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + duration);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'bite':
        this.tone({ freq: 520, end: 180, type: 'triangle', duration: 0.12, gain: 0.2 });
        break;
      case 'shrink':
        this.tone({ freq: 300, end: 900, type: 'sine', duration: 0.55, gain: 0.14 });
        break;
      case 'grow':
        this.tone({ freq: 900, end: 220, type: 'sine', duration: 0.6, gain: 0.14 });
        break;
      case 'smoke':
        this.tone({ freq: 140, end: 90, type: 'sine', duration: 0.25, gain: 0.1 });
        break;
      case 'talk':
        this.tone({ freq: 180, end: 150, type: 'triangle', duration: 0.07, gain: 0.05 });
        break;
      case 'blip':
        this.tone({ freq: 760, end: 900, type: 'sine', duration: 0.06, gain: 0.05 });
        break;
      case 'right':
        [523, 659, 784].forEach((f, i) => this.tone({ freq: f, type: 'triangle', duration: 0.3, gain: 0.1, delay: i * 0.09 }));
        break;
      case 'wrong':
        this.tone({ freq: 220, end: 140, type: 'sawtooth', duration: 0.35, gain: 0.06 });
        break;
      case 'save':
        [392, 523, 659, 784].forEach((f, i) => this.tone({ freq: f, type: 'sine', duration: 0.5, gain: 0.1, delay: i * 0.1 }));
        break;
      case 'spore':
        [880, 1174, 1568].forEach((f, i) => this.tone({ freq: f, type: 'sine', duration: 0.35, gain: 0.08, delay: i * 0.06 }));
        break;
      case 'wing':
        this.tone({ freq: 110, end: 70, type: 'square', duration: 0.1, gain: 0.03 });
        break;
      case 'screech':
        this.tone({ freq: 1500, end: 700, type: 'sawtooth', duration: 0.5, gain: 0.07 });
        break;
      case 'jump':
        this.tone({ freq: 240, end: 620, type: 'sine', duration: 0.18, gain: 0.1 });
        break;
      case 'gate':
        this.tone({ freq: 90, end: 60, type: 'triangle', duration: 1.2, gain: 0.14 });
        break;
      case 'ding':
        this.tone({ freq: 1046, type: 'sine', duration: 1.4, gain: 0.12 });
        this.tone({ freq: 2093, type: 'sine', duration: 0.9, gain: 0.04 });
        break;
      default:
    }
  }
}

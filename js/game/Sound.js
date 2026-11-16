/**
 * Sound.js — a tiny synthesized soundscape (Web Audio, no files).
 * Soft glass chimes on a pentatonic scale, a muffled thump for smudges,
 * and a rising arpeggio when the ring takes you home.
 */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export class Sound {
  constructor() { this.ctx = null; this.enabled = true; }

  _ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      // a little air: feedback delay for a sense of night space
      const delay = this.ctx.createDelay(1); delay.delayTime.value = 0.28;
      const fb = this.ctx.createGain(); fb.gain.value = 0.32;
      const wet = this.ctx.createGain(); wet.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      this.master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  chime(freq, { dur = 0.9, type = 'sine', vol = 0.22, at = 0 } = {}) {
    const c = this._ensure(); if (!c) return;
    const t = c.currentTime + at;
    for (const [mult, v] of [[1, 1], [2.01, 0.25], [3.02, 0.08]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / mult);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  hover(i = 0) { this.chime(SCALE[i % SCALE.length] * 2, { dur: 0.25, type: 'triangle', vol: 0.05 }); }
  select() { this.chime(SCALE[2], { dur: 0.8, vol: 0.16 }); this.chime(SCALE[4], { dur: 0.9, vol: 0.12, at: 0.07 }); }
  back() { this.chime(SCALE[3], { dur: 0.5, vol: 0.1 }); this.chime(SCALE[0], { dur: 0.7, vol: 0.1, at: 0.06 }); }
  collect(n) { this.chime(SCALE[n % SCALE.length] * (n >= SCALE.length ? 2 : 1), { dur: 1.1, vol: 0.2 }); }
  open() { [0, 2, 4, 5, 7].forEach((k, i) => this.chime(SCALE[k], { dur: 1.6, vol: 0.14, at: i * 0.09 })); }
  win() { [0, 2, 4, 7, 4, 7].forEach((k, i) => this.chime(SCALE[k] * (i > 3 ? 2 : 1), { dur: 1.8, vol: 0.16, at: i * 0.12 })); }
  lose() { [4, 3, 1, 0].forEach((k, i) => this.chime(SCALE[k] / 2, { dur: 1.4, vol: 0.12, at: i * 0.18 })); }

  hurt() {
    const c = this._ensure(); if (!c) return;
    const t = c.currentTime, len = Math.floor(c.sampleRate * 0.35);
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
    const g = c.createGain(); g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    this.chime(110, { dur: 0.5, type: 'triangle', vol: 0.12 });
  }
}

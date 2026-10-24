// Everything here is synthesised at runtime — no audio files, no licences.
// Browsers refuse to start an AudioContext before the user touches the page,
// so the whole thing stays dormant until the first keypress.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.gates = new Map();
  }

  attachUnlock() {
    const go = () => {
      this.init();
      this.ctx?.resume();
    };
    addEventListener('keydown', go);
    addEventListener('pointerdown', go);
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 2);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.buildLoops();
    this.ready = true;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  }

  // Physics fires far more events than an ear wants to hear.
  gate(name, ms) {
    const now = performance.now();
    const prev = this.gates.get(name) ?? -1e9;
    if (now - prev < ms) return false;
    this.gates.set(name, now);
    return true;
  }

  noise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = 0.75 + Math.random() * 0.5;
    return s;
  }

  env(gain, t0, attack, decay, peak) {
    const g = gain.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  // ---- loops ---------------------------------------------------------------

  buildLoops() {
    const ctx = this.ctx;

    // Circular saws: a buzzing drone chopped by an LFO.
    const sawOsc = ctx.createOscillator();
    sawOsc.type = 'sawtooth';
    sawOsc.frequency.value = 78;
    const sawBp = ctx.createBiquadFilter();
    sawBp.type = 'bandpass';
    sawBp.frequency.value = 1500;
    sawBp.Q.value = 3;
    const sawChop = ctx.createGain();
    sawChop.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 26;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.45;
    lfo.connect(lfoAmt).connect(sawChop.gain);
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0;
    sawOsc.connect(sawBp).connect(sawChop).connect(sawGain).connect(this.master);
    sawOsc.start();
    lfo.start();
    this.saw = { gain: sawGain };
  }

  setSaw(distance) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const v = distance == null ? 0 : clamp(1 - distance / 9, 0, 1) ** 2 * 0.1;
    this.saw.gain.gain.setTargetAtTime(v, t, 0.12);
  }

  // ---- one-shots -----------------------------------------------------------

  thud(level = 1) {
    if (!this.ready || !this.gate('thud', 55)) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const v = clamp(level, 0.05, 1);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120 + v * 60, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    const og = ctx.createGain();
    this.env(og, t, 0.004, 0.16, 0.5 * v);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.25);

    const n = this.noise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.1);
    const ng = ctx.createGain();
    this.env(ng, t, 0.003, 0.1, 0.35 * v);
    n.connect(lp).connect(ng).connect(this.master);
    n.start(t);
    n.stop(t + 0.2);
  }

  // Dry snapping bone, under the wet sound of the limb leaving.
  crunch() {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const at = t + i * (0.012 + Math.random() * 0.02);
      const n = this.noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2600 - i * 420, at);
      bp.Q.value = 2.5;
      const g = ctx.createGain();
      this.env(g, at, 0.002, 0.045, 0.55);
      n.connect(bp).connect(g).connect(this.master);
      n.start(at);
      n.stop(at + 0.09);
    }
  }

  squelch(size = 1) {
    if (!this.ready || !this.gate('squelch', 40)) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const dur = 0.18 + size * 0.22;

    const n = this.noise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600 + size * 900, t);
    lp.frequency.exponentialRampToValueAtTime(190, t + dur);
    lp.Q.value = 6;
    const g = ctx.createGain();
    this.env(g, t, 0.006, dur, 0.4 * clamp(size, 0.3, 1.6));
    n.connect(lp).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + dur + 0.1);

    const blip = ctx.createOscillator();
    blip.type = 'sine';
    blip.frequency.setValueAtTime(190, t);
    blip.frequency.exponentialRampToValueAtTime(60, t + dur * 0.8);
    const bg = ctx.createGain();
    this.env(bg, t, 0.004, dur * 0.8, 0.22 * size);
    blip.connect(bg).connect(this.master);
    blip.start(t);
    blip.stop(t + dur);
  }

  // Arterial spray: a wet hiss with a pulse in it.
  spray() {
    if (!this.ready || !this.gate('spray', 180)) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const n = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    this.env(g, t, 0.02, 0.4, 0.14);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.5);
  }

  metal() {
    if (!this.ready || !this.gate('metal', 70)) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    for (const f of [2400, 3300, 4700]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * (0.95 + Math.random() * 0.1);
      const g = ctx.createGain();
      this.env(g, t, 0.002, 0.12, 0.1);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.2);
    }
  }

  boom() {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 0.55);
    const og = ctx.createGain();
    this.env(og, t, 0.005, 0.7, 0.9);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.9);

    const n = this.noise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    const ng = ctx.createGain();
    this.env(ng, t, 0.003, 0.6, 0.7);
    n.connect(lp).connect(ng).connect(this.master);
    n.start(t);
    n.stop(t + 0.8);
  }

  whoosh() {
    if (!this.ready || !this.gate('whoosh', 400)) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const n = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.42);
    const g = ctx.createGain();
    this.env(g, t, 0.03, 0.42, 0.3);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.55);
  }

  death() {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    for (const [f, det] of [[150, 1], [150, 1.012]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * det, t);
      o.frequency.exponentialRampToValueAtTime(38 * det, t + 1.1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(220, t + 1.1);
      const g = ctx.createGain();
      this.env(g, t, 0.02, 1.2, 0.25);
      o.connect(lp).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 1.4);
    }
  }

  win() {
    if (!this.ready) return;
    const { ctx } = this;
    const t0 = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const t = t0 + i * 0.11;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      this.env(g, t, 0.01, 0.34, 0.28);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.45);
    });
  }
}

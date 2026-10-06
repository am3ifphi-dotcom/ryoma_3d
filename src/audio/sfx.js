// All sound is synthesised with WebAudio (no audio files).
class SFX {
  constructor() { this.ctx = null; this.master = null; this.noiseBuf = null; this.enabled = true; this._amb = null; this.volume = 0.8; }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { console.warn('audio unavailable', e); return false; }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  /** voice blip for the typewriter (Animal-Crossing style gibberish) */
  blip(mood = 'calm', ch = 'あ') {
    if (!this.enabled || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const base = mood === 'up' ? 215 : mood === 'low' ? 150 : 180;
    const code = ch.charCodeAt(0);
    const semis = ((code * 7) % 9) - 4 + (Math.random() - 0.5) * 1.5;
    const f = base * Math.pow(2, semis / 12);
    const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.setValueAtTime(f, t); o1.frequency.exponentialRampToValueAtTime(f * 0.92, t + 0.07);
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(f * 2.01, t);
    const g1 = c.createGain(); g1.gain.setValueAtTime(0.0001, t); g1.gain.exponentialRampToValueAtTime(0.16, t + 0.008); g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    const g2 = c.createGain(); g2.gain.value = 0.18;
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1800; flt.Q.value = 0.8;
    o2.connect(g2).connect(flt); o1.connect(flt); flt.connect(g1).connect(this.master);
    o1.start(t); o2.start(t); o1.stop(t + 0.09); o2.stop(t + 0.09);
  }

  footstep(run = false) {
    if (!this.enabled || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 350 + Math.random() * 500; bp.Q.value = 0.9;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const g = c.createGain();
    const v = run ? 0.42 : 0.26;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11 + Math.random() * 0.04);
    // subtle heel thud
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90 + Math.random() * 30, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v * 0.5, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(bp).connect(lp).connect(g).connect(this.master);
    o.connect(og).connect(this.master);
    src.start(t); src.stop(t + 0.2); o.start(t); o.stop(t + 0.1);
  }

  /** 学校のチャイム (Westminster quarters) */
  chime(volume = 0.5) {
    if (!this.enabled || !this.ensure()) return;
    const c = this.ctx;
    const E5 = 659.25, C5 = 523.25, D5 = 587.33, G4 = 392.0;
    const seq = [E5, C5, D5, G4, null, G4, D5, E5, C5];
    const step = 0.72;
    seq.forEach((f, i) => {
      if (!f) return;
      const t = c.currentTime + 0.3 + i * step;
      for (const [mult, amp, dur] of [[1, 1.0, 2.6], [2.0, 0.28, 1.6], [2.98, 0.12, 1.0], [4.1, 0.05, 0.6]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume * 0.35 * amp, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
      }
    });
  }

  ui(kind = 'click') {
    if (!this.enabled || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const notes = kind === 'open' ? [660, 880] : kind === 'close' ? [660, 440] : kind === 'select' ? [880, 1320] : [990];
    notes.forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); const tt = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.12, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12);
      o.connect(g).connect(this.master); o.start(tt); o.stop(tt + 0.15);
    });
  }

  /** 室外機の唸り + 教室の空気 */
  startAmbience() {
    if (!this.ensure() || this._amb) return;
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 0.5;
    const g = c.createGain(); g.gain.value = 0.045;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.23; const lg = c.createGain(); lg.gain.value = 0.012; lfo.connect(lg).connect(g.gain);
    const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = 100; const hg = c.createGain(); hg.gain.value = 0.012;
    const hum2 = c.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 50.3; const hg2 = c.createGain(); hg2.gain.value = 0.01;
    src.connect(lp).connect(g).connect(this.master);
    hum.connect(hg).connect(this.master); hum2.connect(hg2).connect(this.master);
    src.start(); lfo.start(); hum.start(); hum2.start();
    this._amb = { src, lfo, hum, hum2 };
  }
}

export const sfx = new SFX();

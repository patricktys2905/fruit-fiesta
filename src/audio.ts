/** Tiny synthesised sound effects: no audio files to download, works offline. */
class Sfx {
  private ctx: AudioContext | null = null;
  muted = localStorage.getItem('ff-muted') === '1';

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem('ff-muted', m ? '1' : '0');
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slideTo?: number, delay = 0): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  select() { this.tone(760, 0.05, 'sine', 0.08); }
  swap() { this.tone(420, 0.08, 'sine', 0.1, 640); }
  invalid() { this.tone(240, 0.1, 'square', 0.05, 170); this.tone(200, 0.12, 'square', 0.04, 150, 0.08); }
  pop(chain: number) {
    const base = 480 * Math.pow(1.122, Math.min(chain - 1, 10));
    this.tone(base, 0.14, 'triangle', 0.22, base * 1.7);
    this.tone(base * 2, 0.06, 'sine', 0.08);
  }
  combo() { [0, 4, 7, 12].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.12, 'triangle', 0.12, undefined, i * 0.05)); }
  shuffle() { for (let i = 0; i < 6; i++) this.tone(300 + i * 60, 0.06, 'sine', 0.07, undefined, i * 0.04); }
  win() { [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), 0.25, 'triangle', 0.16, undefined, i * 0.09)); }
  lose() { [7, 4, 0, -5].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.3, 'sine', 0.14, undefined, i * 0.16)); }
  /** Noise burst (splashes, explosions). */
  private noise(dur: number, vol: number, freq: number, delay = 0): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(freq, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(80, freq / 6), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  create() { [0, 7, 12].forEach((s, i) => this.tone(880 * Math.pow(2, s / 12), 0.12, 'sine', 0.12, undefined, i * 0.045)); }
  jet() { this.noise(0.35, 0.25, 4000); this.tone(300, 0.3, 'sawtooth', 0.05, 1200); }
  boom() { this.noise(0.6, 0.45, 1800); this.tone(120, 0.45, 'sine', 0.35, 40); }
  zap() { for (let i = 0; i < 5; i++) this.tone(900 + i * 220, 0.09, 'square', 0.04, 1800 + i * 300, i * 0.05); }
  buzz() { this.tone(210, 0.5, 'sawtooth', 0.05, 260); this.tone(215, 0.5, 'sawtooth', 0.04, 250); }
  splash() { this.noise(0.12, 0.12, 2500); }
  star(n: number) { this.tone(880 * Math.pow(1.26, n), 0.2, 'triangle', 0.15, 880 * Math.pow(1.26, n) * 1.5); }
}

export const sfx = new Sfx();

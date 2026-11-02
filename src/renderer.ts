import { Board, Cell, FallMove, GRAVITY_VEC, MUSH, Spawn, Special, Tile, cellKey } from './core/board';
import { ClearStep, Cleared, CollectStep, RipenStep, COCONUT_POINTS, TRAIT_NAMES } from './core/engine';
import { FRUITS, makeBeeSprite, makeFruitSprite, makeSandSprite, makeMushSprite, tintSprite } from './fruitArt';
import { Tweener, easeOutQuad, easeInBack, easeOutBack, fallEase, wait } from './tween';
import { sfx } from './audio';

interface Vis {
  x: number; // column, in cell units
  y: number; // row, in cell units
  scale: number;
  alpha: number;
  kind: number;
  special?: Special;
  unripe?: number;
  golden?: boolean;
  ice?: number;
}

type PType = 'drop' | 'seed' | 'spark' | 'bubble' | 'wedge' | 'leaf' | 'glint';
interface Particle {
  type: PType;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; color: string; size: number;
  rot: number; vr: number; g: number;
}

interface FloatText {
  text: string; x: number; y: number; vy: number;
  life: number; max: number; color: string; size: number; big: boolean;
}

type Fx =
  | { kind: 'beam'; t: number; dur: number; orient: 'row' | 'col'; index: number; ox: number; oy: number; color: string }
  | { kind: 'ring'; t: number; dur: number; x: number; y: number; r: number; color: string; width: number }
  | { kind: 'rays'; t: number; dur: number; x: number; y: number; targets: { x: number; y: number }[] }
  | { kind: 'bee'; t: number; dur: number; x0: number; y0: number; x1: number; y1: number; carry?: Special }
  | { kind: 'flash'; t: number; dur: number; color: string }
  | { kind: 'splat'; t: number; dur: number; x: number; y: number; r: number; color: string; seed: number };

const SPECIAL_NAMES: Record<Special, string> = {
  jetH: 'Juice Jet!',
  jetV: 'Juice Jet!',
  bomb: 'Fruit Burst!',
  rainbow: 'Rainbow Smoothie!',
  bee: 'Busy Bee!',
};

const RAINBOW_COLORS = ['#ff4b6e', '#ff9a1f', '#ffe03a', '#62d94a', '#3d9bff', '#a456ff'];

const colorOf = (kind: number) => (kind >= 0 ? FRUITS[kind].color : RAINBOW_COLORS[Math.floor(Math.random() * 6)]);

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  tile = 48;
  private ox = 0;
  private oy = 0;
  private sprites = new Map<number, HTMLCanvasElement>();
  private beeSprite: HTMLCanvasElement | null = null;
  private sandSprites: HTMLCanvasElement[] = [];
  /** Sand as currently shown (lags the board while animations replay). */
  private sand: number[][] = [];
  /** Tide as shown (rows, animated) and moves until it next rises. */
  private tideShown = 0;
  private tideNext = 0;
  private tideOn = false;
  /** Grape juice puddles as shown. */
  private puddle: boolean[][] = [];
  private vis = new Map<number, Vis>();
  readonly tweens = new Tweener();
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private fx: Fx[] = [];
  private board: Board | null = null;
  private shake = 0;
  private last = performance.now();
  selected: Cell | null = null;
  hint: [Cell, Cell] | null = null;
  onFrame?: (now: number) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    requestAnimationFrame(this.loop);
  }

  setBoard(board: Board): Promise<void> {
    this.board = board;
    this.vis.clear();
    this.particles = [];
    this.texts = [];
    this.fx = [];
    this.tweens.clear();
    this.selected = null;
    this.hint = null;
    this.sand = board.sand.map((row) => [...row]);
    this.puddle = board.puddle.map((row) => [...row]);
    this.tideOn = board.tideEvery > 0;
    this.tideShown = board.tide;
    this.tideNext = board.tideEvery - board.tideCounter;
    this.resize();
    const intro: Promise<void>[] = [];
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const t = board.grid[r][c];
        if (!t) continue;
        const v: Vis = { x: c, y: r - board.rows - 1, scale: 1, alpha: 1, kind: t.kind, special: t.special, unripe: t.unripe, golden: t.golden, ice: t.ice };
        this.vis.set(t.id, v);
        intro.push(this.tweens.to(v, { y: r }, 420 + r * 25, fallEase, (board.rows - r) * 30 + c * 12));
      }
    }
    return Promise.all(intro).then(() => undefined);
  }

  /** Rebuild sprites (call after new art loads). */
  refreshSprites(): void {
    this.sprites.clear();
    this.tinted.clear();
    this.beeSprite = null;
    this.sandSprites = [];
  }

  private sandSprite(layers: number): HTMLCanvasElement {
    if (!this.sandSprites[layers]) this.sandSprites[layers] = makeSandSprite(layers, (this.tile - 3) * this.dpr);
    return this.sandSprites[layers];
  }

  /** Coconuts reaching the bottom roll off the board and are collected. */
  async playCollect(step: CollectStep): Promise<void> {
    sfx.combo();
    await Promise.all(
      step.items.map(async (it) => {
        const v = this.vis.get(it.tile.id);
        if (!v) return;
        const x = this.px(it.c), y = this.py(it.r);
        this.sparkle(x, y, '#fff3a0', 12);
        this.fx.push({ kind: 'ring', t: 0, dur: 500, x, y, r: this.tile, color: '#ffe680', width: this.tile * 0.12 });
        this.texts.push({ text: `+${COCONUT_POINTS}`, x, y: y - this.tile * 0.5, vy: -0.04, life: 0, max: 900, color: '#fff36b', size: this.tile * 0.42, big: false });
        await this.tweens.to(v, { scale: 1.35 }, 140, easeOutQuad);
        await this.tweens.to(v, { y: v.y + 1.4, scale: 0.6, alpha: 0 }, 320, easeInBack);
        this.vis.delete(it.tile.id);
      }),
    );
  }

  resize(): void {
    const parent = this.canvas.parentElement!;
    // Hidden screen (display:none) reports 0 size; keep the last good layout.
    if (parent.clientWidth < 50 || parent.clientHeight < 50) return;
    this.w = parent.clientWidth;
    this.h = parent.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    if (!this.board) return;
    const pad = 10;
    this.tile = Math.floor(Math.min((this.w - pad * 2) / this.board.cols, (this.h - pad * 2) / this.board.rows, 84));
    this.ox = Math.round((this.w - this.tile * this.board.cols) / 2);
    // Sit near the top (under the HUD); spare space below is for the future boosters / family bar.
    this.oy = Math.round(Math.min((this.h - this.tile * this.board.rows) / 2, 22));
    this.refreshSprites();
  }

  private sprite(kind: number): HTMLCanvasElement {
    let s = this.sprites.get(kind);
    if (!s) {
      const px = this.tile * this.dpr * 0.92;
      s = kind === MUSH ? makeMushSprite(px) : makeFruitSprite(kind, px);
      this.sprites.set(kind, s);
    }
    return s;
  }

  private tinted = new Map<string, HTMLCanvasElement>();
  private variant(kind: number, mode: 'unripe' | 'golden'): HTMLCanvasElement {
    const key = `${kind}:${mode}:${this.tile}`;
    let s = this.tinted.get(key);
    if (!s) {
      s = tintSprite(this.sprite(kind), mode);
      this.tinted.set(key, s);
    }
    return s;
  }

  /** The tide moves: animate the water level. */
  async playTide(step: { tide: number; pushed: boolean; change: number; nextRise: number }): Promise<void> {
    this.tideNext = step.nextRise;
    const y = this.oy + (this.board!.rows - step.tide) * this.tile;
    if (step.pushed) this.texts.push({ text: 'Tide pushed back!', x: this.w / 2, y: y - this.tile * 0.6, vy: -0.03, life: 0, max: 1100, color: '#bff4ff', size: this.tile * 0.4, big: false });
    if (step.change > 0) {
      this.texts.push({ text: '🌊 The tide rises!', x: this.w / 2, y: y - this.tile * 0.6, vy: -0.03, life: 0, max: 1100, color: '#bff4ff', size: this.tile * 0.4, big: false });
      sfx.splash();
    }
    if (step.change !== 0) {
      for (let i = 0; i < 14; i++) this.emit('bubble', this.ox + Math.random() * this.tile * this.board!.cols, y, '#d8f6ff', 1, { speed: 0.05, size: 5, g: -0.0003, life: 900, up: 0.05 });
      await this.tweens.to(this as unknown as { tideShown: number }, { tideShown: step.tide }, 520, easeOutQuad);
    }
  }

  /** Island Tilt: the board lurches toward the new gravity. */
  async playTilt(g: 'down' | 'up' | 'left' | 'right'): Promise<void> {
    const deg = g === 'left' ? -7 : g === 'right' ? 7 : 0;
    const dy = g === 'up' ? -10 : g === 'down' ? 10 : 0;
    this.canvas.style.transition = 'transform 0.18s ease-out';
    this.canvas.style.transform = `rotate(${deg}deg) translateY(${dy}px)`;
    sfx.buzz();
    this.banner({ down: '⬇ Tilt down!', up: '⬆ Tilt up!', left: '⬅ Tilt left!', right: '➡ Tilt right!' }[g], '#c6ffb0');
    await wait(200);
    this.canvas.style.transition = 'transform 0.35s cubic-bezier(0.2, 1.6, 0.4, 1)';
    this.canvas.style.transform = '';
    await wait(120);
  }

  private drawWater(now: number, board: Board): void {
    if (!this.tideOn) return;
    const ctx = this.ctx, T = this.tile;
    const bw = T * board.cols;
    const top = this.oy + (board.rows - this.tideShown) * T;
    const bottom = this.oy + board.rows * T + 6;
    if (this.tideShown > 0.02) {
      ctx.save();
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, 'rgba(60,200,240,0.42)');
      g.addColorStop(1, 'rgba(20,110,190,0.55)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(this.ox - 6, bottom);
      for (let x = 0; x <= bw + 12; x += 6) ctx.lineTo(this.ox - 6 + x, top + Math.sin(now / 380 + x / 26) * T * 0.06);
      ctx.lineTo(this.ox + bw + 6, bottom);
      ctx.closePath();
      ctx.fill();
      // foam line
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(2, T * 0.05);
      ctx.beginPath();
      for (let x = 0; x <= bw + 12; x += 6) {
        const yy = top + Math.sin(now / 380 + x / 26) * T * 0.06;
        if (x === 0) ctx.moveTo(this.ox - 6 + x, yy);
        else ctx.lineTo(this.ox - 6 + x, yy);
      }
      ctx.stroke();
      // drifting bubbles
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 6; i++) {
        const bx = this.ox + ((i * 97 + now / 30) % bw);
        const by = bottom - ((now / 18 + i * 53) % Math.max(1, bottom - top));
        ctx.beginPath();
        ctx.arc(bx, by, T * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // flood line (the level is lost if the water reaches it)
    // and a tag saying when the tide rises next
    const tagY = top - T * 0.18;
    ctx.save();
    ctx.font = `900 ${Math.round(T * 0.28)}px "Baloo 2", "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const label = `🌊 rises in ${this.tideNext}`;
    const w = ctx.measureText(label).width + T * 0.3;
    const x1 = this.ox + bw + 4;
    ctx.fillStyle = 'rgba(20,110,190,0.85)';
    roundRect(ctx, x1 - w, tagY - T * 0.2, w, T * 0.4, T * 0.2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x1 - T * 0.15, tagY + 1);
    ctx.restore();
  }

  /** End-of-move ripening: countdowns tick, ripe fruit turns golden, old golden fruit spoils. */
  async playRipen(step: RipenStep): Promise<void> {
    for (const t of step.ticked) {
      const v = this.vis.get(t.id);
      if (v) v.unripe = t.unripe;
    }
    const anims: Promise<void>[] = [];
    for (const t of step.ripened) {
      const v = this.vis.get(t.id);
      if (!v) continue;
      v.unripe = undefined;
      v.golden = true;
      const x = this.px(v.x), y = this.py(v.y);
      this.sparkle(x, y, '#ffe14d', 9);
      this.fx.push({ kind: 'ring', t: 0, dur: 420, x, y, r: this.tile * 0.8, color: '#ffd84a', width: this.tile * 0.1 });
      anims.push(this.tweens.to(v, { scale: 1.3 }, 120, easeOutQuad).then(() => this.tweens.to(v, { scale: 1 }, 220, easeOutBack)));
    }
    for (const t of step.spoiled) {
      const v = this.vis.get(t.id);
      if (!v) continue;
      v.golden = false;
      v.special = undefined;
      v.kind = MUSH;
      const x = this.px(v.x), y = this.py(v.y);
      this.fx.push({ kind: 'splat', t: 0, dur: 900, x, y, r: this.tile * 0.45, color: '#7a6236', seed: Math.random() * 100 });
      this.emit('drop', x, y, '#8a7040', 6, { speed: 0.15 });
      anims.push(this.tweens.to(v, { scale: 0.75 }, 120).then(() => this.tweens.to(v, { scale: 1 }, 260, easeOutBack)));
    }
    if (step.ripened.length) sfx.create();
    if (step.spoiled.length) sfx.invalid();
    await Promise.all(anims);
  }

  private bee(): HTMLCanvasElement {
    if (!this.beeSprite) this.beeSprite = makeBeeSprite(this.tile * this.dpr * 0.7);
    return this.beeSprite;
  }

  cellAt(clientX: number, clientY: number): Cell | null {
    if (!this.board) return null;
    const rect = this.canvas.getBoundingClientRect();
    const c = Math.floor((clientX - rect.left - this.ox) / this.tile);
    const r = Math.floor((clientY - rect.top - this.oy) / this.tile);
    return this.board.inBounds({ r, c }) ? { r, c } : null;
  }

  cellCenterClient(cell: Cell): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + this.px(cell.c), y: rect.top + this.py(cell.r) };
  }

  private px(col: number) { return this.ox + (col + 0.5) * this.tile; }
  private py(row: number) { return this.oy + (row + 0.5) * this.tile; }

  // ---------- basic animations ----------

  moveTile(tile: Tile, r: number, c: number, dur = 150): Promise<void> {
    const v = this.vis.get(tile.id);
    if (!v) return Promise.resolve();
    return this.tweens.to(v, { x: c, y: r }, dur, easeOutQuad);
  }

  async dropTiles(falls: FallMove[], spawns: Spawn[]): Promise<void> {
    const anims: Promise<void>[] = [];
    const dur = (dist: number) => 150 + 85 * Math.sqrt(Math.max(dist, 0.1));
    for (const f of falls) {
      const v = this.vis.get(f.tile.id);
      if (v) anims.push(this.tweens.to(v, { x: f.toC, y: f.toR }, dur(Math.abs(f.toR - v.y) + Math.abs(f.toC - v.x)), fallEase));
    }
    for (const s of spawns) {
      const v: Vis = { x: s.fromC, y: s.fromR, scale: 1, alpha: 1, kind: s.tile.kind, special: s.tile.special, unripe: s.unripe };
      this.vis.set(s.tile.id, v);
      anims.push(this.tweens.to(v, { x: s.c, y: s.r }, dur(Math.abs(s.r - s.fromR) + Math.abs(s.c - s.fromC)), fallEase));
    }
    await Promise.all(anims);
  }

  /** Re-sync all tiles to the board after a shuffle, with a swirl. */
  async shuffleTo(board: Board): Promise<void> {
    const anims: Promise<void>[] = [];
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const t = board.grid[r][c];
        const v = t && this.vis.get(t.id);
        if (!v) continue;
        anims.push(this.tweens.to(v, { x: c, y: r }, 420, easeOutBack, (r + c) * 12));
      }
    }
    await Promise.all(anims);
  }

  wobble(tile: Tile): Promise<void> {
    const v = this.vis.get(tile.id);
    if (!v) return Promise.resolve();
    return this.tweens.to(v, { scale: 0.85 }, 70).then(() => this.tweens.to(v, { scale: 1 }, 160, easeOutBack));
  }

  // ---------- a full clear step: blasts, new specials, popping fruit ----------

  async playClear(step: ClearStep): Promise<void> {
    const T = this.tile;
    const delays = new Map<number, number>();
    const D = (c: Cell) => delays.get(cellKey(c.r, c.c)) ?? 0;
    const setD = (c: Cell, d: number) => {
      const k = cellKey(c.r, c.c);
      const cur = delays.get(k);
      if (cur === undefined || d < cur) delays.set(k, d);
    };
    const byCell = new Map<number, Cleared>();
    for (const cl of step.cleared) byCell.set(cellKey(cl.r, cl.c), cl);
    const dist = (a: Cell, b: Cell) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
    const timers: Promise<void>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(wait(ms).then(fn));

    for (const b of step.blasts) {
      const od = D(b.origin);
      const ox = this.px(b.origin.c), oy = this.py(b.origin.r);
      const originKind = byCell.get(cellKey(b.origin.r, b.origin.c))?.kind ?? -1;
      switch (b.type) {
        case 'row':
        case 'col': {
          const index = b.type === 'row' ? b.cells[0].r : b.cells[0].c;
          this.fx.push({ kind: 'beam', t: -od, dur: 460, orient: b.type, index, ox, oy, color: colorOf(originKind) });
          later(od, () => sfx.jet());
          for (const c of b.cells) setD(c, od + 40 + dist(c, b.origin) * 28);
          break;
        }
        case 'bomb': {
          const R = (b.radius ?? 2) + 0.5;
          this.fx.push({ kind: 'ring', t: -od, dur: 450, x: ox, y: oy, r: R * T, color: '#fff3a0', width: T * 0.35 });
          this.fx.push({ kind: 'ring', t: -od - 80, dur: 500, x: ox, y: oy, r: R * T * 1.15, color: colorOf(originKind), width: T * 0.2 });
          this.fx.push({ kind: 'flash', t: -od, dur: 220, color: 'rgba(255,250,210,0.5)' });
          later(od, () => { sfx.boom(); this.shake = Math.max(this.shake, 6 + (b.radius ?? 2) * 2); });
          for (const c of b.cells) setD(c, od + 50 + dist(c, b.origin) * 45);
          break;
        }
        case 'rainbow': {
          const targets = b.cells.map((c) => ({ x: this.px(c.c), y: this.py(c.r) }));
          this.fx.push({ kind: 'rays', t: -od, dur: b.convertTo ? 900 : 700, x: ox, y: oy, targets });
          later(od, () => sfx.zap());
          if (b.convertTo) {
            later(od + 220, () => {
              for (const c of b.cells) {
                const cl = byCell.get(cellKey(c.r, c.c));
                const v = cl && this.vis.get(cl.tile.id);
                if (v && !v.special) {
                  v.special = cl.tile.special ?? b.convertTo;
                  this.sparkle(this.px(c.c), this.py(c.r), '#fff', 5);
                }
              }
              sfx.create();
            });
          }
          b.cells.forEach((c, i) => setD(c, od + (b.convertTo ? 520 : 280) + i * 22));
          break;
        }
        case 'bee': {
          const t = b.target!;
          const carry = step.blasts.length > 1 ? this.carriedBy(step, b) : undefined;
          this.fx.push({ kind: 'bee', t: -od, dur: 560, x0: ox, y0: oy, x1: this.px(t.c), y1: this.py(t.r), carry });
          later(od, () => sfx.buzz());
          setD(t, od + 560);
          break;
        }
        case 'all': {
          this.fx.push({ kind: 'flash', t: -od, dur: 600, color: 'rgba(255,255,255,0.75)' });
          later(od, () => { sfx.boom(); sfx.zap(); this.shake = 14; });
          for (const c of b.cells) setD(c, od + 120 + dist(c, b.origin) * 22);
          break;
        }
      }
    }

    const anims: Promise<void>[] = [...timers];

    // New specials: matched fruit slide into the special's cell.
    const merging = new Set<number>();
    for (const cr of step.created) {
      for (const f of cr.from) {
        const cl = byCell.get(cellKey(f.r, f.c));
        if (!cl) continue;
        merging.add(cl.tile.id);
        const v = this.vis.get(cl.tile.id);
        if (!v) continue;
        anims.push(
          this.tweens.to(v, { x: cr.c, y: cr.r, scale: 0.55 }, 170, easeInBack).then(() => {
            this.vis.delete(cl.tile.id);
          }),
        );
      }
      anims.push(
        wait(170).then(async () => {
          const v = this.vis.get(cr.tile.id);
          if (!v) return;
          v.special = cr.special;
          if (cr.special === 'rainbow') v.kind = -1;
          const x = this.px(cr.c), y = this.py(cr.r);
          this.fx.push({ kind: 'ring', t: 0, dur: 420, x, y, r: T * 0.9, color: '#fff7b0', width: T * 0.12 });
          this.sparkle(x, y, '#fff6a0', 10);
          this.texts.push({ text: SPECIAL_NAMES[cr.special], x, y: y - T * 0.6, vy: -0.03, life: 0, max: 1100, color: '#fff36b', size: T * 0.38, big: false });
          sfx.create();
          await this.tweens.to(v, { scale: 1.4 }, 110, easeOutQuad);
          await this.tweens.to(v, { scale: 1 }, 220, easeOutBack);
        }),
      );
    }

    // Everything else pops, each fruit with its own effect.
    let splashSounds = 0;
    for (const cl of step.cleared) {
      if (merging.has(cl.tile.id)) continue;
      const d = D(cl);
      anims.push(
        wait(d).then(async () => {
          const v = this.vis.get(cl.tile.id);
          if (!v) return;
          const x = this.px(v.x), y = this.py(v.y);
          this.fruitPop(v.kind, x, y, step.chain);
          if (d > 0 && splashSounds++ % 3 === 0) sfx.splash();
          await this.tweens.to(v, { scale: 1.22 }, 60, easeOutQuad);
          await this.tweens.to(v, { scale: 0, alpha: 0 }, 150, easeInBack);
          this.vis.delete(cl.tile.id);
        }),
      );
    }
    // Ice cracks (the fruit stays put).
    for (const ic of step.ice) {
      anims.push(
        wait(D(ic) + 40).then(() => {
          const v = this.vis.get(ic.tile.id);
          if (v) v.ice = ic.left || undefined;
          const x = this.px(ic.c), y = this.py(ic.r);
          this.emit('wedge', x, y, '#dff6ff', 6, { speed: 0.2, size: 6, life: 600 });
          this.emit('glint', x, y, '#ffffff', 3, { speed: 0.1, size: 6, g: 0, life: 400, up: 0 });
          this.fx.push({ kind: 'ring', t: 0, dur: 320, x, y, r: T * 0.6, color: '#c9f0ff', width: T * 0.08 });
          sfx.select();
        }),
      );
    }
    // Grape puddles get used up, and new ones appear where grapes were matched.
    for (const c of step.puddlesUsed) anims.push(wait(D(c)).then(() => { if (this.puddle[c.r]) this.puddle[c.r][c.c] = false; this.texts.push({ text: '+150', x: this.px(c.c), y: this.py(c.r) + T * 0.3, vy: -0.03, life: 0, max: 700, color: '#e3b8ff', size: T * 0.3, big: false }); }));
    if (step.puddlesAdded.length) later(260, () => { for (const c of step.puddlesAdded) if (this.puddle[c.r]) this.puddle[c.r][c.c] = true; });
    // Fruit Personalities: a little label where each one fires.
    for (const tr of step.traits) {
      const x = this.px(tr.at.c), y = this.py(tr.at.r);
      later(120, () => {
        this.texts.push({ text: TRAIT_NAMES[tr.kind], x, y: y - T * 0.55, vy: -0.035, life: 0, max: 900, color: colorOf(tr.kind), size: T * 0.34, big: false });
        for (const c of tr.cells) this.sparkle(this.px(c.c), this.py(c.r), colorOf(tr.kind), 4);
      });
    }
    for (const t of step.grown) {
      later(200, () => {
        const v = this.vis.get(t.id);
        if (!v) return;
        v.unripe = t.unripe;
        v.golden = t.golden;
        this.sparkle(this.px(v.x), this.py(v.y), '#7bd13b', 5);
      });
    }

    // Sand washes away as the fruit on it pops.
    for (const cell of step.sand) {
      const d = D(cell) + 60;
      anims.push(
        wait(d).then(() => {
          const row = this.sand[cell.r];
          if (row && row[cell.c] > 0) row[cell.c]--;
          const x = this.px(cell.c), y = this.py(cell.r);
          this.emit('drop', x, y, '#e8c27a', 7, { speed: 0.18, size: 3.5 });
          this.emit('glint', x, y, '#fff4d0', 2, { speed: 0.08, size: 5, g: 0, life: 400, up: 0 });
        }),
      );
    }
    if (step.sand.length) later(80, () => sfx.splash());
    if (step.chain >= 3) this.shake = Math.max(this.shake, Math.min(10, 2 + step.chain * 1.5));
    await Promise.all(anims);
  }

  private carriedBy(step: ClearStep, beeBlast: ClearStep['blasts'][number]): Special | undefined {
    if (!step.combo) return undefined;
    const t = beeBlast.target!;
    const next = step.blasts.find((x) => x !== beeBlast && x.origin.r === t.r && x.origin.c === t.c);
    if (!next) return undefined;
    return next.type === 'row' ? 'jetH' : next.type === 'col' ? 'jetV' : next.type === 'bomb' ? 'bomb' : undefined;
  }

  // ---------- particles & fruit effects ----------

  private emit(type: PType, x: number, y: number, color: string, n: number, opts: Partial<{ speed: number; size: number; g: number; life: number; up: number }> = {}): void {
    const k = this.tile / 48;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 0.2) * (0.4 + Math.random() * 0.8) * k;
      this.particles.push({
        type, x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opts.up ?? 0.1) * k,
        life: 0,
        max: (opts.life ?? 650) * (0.7 + Math.random() * 0.6),
        color,
        size: (opts.size ?? 4) * (0.6 + Math.random() * 0.8) * k,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.02,
        g: (opts.g ?? 0.0007) * k,
      });
    }
  }

  private sparkle(x: number, y: number, color: string, n: number): void {
    this.emit('spark', x, y, color, n, { speed: 0.16, size: 6, g: 0, life: 600, up: 0 });
  }

  /** Each fruit bursts in its own way. */
  private fruitPop(kind: number, x: number, y: number, chain: number): void {
    const T = this.tile;
    const extra = Math.min(chain, 4);
    const color = colorOf(kind);
    this.fx.push({ kind: 'splat', t: 0, dur: 900, x, y, r: T * 0.42, color, seed: Math.random() * 100 });
    switch (kind) {
      case 0: // strawberry: red juice, flying seeds and a leaf
        this.emit('drop', x, y, '#ff3355', 6 + extra, { speed: 0.24 });
        this.emit('seed', x, y, '#ffe680', 6, { speed: 0.2, size: 3 });
        this.emit('leaf', x, y - T * 0.2, '#3fae3a', 1, { speed: 0.12, size: 9, g: 0.0004, life: 900 });
        break;
      case 1: // orange: spinning segments and mist
        this.emit('wedge', x, y, '#ffa32a', 4, { speed: 0.2, size: 8, life: 800 });
        this.emit('drop', x, y, '#ff8a00', 5 + extra, { speed: 0.26 });
        break;
      case 2: // lemon: sour sparkles and a zing ring
        this.emit('spark', x, y, '#fff6a0', 7, { speed: 0.22, size: 7, g: 0, life: 550, up: 0 });
        this.emit('drop', x, y, '#ffd83a', 4 + extra, { speed: 0.22 });
        this.fx.push({ kind: 'ring', t: 0, dur: 300, x, y, r: T * 0.75, color: '#fff38a', width: T * 0.08 });
        break;
      case 3: // kiwi: green juice and black seeds
        this.emit('drop', x, y, '#7bd13b', 6 + extra, { speed: 0.24 });
        this.emit('seed', x, y, '#1d1a10', 8, { speed: 0.22, size: 3 });
        break;
      case 4: // grape: bubbles float up and pop
        this.emit('bubble', x, y, '#b77bff', 6 + extra, { speed: 0.08, size: 6, g: -0.0003, life: 900, up: 0.05 });
        this.emit('drop', x, y, '#8a3ef0', 3, { speed: 0.2 });
        break;
      case 5: // blueberry: ripples
        this.fx.push({ kind: 'ring', t: 0, dur: 450, x, y, r: T * 0.7, color: '#7aa8ff', width: T * 0.1 });
        this.fx.push({ kind: 'ring', t: -120, dur: 450, x, y, r: T * 0.5, color: '#b8d0ff', width: T * 0.07 });
        this.emit('drop', x, y, '#3d7bff', 6 + extra, { speed: 0.24 });
        break;
      default: // smoothie: rainbow everywhere
        RAINBOW_COLORS.forEach((c) => this.emit('drop', x, y, c, 3, { speed: 0.3 }));
        this.sparkle(x, y, '#fff', 8);
    }
    if (chain >= 3) this.emit('glint', x, y, '#ffffff', 3, { speed: 0.1, size: 5, g: 0, life: 400, up: 0 });
  }

  popText(text: string, cell: Cell, color = '#fff'): void {
    this.texts.push({ text, x: this.px(cell.c), y: this.py(cell.r), vy: -0.04, life: 0, max: 800, color, size: this.tile * 0.42, big: false });
  }

  banner(text: string, color = '#fff36b'): void {
    this.texts.push({ text, x: this.w / 2, y: this.h * 0.4, vy: -0.015, life: 0, max: 1100, color, size: Math.min(this.w / 8, 52), big: true });
  }

  // ---------- render loop ----------

  private loop = (now: number) => {
    const dt = Math.min(50, now - this.last);
    this.last = now;
    this.tweens.update(dt);
    this.onFrame?.(now);
    this.update(dt);
    this.draw(now);
    requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.vx *= 0.995;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const t of this.texts) {
      t.life += dt;
      t.y += t.vy * dt;
    }
    this.texts = this.texts.filter((t) => t.life < t.max);
    for (const f of this.fx) {
      f.t += dt;
      if (f.kind === 'bee' && f.t > 0 && f.t < f.dur && Math.random() < 0.6) {
        const p = this.beePos(f);
        this.emit('spark', p.x, p.y, '#fff3a0', 1, { speed: 0.03, size: 4, g: 0, life: 400, up: 0 });
      }
    }
    this.fx = this.fx.filter((f) => f.t < f.dur);
    this.shake = Math.max(0, this.shake - dt * 0.03);
  }

  private beePos(f: Extract<Fx, { kind: 'bee' }>) {
    const p = Math.min(1, Math.max(0, f.t / f.dur));
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const mx = (f.x0 + f.x1) / 2, my = Math.min(f.y0, f.y1) - this.tile * 2.2;
    const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * mx + e * e * f.x1;
    const y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * my + e * e * f.y1;
    return { x, y, dir: f.x1 >= f.x0 ? 1 : -1 };
  }

  private draw(now: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const board = this.board;
    if (!board || this.tile <= 4 || !this.canvas.offsetParent) return;

    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const T = this.tile;
    const bw = T * board.cols, bh = T * board.rows;

    // board tray: follows the board's shape (holes show the background)
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    for (let r = 0; r < board.rows; r++)
      for (let c = 0; c < board.cols; c++)
        if (board.mask[r][c]) {
          roundRect(ctx, this.ox + c * T - 6, this.oy + r * T - 6, T + 12, T + 12, 14);
          ctx.fill();
        }
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        if (!board.mask[r][c]) continue;
        const x = this.ox + c * T + 1.5, y = this.oy + r * T + 1.5;
        const layers = this.sand[r]?.[c] ?? 0;
        if (layers > 0) {
          ctx.drawImage(this.sandSprite(Math.min(layers, 2)), x, y, T - 3, T - 3);
        } else {
          ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.22)' : 'rgba(255,250,235,0.42)';
          roundRect(ctx, x, y, T - 3, T - 3, T * 0.18);
          ctx.fill();
        }
      }
    }

    // coconut levels: arrows past each lane's far ("downhill") end show where coconuts are collected
    if (board.coconutsToSpawn > 0 || board.coconutsOnBoard() > 0) {
      const bob = Math.sin(now / 220) * T * 0.04;
      const [gr, gc] = GRAVITY_VEC[board.gravity];
      for (const lane of board.lanes()) {
        const end = lane[lane.length - 1];
        const cx = this.px(end.c) + gc * (T * 0.62 + bob), cy = this.py(end.r) + gr * (T * 0.62 + bob);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(gr, gc) - Math.PI / 2);
        ctx.fillStyle = 'rgba(70,170,60,0.9)';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-T * 0.16, -T * 0.08);
        ctx.lineTo(T * 0.16, -T * 0.08);
        ctx.lineTo(0, T * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    // grape juice puddles
    for (let r = 0; r < board.rows; r++)
      for (let c = 0; c < board.cols; c++)
        if (this.puddle[r]?.[c]) {
          const x = this.px(c), y = this.py(r);
          const wob = 1 + 0.04 * Math.sin(now / 300 + r + c);
          ctx.fillStyle = 'rgba(150,70,230,0.32)';
          ctx.beginPath();
          ctx.ellipse(x, y + T * 0.12, T * 0.42 * wob, T * 0.3 * wob, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath();
          ctx.ellipse(x - T * 0.15, y, T * 0.08, T * 0.04, -0.4, 0, Math.PI * 2);
          ctx.fill();
        }

    // juice splats stain the board briefly
    for (const f of this.fx) if (f.kind === 'splat' && f.t > 0) this.drawSplat(f);

    if (this.selected) {
      const { r, c } = this.selected;
      const pulse = 0.55 + 0.25 * Math.sin(now / 120);
      ctx.fillStyle = `rgba(255,255,170,${pulse})`;
      roundRect(ctx, this.ox + c * T + 1, this.oy + r * T + 1, T - 2, T - 2, T * 0.2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const hintIds = new Set<number>();
    if (this.hint) for (const h of this.hint) { const t = board.get(h.r, h.c); if (t) hintIds.add(t.id); }

    // tiles, clipped to the board so new fruit "falls in" from the top edge
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.ox - 6, this.oy - 2, bw + 12, bh + 8);
    ctx.clip();
    for (const [id, v] of this.vis) {
      let s = v.scale;
      if (hintIds.has(id)) s *= 1 + 0.09 * Math.sin(now / 130);
      ctx.globalAlpha = v.alpha;
      this.drawTile(v, this.px(v.x), this.py(v.y), T * 0.92 * s, now);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.drawWater(now, board);

    // effects above tiles
    for (const f of this.fx) {
      if (f.t <= 0) continue;
      if (f.kind === 'beam') this.drawBeam(f, board);
      else if (f.kind === 'ring') this.drawRing(f);
      else if (f.kind === 'rays') this.drawRays(f, now);
      else if (f.kind === 'flash') {
        ctx.globalAlpha = 1 - f.t / f.dur;
        ctx.fillStyle = f.color;
        roundRect(ctx, this.ox - 8, this.oy - 8, bw + 16, bh + 16, 18);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    for (const f of this.fx) if (f.kind === 'bee' && f.t > 0) this.drawFlyingBee(f, now);

    for (const p of this.particles) this.drawParticle(p);
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = t.big ? (k < 0.15 ? easeOutBack(k / 0.15) : 1) : 1;
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      // Shrink text that would be wider than the screen, and keep it fully on-screen.
      const font = (px: number) => `900 ${Math.max(1, Math.round(px))}px "Baloo 2", "Trebuchet MS", system-ui, sans-serif`;
      let size = t.size * pop;
      ctx.font = font(size);
      const maxW = this.w - 20;
      let tw = ctx.measureText(t.text).width;
      if (tw > maxW) {
        size *= maxW / tw;
        ctx.font = font(size);
        tw = ctx.measureText(t.text).width;
      }
      const x = Math.min(Math.max(t.x, tw / 2 + 10), this.w - tw / 2 - 10);
      ctx.lineWidth = Math.max(3, size * 0.16);
      ctx.strokeStyle = 'rgba(120,30,60,0.85)';
      ctx.strokeText(t.text, x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- drawing helpers ----------

  private drawTile(v: Vis, x: number, y: number, size: number, now: number): void {
    const ctx = this.ctx;
    if (size <= 0.5) return;
    if (v.special === 'bomb') {
      // Fruit Burst: golden sunburst behind the fruit
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now / 900);
      const R = size * (0.72 + 0.05 * Math.sin(now / 150));
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.55);
      glow.addColorStop(0, 'rgba(255,240,150,0.9)');
      glow.addColorStop(1, 'rgba(255,200,60,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(0, 0, size * 0.1, 0, 0, R);
      g.addColorStop(0, 'rgba(255,236,120,1)');
      g.addColorStop(0.7, 'rgba(255,170,30,0.85)');
      g.addColorStop(1, 'rgba(255,150,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a - 0.13) * R, Math.sin(a - 0.13) * R);
        ctx.lineTo(Math.cos(a + 0.13) * R, Math.sin(a + 0.13) * R);
      }
      ctx.fill();
      ctx.restore();
    } else if (v.special === 'rainbow') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now / 600);
      RAINBOW_COLORS.forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = size * 0.07;
        ctx.globalAlpha *= 1;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.52, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }

    const pulse = v.special && v.special !== 'rainbow' ? 1 + 0.04 * Math.sin(now / 160) : 1;
    const s = size * pulse;
    if (v.golden) {
      // golden glow behind ripe fruit
      const g = ctx.createRadialGradient(x, y, size * 0.1, x, y, size * 0.62);
      g.addColorStop(0, 'rgba(255,236,120,0.75)');
      g.addColorStop(1, 'rgba(255,200,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
    const img = v.kind >= 0 && v.unripe ? this.variant(v.kind, 'unripe') : v.kind >= 0 && v.golden ? this.variant(v.kind, 'golden') : this.sprite(v.kind);
    ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
    if (v.golden) {
      const a = now / 300 + v.x * 1.7 + v.y;
      const sx = x + Math.cos(a) * size * 0.32, sy = y + Math.sin(a) * size * 0.32;
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 ? size * 0.025 : size * 0.09;
        const aa = (i / 8) * Math.PI * 2;
        ctx.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
      }
      ctx.fill();
    }
    if (v.ice) {
      // ice cube over frozen fruit: thicker for two layers
      const half = size * 0.5;
      ctx.save();
      ctx.fillStyle = v.ice >= 2 ? 'rgba(170,225,255,0.62)' : 'rgba(200,238,255,0.45)';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(2, size * 0.05);
      roundRect(ctx, x - half, y - half, half * 2, half * 2, size * 0.18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(x - half * 0.8, y - half * 0.55);
      ctx.lineTo(x - half * 0.45, y - half * 0.85);
      ctx.lineTo(x - half * 0.3, y - half * 0.85);
      ctx.lineTo(x - half * 0.8, y - half * 0.3);
      ctx.fill();
      if (v.ice === 1) {
        // cracks after the first hit
        ctx.strokeStyle = 'rgba(90,150,200,0.7)';
        ctx.lineWidth = Math.max(1, size * 0.025);
        ctx.beginPath();
        ctx.moveTo(x + half * 0.1, y - half * 0.9);
        ctx.lineTo(x - half * 0.05, y - half * 0.2);
        ctx.lineTo(x + half * 0.35, y + half * 0.15);
        ctx.moveTo(x - half * 0.05, y - half * 0.2);
        ctx.lineTo(x - half * 0.5, y + half * 0.4);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (v.kind >= 0 && v.unripe) {
      // countdown badge
      const bx = x + size * 0.3, by = y + size * 0.3, br = size * 0.17;
      ctx.fillStyle = '#3c8f2a';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1.5, size * 0.04);
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.round(br * 1.3)}px "Baloo 2", "Trebuchet MS", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(v.unripe), bx, by + br * 0.06);
    }

    if (v.special === 'jetH' || v.special === 'jetV') {
      ctx.save();
      ctx.translate(x, y);
      if (v.special === 'jetV') ctx.rotate(Math.PI / 2);
      const L = size * 0.5, Hh = size * 0.13;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      roundRect(ctx, -L, -Hh, L * 2, Hh * 2, Hh);
      ctx.fill();
      // moving juice stripes
      ctx.save();
      roundRect(ctx, -L, -Hh, L * 2, Hh * 2, Hh);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,120,160,0.55)';
      const off = ((now / 18) % (Hh * 2.4));
      for (let sx = -L - Hh * 3 + off; sx < L + Hh; sx += Hh * 2.4) {
        ctx.beginPath();
        ctx.moveTo(sx, Hh);
        ctx.lineTo(sx + Hh, -Hh);
        ctx.lineTo(sx + Hh * 1.8, -Hh);
        ctx.lineTo(sx + Hh * 0.8, Hh);
        ctx.fill();
      }
      ctx.restore();
      // arrows
      const push = size * 0.04 * (1 + Math.sin(now / 140));
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(160,30,80,0.7)';
      ctx.lineWidth = Math.max(1, size * 0.025);
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * (L + push + size * 0.1), 0);
        ctx.lineTo(dir * (L + push - size * 0.04), -size * 0.11);
        ctx.lineTo(dir * (L + push - size * 0.04), size * 0.11);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    } else if (v.special === 'bee') {
      const a = now / 380;
      const bx = x + Math.cos(a) * size * 0.3;
      const by = y - size * 0.22 + Math.sin(a * 2) * size * 0.08;
      const bs = size * 0.5;
      ctx.save();
      ctx.translate(bx, by);
      if (Math.sin(a) > 0) ctx.scale(-1, 1);
      ctx.drawImage(this.bee(), -bs / 2, -bs / 2, bs, bs);
      ctx.restore();
    }
  }

  private drawFlyingBee(f: Extract<Fx, { kind: 'bee' }>, now: number): void {
    const ctx = this.ctx;
    const { x, y, dir } = this.beePos(f);
    const s = this.tile * 0.8;
    if (f.carry) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#fff3a0';
      ctx.beginPath();
      ctx.arc(x, y + s * 0.35, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(x, y + Math.sin(now / 40) * 1.5);
    ctx.scale(-dir, 1);
    ctx.drawImage(this.bee(), -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  private drawBeam(f: Extract<Fx, { kind: 'beam' }>, board: Board): void {
    const ctx = this.ctx;
    const T = this.tile;
    const p = f.t / f.dur;
    const ext = Math.min(1, p / 0.28);
    const fade = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55;
    const thick = T * 0.85 * (1 - p * 0.5);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    if (f.orient === 'row') {
      const y = this.py(f.index);
      const x0 = this.ox - 6, x1 = this.ox + board.cols * T + 6;
      const left = f.ox - ext * (f.ox - x0), right = f.ox + ext * (x1 - f.ox);
      const g = ctx.createLinearGradient(0, y - thick / 2, 0, y + thick / 2);
      beamStops(g, f.color);
      ctx.fillStyle = g;
      ctx.fillRect(left, y - thick / 2, right - left, thick);
      if (Math.random() < 0.7) this.emit('drop', left + Math.random() * (right - left), y, f.color, 1, { speed: 0.1, size: 3 });
    } else {
      const x = this.px(f.index);
      const y0 = this.oy - 6, y1 = this.oy + board.rows * T + 6;
      const top = f.oy - ext * (f.oy - y0), bottom = f.oy + ext * (y1 - f.oy);
      const g = ctx.createLinearGradient(x - thick / 2, 0, x + thick / 2, 0);
      beamStops(g, f.color);
      ctx.fillStyle = g;
      ctx.fillRect(x - thick / 2, top, thick, bottom - top);
      if (Math.random() < 0.7) this.emit('drop', x, top + Math.random() * (bottom - top), f.color, 1, { speed: 0.1, size: 3 });
    }
    ctx.restore();
  }

  private drawRing(f: Extract<Fx, { kind: 'ring' }>): void {
    const ctx = this.ctx;
    const p = f.t / f.dur;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.strokeStyle = f.color;
    ctx.lineWidth = Math.max(1, f.width * (1 - p * 0.7));
    ctx.beginPath();
    ctx.arc(f.x, f.y, Math.max(0.1, f.r * easeOutQuad(p)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawRays(f: Extract<Fx, { kind: 'rays' }>, now: number): void {
    const ctx = this.ctx;
    const p = f.t / f.dur;
    const grow = Math.min(1, p / 0.3);
    ctx.save();
    ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    ctx.lineCap = 'round';
    f.targets.forEach((t, i) => {
      const col = RAINBOW_COLORS[(i + Math.floor(now / 80)) % 6];
      const ex = f.x + (t.x - f.x) * grow, ey = f.y + (t.y - f.y) * grow;
      // jagged lightning
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      const steps = 5;
      for (let s = 1; s < steps; s++) {
        const k = s / steps;
        const jx = (Math.random() - 0.5) * this.tile * 0.25, jy = (Math.random() - 0.5) * this.tile * 0.25;
        ctx.lineTo(f.x + (ex - f.x) * k + jx, f.y + (ey - f.y) * k + jy);
      }
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = col;
      ctx.lineWidth = this.tile * 0.12;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = this.tile * 0.04;
      ctx.stroke();
    });
    ctx.restore();
  }

  private drawSplat(f: Extract<Fx, { kind: 'splat' }>): void {
    const ctx = this.ctx;
    const p = f.t / f.dur;
    ctx.save();
    ctx.globalAlpha = 0.45 * (1 - p);
    ctx.fillStyle = f.color;
    ctx.beginPath();
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = f.r * (0.75 + 0.35 * Math.sin(f.seed + i * 2.3)) * (0.6 + 0.4 * easeOutQuad(Math.min(1, p * 4)));
      const xx = f.x + Math.cos(a) * rr, yy = f.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawParticle(p: Particle): void {
    const ctx = this.ctx;
    const k = 1 - p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.fillStyle = p.color;
    switch (p.type) {
      case 'drop': {
        // teardrop stretched along velocity
        const a = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * (0.7 + k * 0.6), p.size * 0.6 * (0.5 + k * 0.5), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'seed':
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      case 'spark':
      case 'glint': {
        const s = p.size * (0.4 + k * 0.6);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const r = i % 2 ? s * 0.28 : s;
          const a = (i / 8) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'bubble': {
        const pop = p.life / p.max > 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.25);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (pop ? 1.4 : 1), 0, Math.PI * 2);
        if (pop) ctx.setLineDash([2, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.25, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'wedge':
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, p.size, -0.45, 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,240,200,0.8)';
        ctx.beginPath();
        ctx.arc(0, 0, p.size, -0.45, 0.45);
        ctx.arc(0, 0, p.size * 0.82, 0.45, -0.45, true);
        ctx.fill();
        ctx.restore();
        break;
      case 'leaf':
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + Math.sin(p.life / 120) * 0.6);
        ctx.beginPath();
        ctx.moveTo(-p.size, 0);
        ctx.quadraticCurveTo(0, -p.size * 0.6, p.size, 0);
        ctx.quadraticCurveTo(0, p.size * 0.6, -p.size, 0);
        ctx.fill();
        ctx.restore();
        break;
    }
  }
}

function beamStops(g: CanvasGradient, color: string) {
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.2, color);
  g.addColorStop(0.42, '#ffffff');
  g.addColorStop(0.58, '#ffffff');
  g.addColorStop(0.8, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

import { Board, Cell } from './core/board';
import { playMove, Step, COCONUT_POINTS } from './core/engine';
import { LevelDef, createBoard, hasSand } from './core/levels';
import { starsFor, LEFTOVER_MOVE_BONUS } from './core/scoring';
import { Renderer } from './renderer';
import { Hud } from './hud';
import { sfx } from './audio';
import { GoalSpec, goalSpecs } from './goals';
import { wait } from './tween';

export interface LevelResult {
  level: LevelDef;
  won: boolean;
  score: number;
  stars: number;
}

const CHEERS = ['', '', 'Juicy!', 'Tasty!', 'Fruitastic!', 'Smoothie Storm!', 'FIESTA!!'];
const HINT_DELAY = 6000;

export class Game {
  private board!: Board;
  private level!: LevelDef;
  private score = 0;
  private moves = 0;
  private collected: number[] = [];
  private coconuts = 0;
  private specs: GoalSpec[] = [];
  private busy = true;
  private active = false;
  private drag: { cell: Cell; x: number; y: number } | null = null;
  private idleSince = performance.now();
  private session = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: Renderer,
    private hud: Hud,
    private onEnd: (r: LevelResult) => void,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    renderer.onFrame = (now) => this.tick(now);
  }

  async start(level: LevelDef, seedOverride?: number): Promise<void> {
    const session = ++this.session;
    this.level = level;
    this.score = 0;
    this.moves = level.moves;
    this.collected = Array(6).fill(0);
    this.coconuts = 0;
    this.board = createBoard(level, seedOverride ?? level.seed);
    this.specs = goalSpecs(level);
    this.shownSand = this.board.sandLeft();
    this.busy = true;
    this.active = true;
    this.drag = null;
    this.hud.setLevel(level, this.specs);
    this.updateHud();
    await this.renderer.setBoard(this.board);
    if (session !== this.session) return;
    this.busy = false;
    this.idleSince = performance.now();
  }

  /** Dev/testing helper: a valid move, as on-screen points. */
  debugHintPoints(random = false): { x: number; y: number }[] | null {
    const all = random ? this.board?.allMoves() : null;
    const h = all?.length ? all[Math.floor(Math.random() * all.length)] : this.board?.findHint();
    if (!h) return null;
    return h.map((cell) => this.renderer.cellCenterClient(cell));
  }

  /** Dev/testing helper: direct access to the board. */
  debugBoard(): Board {
    return this.board;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  stop(): void {
    this.active = false;
    this.session++;
  }

  // ---------- input ----------

  private onDown = (e: PointerEvent) => {
    sfx.unlock();
    if (!this.active || this.busy) return;
    const cell = this.renderer.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    this.idleSince = performance.now();
    this.renderer.hint = null;
    const sel = this.renderer.selected;
    if (sel && this.board.isAdjacent(sel, cell)) {
      this.renderer.selected = null;
      void this.trySwap(sel, cell);
      return;
    }
    this.renderer.selected = cell;
    sfx.select();
    this.drag = { cell, x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag || this.busy) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    const threshold = this.renderer.tile * 0.35;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    const from = this.drag.cell;
    const to = Math.abs(dx) > Math.abs(dy) ? { r: from.r, c: from.c + Math.sign(dx) } : { r: from.r + Math.sign(dy), c: from.c };
    this.drag = null;
    this.renderer.selected = null;
    if (this.board.inBounds(to)) void this.trySwap(from, to);
  };

  private onUp = () => {
    this.drag = null;
  };

  private tick(now: number): void {
    if (this.active && !this.busy && !this.renderer.hint && now - this.idleSince > HINT_DELAY) {
      this.renderer.hint = this.board.findHint();
    }
  }

  // ---------- core turn ----------

  /** Sand still showing on screen (the board itself may be ahead while animations replay). */
  private shownSand = 0;

  private goalsLeft(): number[] {
    return this.specs.map((g) =>
      g.key === 'fruit' ? g.count - this.collected[g.kind!] : g.key === 'sand' ? this.shownSand : g.count - this.coconuts,
    );
  }

  private updateHud(): void {
    this.hud.update(this.score, this.moves, this.goalsLeft());
  }

  private wantedKinds(): number[] {
    return this.level.collect.filter((g) => this.collected[g.kind] < g.count).map((g) => g.kind);
  }

  private async trySwap(a: Cell, b: Cell): Promise<void> {
    if (this.busy || !this.active) return;
    const session = this.session;
    this.busy = true;
    this.renderer.hint = null;
    const ta = this.board.get(a.r, a.c), tb = this.board.get(b.r, b.c);
    if (!ta || !tb) {
      this.busy = false;
      return;
    }

    sfx.swap();
    await Promise.all([this.renderer.moveTile(ta, b.r, b.c), this.renderer.moveTile(tb, a.r, a.c)]);
    if (session !== this.session) return;

    const result = playMove(this.board, a, b, { wantedKinds: () => this.wantedKinds(), wantSand: () => hasSand(this.level) && this.board.sandLeft() > 0 });
    if (!result.valid) {
      sfx.invalid();
      await Promise.all([this.renderer.moveTile(ta, a.r, a.c, 170), this.renderer.moveTile(tb, b.r, b.c, 170)]);
      void this.renderer.wobble(ta);
      void this.renderer.wobble(tb);
      this.busy = false;
      this.idleSince = performance.now();
      return;
    }

    this.moves--;
    this.updateHud();
    await this.replay(result.steps, session);
    if (session !== this.session) return;

    if (this.isWon() && this.specs.length > 0) return this.finish(true, session);
    if (this.moves <= 0) return this.finish(this.isWon(), session);
    this.busy = false;
    this.idleSince = performance.now();
  }

  /** Animate the engine's steps one by one, updating score and goals as fruit pops. */
  private async replay(steps: Step[], session: number): Promise<void> {
    for (const step of steps) {
      if (session !== this.session) return;
      if (step.type === 'clear') {
        this.score += step.score;
        let goalHit = false;
        for (const cl of step.cleared) {
          if (cl.kind < 0) continue;
          this.collected[cl.kind]++;
          if (this.level.collect.some((g) => g.kind === cl.kind)) goalHit = true;
        }
        let shown = 0;
        for (const p of step.pops) {
          this.renderer.popText(`+${p.points}`, p.cell);
          shown += p.points;
        }
        if (step.score - shown > 0 && step.blasts.length) this.renderer.popText(`+${step.score - shown}`, step.blasts[0].origin, '#fff36b');
        sfx.pop(step.chain);
        if (step.combo) {
          this.renderer.banner('Super Combo!', '#ffb3f0');
          sfx.combo();
        } else if (step.chain >= 2) {
          const word = CHEERS[Math.min(step.chain, CHEERS.length - 1)];
          if (word) {
            this.renderer.banner(word);
            sfx.combo();
          }
        }
        this.shownSand -= step.sand.length;
        if (step.sand.length && hasSand(this.level)) goalHit = true;
        this.updateHud();
        if (goalHit) this.hud.bump();
        await this.renderer.playClear(step);
      } else if (step.type === 'fall') {
        await this.renderer.dropTiles(step.falls, step.spawns);
      } else if (step.type === 'collect') {
        this.coconuts += step.items.length;
        this.score += step.items.length * COCONUT_POINTS;
        this.updateHud();
        this.hud.bump();
        await this.renderer.playCollect(step);
      } else {
        this.renderer.banner('Shuffle!', '#9ff');
        sfx.shuffle();
        await this.renderer.shuffleTo(this.board);
      }
    }
  }

  private isWon(): boolean {
    return this.score >= this.level.stars[0] && this.goalsLeft().every((n) => n <= 0);
  }

  private async finish(won: boolean, session: number): Promise<void> {
    this.active = false;
    if (won && this.moves > 0) {
      const bonus = this.moves * LEFTOVER_MOVE_BONUS;
      this.renderer.banner(`Fiesta Bonus +${bonus.toLocaleString()}`, '#ffe36b');
      sfx.combo();
      this.score += bonus;
      this.moves = 0;
      this.updateHud();
      await wait(1100);
    } else {
      await wait(500);
    }
    if (session !== this.session) return;
    this.onEnd({ level: this.level, won, score: this.score, stars: won ? starsFor(this.score, this.level.stars) : 0 });
  }
}

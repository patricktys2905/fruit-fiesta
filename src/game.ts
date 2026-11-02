import { Board, Cell, Gravity, LAVA } from './core/board';
import { playMove, playTilt, MoveResult, Step, COCONUT_POINTS } from './core/engine';
import { LevelDef, createBoard, hasSand } from './core/levels';
import { starsFor, LEFTOVER_MOVE_BONUS } from './core/scoring';
import { Renderer } from './renderer';
import { Hud } from './hud';
import { sfx } from './audio';
import { GoalSpec, goalSpecs } from './goals';
import { LevelReport, emptyReport } from './meta/report';
import { Cafe } from './core/orders';
import { CafeView } from './cafeUi';
import { wait } from './tween';

export interface LevelResult {
  level: LevelDef;
  won: boolean;
  score: number;
  stars: number;
  report: LevelReport;
  /** Why the level was lost early, if it was. */
  reason?: 'flooded';
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
  private golden = 0;
  private cafe: Cafe | null = null;
  private cafeView = new CafeView();
  private report: LevelReport = emptyReport(0);
  /** Moves made in the current attempt (quitting after a move costs a life). */
  movesMade = 0;
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
    this.golden = 0;
    this.cafe = level.cafe ? new Cafe(level.cafe, level.kinds, (seedOverride ?? level.seed) + level.id) : null;
    this.cafeView.show(this.cafe);
    this.report = emptyReport(level.id);
    this.movesMade = 0;
    this.board = createBoard(level, seedOverride ?? level.seed);
    this.specs = goalSpecs(level);
    this.shownSand = this.board.sandLeft();
    this.shownIce = this.board.iceLeft();
    this.shownPinatas = this.board.pinatasLeft();
    this.shownLava = this.board.lavaLeft();
    this.busy = true;
    this.active = true;
    this.drag = null;
    this.hud.setLevel(level, this.specs);
    this.updateHud();
    this.onTiltChange?.(this.board.gravity);
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
  private shownIce = 0;
  private shownPinatas = 0;
  private shownLava = 0;

  private goalsLeft(): number[] {
    return this.specs.map((g) => {
      switch (g.key) {
        case 'fruit': return g.count - this.collected[g.kind!];
        case 'sand': return this.shownSand;
        case 'coconut': return g.count - this.coconuts;
        case 'golden': return g.count - this.golden;
        case 'orders': return this.cafe ? this.cafe.remaining : 0;
        case 'ice': return this.shownIce;
        case 'pinata': return this.shownPinatas;
        case 'lava': return this.shownLava;
      }
    });
  }

  private updateHud(): void {
    this.hud.update(this.score, this.moves, this.goalsLeft());
  }

  private wantedKinds(): number[] {
    if (this.cafe) return this.cafe.wanted();
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

    const result = playMove(this.board, a, b, this.engineCtx());
    if (!result.valid) {
      sfx.invalid();
      await Promise.all([this.renderer.moveTile(ta, a.r, a.c, 170), this.renderer.moveTile(tb, b.r, b.c, 170)]);
      void this.renderer.wobble(ta);
      void this.renderer.wobble(tb);
      this.busy = false;
      this.idleSince = performance.now();
      return;
    }

    await this.afterMove(result, session);
  }

  /** Island Tilt: change gravity (costs a move). */
  async tilt(dir: Gravity): Promise<void> {
    if (this.busy || !this.active || !this.level.tilt) return;
    const session = this.session;
    const result = playTilt(this.board, dir, this.engineCtx());
    if (!result.valid) return;
    this.busy = true;
    this.renderer.hint = null;
    this.renderer.selected = null;
    this.onTiltChange?.(dir);
    await this.afterMove(result, session);
  }

  /** Fired when gravity changes (for the tilt buttons). */
  onTiltChange?: (g: Gravity) => void;

  get gravity(): Gravity {
    return this.board?.gravity ?? 'down';
  }

  private engineCtx() {
    return { wantedKinds: () => this.wantedKinds(), wantSand: () => hasSand(this.level) && this.board.sandLeft() > 0 };
  }

  private async afterMove(result: MoveResult, session: number): Promise<void> {
    this.moves--;
    this.movesMade++;
    this.updateHud();
    await this.replay(result.steps, session);
    if (session !== this.session) return;
    if (result.flooded) return this.finish(false, session, 'flooded');
    // A move has passed at the café: customers get less patient.
    if (this.cafe) {
      const t = this.cafe.tick();
      for (const o of t.left) {
        void this.cafeView.walkedOut(o);
        sfx.invalid();
      }
      this.cafeView.refresh();
      setTimeout(() => this.cafeView.sync(), t.left.length ? 700 : 0);
      this.report.walkouts += t.left.length;
    }

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
        const rep = this.report;
        rep.maxChain = Math.max(rep.maxChain, step.chain);
        if (step.combo) rep.combos++;
        for (const cr of step.created) {
          if (cr.special === 'jetH' || cr.special === 'jetV') rep.jets++;
          else if (cr.special === 'bee') rep.bees++;
          else if (cr.special === 'bomb') rep.bursts++;
          else rep.smoothies++;
        }
        rep.sand += step.sand.length;
        const goldenNow = step.cleared.filter((c) => c.golden).length;
        this.golden += goldenNow;
        rep.golden += goldenNow;
        if (this.cafe) this.pourIntoCafe(step);
        for (const cl of step.cleared) {
          if (cl.kind < 0) continue;
          rep.fruit++;
          rep.fruitByKind[cl.kind]++;
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
        this.shownIce -= step.ice.length;
        const burst = step.pinatas.filter((p) => p.hp <= 0).length;
        const cooled = step.cleared.filter((c) => c.kind === LAVA).length;
        this.shownPinatas -= burst;
        this.shownLava -= cooled;
        rep.pinatas += burst;
        rep.lava += cooled;
        if (burst || cooled || step.pinatas.length) goalHit = true;
        if (step.ice.length) goalHit = true;
        rep.ice += step.ice.length;
        if (step.sweet && this.cafe) {
          this.cafe.soothe(step.sweet);
          this.cafeView.refresh();
        }
        if (step.sand.length && hasSand(this.level)) goalHit = true;
        this.updateHud();
        if (goalHit) this.hud.bump();
        await this.renderer.playClear(step);
      } else if (step.type === 'fall') {
        await this.renderer.dropTiles(step.falls, step.spawns);
      } else if (step.type === 'conveyor') {
        await this.renderer.playConveyor(step);
      } else if (step.type === 'lava') {
        this.shownLava++;
        this.updateHud();
        await this.renderer.playLava(step);
      } else if (step.type === 'night') {
        this.renderer.setLight(step.light);
      } else if (step.type === 'tilt') {
        await this.renderer.playTilt(step.gravity);
      } else if (step.type === 'tide') {
        await this.renderer.playTide(step);
      } else if (step.type === 'ripen') {
        await this.renderer.playRipen(step);
      } else if (step.type === 'collect') {
        this.coconuts += step.items.length;
        this.report.coconuts += step.items.length;
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

  /** Matched fruit flies into the waiting customers' orders. */
  private pourIntoCafe(step: Extract<Step, { type: 'clear' }>): void {
    const cafe = this.cafe!;
    const before = new Map(cafe.active.map((o) => [o.id, o]));
    const res = cafe.feed(step.cleared);
    res.pours.forEach((p, i) => {
      const o = before.get(p.orderId);
      const cl = step.cleared[p.from];
      if (o && cl) void this.cafeView.fly(p.kind, this.renderer.cellCenterClient(cl), o, 120 + i * 25);
    });
    for (const o of res.served) {
      const tip = cafe.tipFor(o);
      this.score += tip;
      this.report.customers++;
      setTimeout(() => {
        void this.cafeView.served(o, tip);
        this.renderer.banner(`Order up! +${tip}`, '#ffe36b');
        sfx.win();
        this.updateHud();
        this.hud.bump();
      }, 600);
    }
    setTimeout(() => this.cafeView.sync(), res.served.length ? 1500 : 600);
  }

  private isWon(): boolean {
    return this.score >= this.level.stars[0] && this.goalsLeft().every((n) => n <= 0);
  }

  /** True while a level is being played (used to warn before quitting). */
  get inProgress(): boolean {
    return this.active;
  }

  private async finish(won: boolean, session: number, reason?: 'flooded'): Promise<void> {
    this.active = false;
    this.report.movesLeft = this.moves;
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
    const stars = won ? starsFor(this.score, this.level.stars) : 0;
    Object.assign(this.report, { won, stars, score: this.score });
    this.onEnd({ level: this.level, won, score: this.score, stars, report: this.report, reason });
  }
}

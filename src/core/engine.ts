/** Resolves a whole player move (swap → matches → specials → cascades) into a list of
 *  steps. Pure and deterministic: the renderer just replays the steps, and the
 *  simulator uses exactly the same rules. */
import { Board, COCONUT, MUSH, Cell, FallMove, MatchGroup, RAINBOW, Spawn, Special, Tile, cellKey } from './board';
import { groupScore } from './scoring';
import { randInt } from './rng';

export type BlastType = 'row' | 'col' | 'bomb' | 'rainbow' | 'bee' | 'all';

export interface Blast {
  type: BlastType;
  origin: Cell;
  /** Cells this blast hits (used for visual timing). */
  cells: Cell[];
  /** Bee destination. */
  target?: Cell;
  /** Rainbow: fruit kind it zapped. */
  kind?: number;
  /** Rainbow + special combo: fruit turned into this special before detonating. */
  convertTo?: Special;
  /** Bomb blast radius (for visuals). */
  radius?: number;
}

export interface Cleared {
  tile: Tile;
  kind: number;
  r: number;
  c: number;
  /** Golden (ripe) fruit counts double. */
  golden?: boolean;
}

export interface Created {
  tile: Tile;
  r: number;
  c: number;
  special: Special;
  /** Matched cells that merge into the new special. */
  from: Cell[];
}

export interface ClearStep {
  type: 'clear';
  chain: number;
  cleared: Cleared[];
  created: Created[];
  blasts: Blast[];
  score: number;
  pops: { cell: Cell; points: number }[];
  /** True when the step began with two specials (or a Smoothie) swapped together. */
  combo: boolean;
  /** Sand layers washed away this step (a cell can appear once per layer removed). */
  sand: Cell[];
}

export interface FallStep {
  type: 'fall';
  falls: FallMove[];
  spawns: Spawn[];
}

export interface ShuffleStep {
  type: 'shuffle';
}

/** Coconuts that reached the bottom and were collected. */
export interface CollectStep {
  type: 'collect';
  items: { tile: Tile; r: number; c: number }[];
}

/** End of move: green fruit ripens into golden fruit; old golden fruit spoils into mush. */
export interface RipenStep {
  type: 'ripen';
  /** Unripe fruit that counted down but is still green. */
  ticked: Tile[];
  ripened: Tile[];
  spoiled: Tile[];
}

export type Step = ClearStep | FallStep | ShuffleStep | CollectStep | RipenStep;

/** Golden fruit spoils after this many moves. */
export const SPOIL_MOVES = 6;
/** Bonus points per golden fruit popped. */
export const GOLDEN_POINTS = 100;

export interface MoveResult {
  valid: boolean;
  steps: Step[];
  score: number;
  collected: number[];
  sandCleared: number;
  coconuts: number;
}

export interface EngineCtx {
  /** Fruit kinds the level still needs (bees prefer these). */
  wantedKinds: () => number[];
  /** Does the level still need sand cleared? (bees then aim for sand) */
  wantSand?: () => boolean;
}

/** Points for each layer of sand washed away. */
export const SAND_POINTS = 60;
/** Points for each coconut collected. */
export const COCONUT_POINTS = 500;

/** Points for each extra fruit cleared by a special's blast. */
export const BLAST_POINTS = 30;

// ---------- match shape → special ----------

export function classify(cells: Cell[]): Special | null {
  const set = new Set(cells.map((c) => cellKey(c.r, c.c)));
  const has = (r: number, c: number) => set.has(cellKey(r, c));
  let h = 0, v = 0, square = false;
  for (const { r, c } of cells) {
    if (!has(r, c - 1)) { let n = 0; while (has(r, c + n)) n++; h = Math.max(h, n); }
    if (!has(r - 1, c)) { let n = 0; while (has(r + n, c)) n++; v = Math.max(v, n); }
    if (has(r, c + 1) && has(r + 1, c) && has(r + 1, c + 1)) square = true;
  }
  if (Math.max(h, v) >= 5) return 'rainbow';
  if (h >= 3 && v >= 3) return 'bomb';
  if (h >= 4) return 'jetH';
  if (v >= 4) return 'jetV';
  if (square) return 'bee';
  return null;
}

// ---------- one clear step ----------

class StepBuilder {
  clear = new Map<number, Cell>();
  protect = new Set<number>();
  detonated = new Set<number>();
  queue: Cell[] = [];
  blasts: Blast[] = [];
  created: Created[] = [];
  pops: { cell: Cell; points: number }[] = [];
  matchedCount = 0;
  /** Cells that were part of a match (mush next to them gets cleaned up). */
  matchedCells: Cell[] = [];
  score = 0;

  constructor(private board: Board, private ctx: EngineCtx, readonly chain: number) {}

  add(cell: Cell): void {
    if (!this.board.inBounds(cell)) return;
    const k = cellKey(cell.r, cell.c);
    if (this.protect.has(k) || this.clear.has(k)) return;
    const t = this.board.get(cell.r, cell.c);
    if (!t || (t.kind === COCONUT && !t.special)) return; // coconuts can't be blasted
    this.clear.set(k, { r: cell.r, c: cell.c });
    if (t.special && !this.detonated.has(k)) this.queue.push({ r: cell.r, c: cell.c });
  }

  /** Clear a cell without letting its special fire (used when two specials combine). */
  consume(cell: Cell): void {
    this.detonated.add(cellKey(cell.r, cell.c));
    this.add(cell);
  }

  run(): void {
    // Matching next to mush cleans it up.
    for (const { r, c } of this.matchedCells)
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = this.board.get(r + dr, c + dc);
        if (t?.kind === MUSH) this.add({ r: r + dr, c: c + dc });
      }
    while (this.queue.length) {
      const cell = this.queue.shift()!;
      const k = cellKey(cell.r, cell.c);
      if (this.detonated.has(k)) continue;
      this.detonated.add(k);
      const t = this.board.get(cell.r, cell.c);
      if (t?.special) this.effect(t.special, cell);
    }
  }

  // --- effects ---

  effect(sp: Special, at: Cell): void {
    switch (sp) {
      case 'jetH': return this.row(at, at.r);
      case 'jetV': return this.col(at, at.c);
      case 'bomb': return this.bomb(at, 2);
      case 'rainbow': {
        const kind = this.mostCommonKind();
        if (kind >= 0) this.zapKind(at, kind);
        return;
      }
      case 'bee': {
        for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) this.add({ r: at.r + dr, c: at.c + dc });
        this.bee(at);
        return;
      }
    }
  }

  row(origin: Cell, r: number): void {
    const cells = Array.from({ length: this.board.cols }, (_, c) => ({ r, c }));
    this.blasts.push({ type: 'row', origin, cells });
    cells.forEach((c) => this.add(c));
  }

  col(origin: Cell, c: number): void {
    const cells = Array.from({ length: this.board.rows }, (_, r) => ({ r, c }));
    this.blasts.push({ type: 'col', origin, cells });
    cells.forEach((cell) => this.add(cell));
  }

  bomb(at: Cell, radius: number): void {
    const cells: Cell[] = [];
    for (let dr = -radius; dr <= radius; dr++)
      for (let dc = -radius; dc <= radius; dc++)
        if (Math.abs(dr) + Math.abs(dc) <= radius && this.board.inBounds({ r: at.r + dr, c: at.c + dc })) cells.push({ r: at.r + dr, c: at.c + dc });
    this.blasts.push({ type: 'bomb', origin: at, cells, radius });
    cells.forEach((c) => this.add(c));
  }

  zapKind(origin: Cell, kind: number, convertTo?: Special): void {
    const cells: Cell[] = [];
    for (let r = 0; r < this.board.rows; r++)
      for (let c = 0; c < this.board.cols; c++) {
        const t = this.board.get(r, c);
        if (t && t.kind === kind && !this.clear.has(cellKey(r, c))) cells.push({ r, c });
      }
    if (convertTo) {
      for (const cell of cells) {
        const t = this.board.get(cell.r, cell.c)!;
        if (!t.special) t.special = convertTo === 'jetH' || convertTo === 'jetV' ? (randInt(this.board.rng, 2) ? 'jetH' : 'jetV') : convertTo;
      }
    }
    this.blasts.push({ type: 'rainbow', origin, cells, kind, convertTo });
    cells.forEach((c) => this.add(c));
  }

  /** Bee flies to a fruit the level still needs (or anywhere) and pops it, optionally carrying another special. */
  bee(origin: Cell, carry?: Special): void {
    const target = this.pickBeeTarget();
    if (!target) return;
    this.blasts.push({ type: 'bee', origin, target, cells: [target] });
    if (carry) {
      this.consume(target);
      this.effect(carry, target);
    } else {
      this.add(target);
    }
  }

  private pickBeeTarget(): Cell | null {
    const wanted = new Set(this.ctx.wantedKinds());
    const wantSand = this.ctx.wantSand?.() ?? false;
    const preferred: Cell[] = [], any: Cell[] = [];
    for (let r = 0; r < this.board.rows; r++)
      for (let c = 0; c < this.board.cols; c++) {
        const k = cellKey(r, c);
        const t = this.board.get(r, c);
        if (!t || t.kind === COCONUT || this.clear.has(k) || this.protect.has(k)) continue;
        const good = wanted.has(t.kind) || (wantSand && this.board.sand[r][c] > 0);
        (good ? preferred : any).push({ r, c });
      }
    const pool = preferred.length ? preferred : any;
    return pool.length ? pool[randInt(this.board.rng, pool.length)] : null;
  }

  private mostCommonKind(): number {
    const counts = new Map<number, number>();
    for (let r = 0; r < this.board.rows; r++)
      for (let c = 0; c < this.board.cols; c++) {
        const t = this.board.get(r, c);
        if (t && t.kind >= 0 && !this.clear.has(cellKey(r, c))) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
      }
    let best = -1, bestN = 0;
    for (const [k, n] of [...counts].sort((a, b) => a[0] - b[0])) if (n > bestN) { best = k; bestN = n; }
    return best;
  }

  // --- matches ---

  planGroups(groups: MatchGroup[], moved: Cell[]): void {
    for (const g of groups) {
      const sp = classify(g.cells);
      let keep: Cell | null = null;
      if (sp) {
        const inGroup = (c: Cell) => g.cells.some((x) => x.r === c.r && x.c === c.c);
        const usable = (c: Cell) => !this.clear.has(cellKey(c.r, c.c)) && !this.board.get(c.r, c.c)?.special;
        const sorted = [...g.cells].sort((a, b) => a.r - b.r || a.c - b.c);
        const intersection = sp === 'bomb' ? g.cells.filter((c) => {
          const has = (r: number, cc: number) => g.cells.some((x) => x.r === r && x.c === cc);
          return (has(c.r, c.c - 1) || has(c.r, c.c + 1)) && (has(c.r - 1, c.c) || has(c.r + 1, c.c));
        }) : [];
        const candidates = [...moved.filter(inGroup), ...intersection, sorted[Math.floor(sorted.length / 2)], ...sorted];
        keep = candidates.find(usable) ?? null;
      }
      if (keep) this.protect.add(cellKey(keep.r, keep.c));
      this.matchedCells.push(...g.cells);
      for (const cell of g.cells) {
        if (keep && cell.r === keep.r && cell.c === keep.c) continue;
        this.add(cell);
      }
      const points = groupScore(g.cells.length, this.chain);
      this.score += points;
      this.matchedCount += g.cells.length - (keep ? 1 : 0);
      const sorted = [...g.cells].sort((a, b) => a.r - b.r || a.c - b.c);
      this.pops.push({ cell: keep ?? sorted[Math.floor(sorted.length / 2)], points });
      if (keep && sp) {
        const tile = this.board.get(keep.r, keep.c)!;
        this.created.push({ tile, r: keep.r, c: keep.c, special: sp, from: g.cells.filter((c) => c.r !== keep!.r || c.c !== keep!.c) });
      }
    }
  }

  /** Two specials (or a Smoothie) swapped together. Returns true if a combo fired. */
  swapCombo(cellA: Cell, tileA: Tile, cellB: Cell, tileB: Tile): boolean {
    const sA = tileA.special, sB = tileB.special;
    if (sA === 'rainbow' || sB === 'rainbow') {
      const [rc, other, oc] = sA === 'rainbow' ? [cellA, tileB, cellB] : [cellB, tileA, cellA];
      this.consume(rc);
      if (other.special === 'rainbow') {
        this.consume(oc);
        const cells: Cell[] = [];
        for (let r = 0; r < this.board.rows; r++) for (let c = 0; c < this.board.cols; c++) cells.push({ r, c });
        this.blasts.push({ type: 'all', origin: rc, cells });
        cells.forEach((c) => this.consume(c));
      } else if (other.kind < 0) {
        // Smoothie + coconut: zap the most common fruit instead.
        this.effect('rainbow', rc);
      } else if (other.special) {
        this.zapKind(rc, other.kind, other.special);
      } else {
        this.zapKind(rc, other.kind);
      }
      return true;
    }
    if (sA && sB) {
      // Combo fires where the player dropped the fruit (cellB).
      const at = cellB;
      this.consume(cellA);
      this.consume(cellB);
      const kinds = new Set([sA, sB]);
      const jets = (s?: Special) => s === 'jetH' || s === 'jetV';
      if (jets(sA) && jets(sB)) {
        this.row(at, at.r);
        this.col(at, at.c);
      } else if ((jets(sA) || jets(sB)) && kinds.has('bomb')) {
        for (let d = -1; d <= 1; d++) {
          if (at.r + d >= 0 && at.r + d < this.board.rows) this.row(at, at.r + d);
          if (at.c + d >= 0 && at.c + d < this.board.cols) this.col(at, at.c + d);
        }
      } else if (sA === 'bomb' && sB === 'bomb') {
        this.bomb(at, 4);
      } else if (sA === 'bee' && sB === 'bee') {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) this.add({ r: at.r + dr, c: at.c + dc });
        this.bee(at);
        this.bee(at);
        this.bee(at);
      } else {
        // Bee + Jet/Burst: the bee carries the other special to its target.
        const carried = sA === 'bee' ? sB : sA;
        this.bee(at, carried);
      }
      return true;
    }
    return false;
  }

  finalize(board: Board, collected: number[], combo: boolean): ClearStep {
    const cleared: Cleared[] = [];
    for (const cell of this.clear.values()) {
      const t = board.get(cell.r, cell.c)!;
      cleared.push({ tile: t, kind: t.kind, r: cell.r, c: cell.c, golden: t.golden });
      if (t.kind >= 0) collected[t.kind] += t.golden ? 2 : 1;
      if (t.golden) this.score += GOLDEN_POINTS * this.chain;
    }
    const blastCleared = Math.max(0, cleared.length - this.matchedCount);
    this.score += blastCleared * BLAST_POINTS * this.chain;
    // Sand washes away (one layer) under every fruit cleared or merged into a new special.
    const sand: Cell[] = [];
    for (const cell of [...this.clear.values(), ...this.created.map((c) => ({ r: c.r, c: c.c }))]) {
      if (board.sand[cell.r][cell.c] > 0) {
        board.sand[cell.r][cell.c]--;
        sand.push(cell);
      }
    }
    this.score += sand.length * SAND_POINTS;
    board.clear([...this.clear.values()]);
    for (const cr of this.created) {
      cr.tile.special = cr.special;
      if (cr.special === 'rainbow') cr.tile.kind = RAINBOW;
    }
    return { type: 'clear', chain: this.chain, cleared, created: this.created, blasts: this.blasts, score: this.score, pops: this.pops, combo, sand };
  }
}

// ---------- full move ----------

export function playMove(board: Board, a: Cell, b: Cell, ctx: EngineCtx): MoveResult {
  const result: MoveResult = { valid: false, steps: [], score: 0, collected: Array(6).fill(0), sandCleared: 0, coconuts: 0 };
  if (!board.isValidSwap(a, b)) return result;
  result.valid = true;

  board.swap(a, b);
  const movedTile = board.get(b.r, b.c)!; // the fruit the player dragged, now at b
  const otherTile = board.get(a.r, a.c)!;

  let chain = 1;
  let sb = new StepBuilder(board, ctx, chain);
  const combo = sb.swapCombo(b, movedTile, a, otherTile);
  let groups = board.findMatches().filter((g) => g.cells.some((c) => !sb.clear.has(cellKey(c.r, c.c))));
  sb.planGroups(groups, [b, a]);
  sb.run();
  push(sb.finalize(board, result.collected, combo));

  cascade();
  // End of move: fruit ripens (which can set off more matches), old golden fruit spoils.
  const ripen = ripenBoard(board);
  if (ripen) {
    result.steps.push(ripen);
    if (board.findMatches().length) {
      chain = 0;
      cascade(true);
    }
  }

  if (!board.findHint()) {
    board.shuffle();
    result.steps.push({ type: 'shuffle' });
  }
  return result;

  /** Fall, collect coconuts, and clear new matches until the board settles. */
  function cascade(startWithMatches = false) {
    for (let guard = 0; guard < 100; guard++) {
      if (!startWithMatches || guard > 0) {
        const falls = board.collapse();
        const spawns = board.refill();
        result.steps.push({ type: 'fall', falls, spawns });
        // Coconuts that reached the bottom are collected; the gap refills.
        for (let g2 = 0; g2 < 20; g2++) {
          const items = board.collectCoconuts();
          if (!items.length) break;
          result.coconuts += items.length;
          result.score += items.length * COCONUT_POINTS;
          result.steps.push({ type: 'collect', items });
          result.steps.push({ type: 'fall', falls: board.collapse(), spawns: board.refill() });
        }
      }
      groups = board.findMatches();
      if (!groups.length) break;
      chain++;
      sb = new StepBuilder(board, ctx, chain);
      sb.planGroups(groups, []);
      sb.run();
      push(sb.finalize(board, result.collected, false));
    }
  }
  function push(step: ClearStep) {
    result.steps.push(step);
    result.score += step.score;
    result.sandCleared += step.sand.length;
  }
}

/** Advance ripening by one move. Returns null when nothing on the board is ripening. */
export function ripenBoard(board: Board): RipenStep | null {
  const step: RipenStep = { type: 'ripen', ticked: [], ripened: [], spoiled: [] };
  let any = false;
  for (const row of board.grid)
    for (const t of row) {
      if (!t) continue;
      if (t.unripe) {
        any = true;
        t.unripe--;
        if (t.unripe <= 0) {
          delete t.unripe;
          t.golden = true;
          t.age = 0;
          step.ripened.push(t);
        } else step.ticked.push(t);
      } else if (t.golden) {
        any = true;
        t.age = (t.age ?? 0) + 1;
        if (t.age >= SPOIL_MOVES) {
          t.kind = MUSH;
          delete t.golden;
          delete t.special;
          step.spoiled.push(t);
        }
      }
    }
  return any ? step : null;
}
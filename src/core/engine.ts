/** Resolves a whole player move (swap → matches → specials → cascades) into a list of
 *  steps. Pure and deterministic: the renderer just replays the steps, and the
 *  simulator uses exactly the same rules. */
import { Board, COCONUT, MUSH, PINATA, LAVA, Cell, FallMove, Gravity, MatchGroup, RAINBOW, Spawn, Special, Tile, cellKey } from './board';
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
  /** Ice layers cracked this step (the fruit stays). */
  ice: IceCrack[];
  /** Fruit Personalities that fired this step. */
  traits: Trait[];
  /** Unripe fruit a kiwi helped ripen (now golden). */
  grown: Tile[];
  /** Grape puddles left behind / used up this step. */
  puddlesAdded: Cell[];
  puddlesUsed: Cell[];
  /** Strawberry matches this step (they soothe café customers). */
  sweet: number;
  /** Piñatas hit this step (hearts left; 0 = burst). */
  pinatas: { tile: Tile; r: number; c: number; hp: number }[];
  /** Cells lit up by matches (night levels). */
  lit: Cell[];
}

/** Rows that slid sideways at the end of the move. */
export interface ConveyorStep {
  type: 'conveyor';
  moves: { tile: Tile; r: number; fromC: number; toC: number; wrap: boolean }[];
}

/** Lava spread into a fruit because none was cooled this move. */
export interface LavaStep {
  type: 'lava';
  tile: Tile;
  r: number;
  c: number;
}

/** Night: light levels after the move (lights fade over time). */
export interface NightStep {
  type: 'night';
  light: number[][];
}

export const PINATA_POINTS = 400;
export const LAVA_POINTS = 120;
/** Moves a cell stays lit after a match nearby. */
export const LIGHT_MOVES = 4;

/** A fruit's personality firing: shown as a little label on the board. */
export interface Trait {
  kind: number;
  at: Cell;
  /** Cells it affected (orange zest pop, lemon zing, etc). */
  cells: Cell[];
}

export interface IceCrack {
  r: number;
  c: number;
  tile: Tile;
  /** Layers left after this crack. */
  left: number;
}

export const TRAIT_NAMES = ['Sweet!', 'Zest!', 'Zing!', 'Grow!', 'Juicy!', 'Chill!'];
export const ICE_POINTS = 80;
export const PUDDLE_POINTS = 150;

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

/** Island Tilt: gravity now pulls this way. */
export interface TiltStep {
  type: 'tilt';
  gravity: Gravity;
}

/** End of move tide report. */
export interface TideStep {
  type: 'tide';
  /** Rows now underwater. */
  tide: number;
  /** A match at the waterline pushed it back this move. */
  pushed: boolean;
  /** Net change this move (-1, 0 or +1). */
  change: number;
  /** Moves until it rises again. */
  nextRise: number;
}

export type Step = ClearStep | FallStep | ShuffleStep | CollectStep | RipenStep | TiltStep | TideStep | ConveyorStep | LavaStep | NightStep;

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
  /** The tide reached the flood line (level lost). */
  flooded: boolean;
  iceCracked: number;
  /** Strawberry matches (café customers get calmer). */
  sweet: number;
  pinatasBurst: number;
  lavaCleared: number;
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
  /** Matched groups (for Fruit Personalities). */
  groups: MatchGroup[] = [];
  traits: Trait[] = [];
  grown: Tile[] = [];
  extraSand: Cell[] = [];
  iceHits: Cell[] = [];
  newPuddles: Cell[] = [];
  sweet = 0;
  pinataHits = new Map<number, Cell>();
  pinataDone = new Set<number>();
  pinataLog: { tile: Tile; r: number; c: number; hp: number }[] = [];
  score = 0;

  constructor(private board: Board, private ctx: EngineCtx, readonly chain: number) {}

  add(cell: Cell): void {
    if (!this.board.inBounds(cell)) return;
    const k = cellKey(cell.r, cell.c);
    if (this.protect.has(k) || this.clear.has(k)) return;
    const t = this.board.get(cell.r, cell.c);
    if (!t || (t.kind === COCONUT && !t.special)) return; // coconuts can't be blasted
    if (t.kind === PINATA) {
      this.pinataHits.set(k, { r: cell.r, c: cell.c }); // knock off a heart instead
      return;
    }
    this.clear.set(k, { r: cell.r, c: cell.c });
    if (t.special && !this.detonated.has(k)) this.queue.push({ r: cell.r, c: cell.c });
  }

  /** Clear a cell without letting its special fire (used when two specials combine). */
  consume(cell: Cell): void {
    this.detonated.add(cellKey(cell.r, cell.c));
    this.add(cell);
  }

  /** Fruit Personalities: each matched group of a fruit does its little thing. */
  private personalities(): void {
    if (!this.board.personalities) return;
    const near = (cells: Cell[]) => {
      const inGroup = new Set(cells.map((c) => cellKey(c.r, c.c)));
      const out = new Map<number, Cell>();
      for (const { r, c } of cells)
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = cellKey(r + dr, c + dc);
          if (!inGroup.has(k) && this.board.inBounds({ r: r + dr, c: c + dc })) out.set(k, { r: r + dr, c: c + dc });
        }
      return [...out.values()];
    };
    for (const g of this.groups) {
      const at = g.cells[Math.floor(g.cells.length / 2)];
      const around = near(g.cells);
      const hit: Cell[] = [];
      switch (g.kind) {
        case 0: // strawberry: sweetens waiting café customers
          this.sweet++;
          break;
        case 1: { // orange: zest pops one fruit next to the match
          const pool = around.filter((c) => {
            const t = this.board.get(c.r, c.c);
            return t && t.kind >= 0 && !t.special && !this.clear.has(cellKey(c.r, c.c)) && !this.protect.has(cellKey(c.r, c.c));
          });
          if (pool.length) {
            const pickCell = pool[randInt(this.board.rng, pool.length)];
            this.add(pickCell);
            hit.push(pickCell);
          }
          break;
        }
        case 2: // lemon: zing washes sand next to the match
          for (const c of around) if (this.board.sand[c.r][c.c] > 0) { this.extraSand.push(c); hit.push(c); }
          break;
        case 3: // kiwi: helps nearby green fruit ripen
          for (const c of around) {
            const t = this.board.get(c.r, c.c);
            if (t?.unripe) {
              t.unripe--;
              if (t.unripe <= 0) {
                delete t.unripe;
                t.golden = true;
                t.age = 0;
              }
              this.grown.push(t);
              hit.push(c);
            }
          }
          break;
        case 4: // grape: leaves juice puddles
          this.newPuddles.push(...g.cells);
          break;
        case 5: // blueberry: chills nearby ice (and cleans mush)
          for (const c of around) {
            const t = this.board.get(c.r, c.c);
            if (t?.ice) { this.iceHits.push(c); hit.push(c); }
            else if (t?.kind === MUSH) { this.add(c); hit.push(c); }
          }
          break;
      }
      this.traits.push({ kind: g.kind, at, cells: hit });
    }
  }

  run(): void {
    this.personalities();
    // Matching next to mush or lava clears it; next to a piñata knocks off a heart.
    for (const { r, c } of this.matchedCells)
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = this.board.get(r + dr, c + dc);
        if (t?.kind === MUSH || t?.kind === LAVA || t?.kind === PINATA) this.add({ r: r + dr, c: c + dc });
      }
    for (let guard = 0; guard < 50; guard++) {
      this.detonate();
      // Piñatas: one heart per step; a burst scatters confetti over the cells around it.
      const fresh = [...this.pinataHits].filter(([k]) => !this.pinataDone.has(k));
      if (!fresh.length) break;
      for (const [k, cell] of fresh) {
        this.pinataDone.add(k);
        const t = this.board.get(cell.r, cell.c)!;
        t.hp = (t.hp ?? 3) - 1;
        this.pinataLog.push({ tile: t, r: cell.r, c: cell.c, hp: t.hp });
        if (t.hp <= 0) {
          this.clear.set(k, { r: cell.r, c: cell.c });
          this.score += PINATA_POINTS;
          const around: Cell[] = [];
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && this.board.inBounds({ r: cell.r + dr, c: cell.c + dc })) around.push({ r: cell.r + dr, c: cell.c + dc });
          this.blasts.push({ type: 'bomb', origin: cell, cells: around, radius: 1 });
          around.forEach((c) => this.add(c));
        }
      }
    }
  }

  private detonate(): void {
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
      this.groups.push(g);
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
    // Frozen fruit: clearing cracks a layer of ice instead of removing the fruit.
    const ice: IceCrack[] = [];
    for (const [k, cell] of [...this.clear]) {
      const t = board.get(cell.r, cell.c);
      if (t?.ice) {
        t.ice--;
        if (!t.ice) delete t.ice;
        ice.push({ r: cell.r, c: cell.c, tile: t, left: t.ice ?? 0 });
        this.clear.delete(k);
      }
    }
    for (const cell of this.iceHits) {
      const t = board.get(cell.r, cell.c);
      if (t?.ice && !ice.some((c) => c.r === cell.r && c.c === cell.c)) {
        t.ice--;
        if (!t.ice) delete t.ice;
        ice.push({ r: cell.r, c: cell.c, tile: t, left: t.ice ?? 0 });
      }
    }
    this.score += ice.length * ICE_POINTS * this.chain;
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
    for (const cell of [...this.clear.values(), ...this.created.map((c) => ({ r: c.r, c: c.c })), ...this.extraSand]) {
      if (board.sand[cell.r][cell.c] > 0) {
        board.sand[cell.r][cell.c]--;
        sand.push(cell);
      }
    }
    this.score += sand.length * SAND_POINTS;
    // Grape puddles: fruit popped on a puddle scores a bonus; grapes leave new ones.
    const puddlesUsed: Cell[] = [];
    for (const cell of this.clear.values())
      if (board.puddle[cell.r][cell.c]) {
        board.puddle[cell.r][cell.c] = false;
        puddlesUsed.push(cell);
      }
    this.score += puddlesUsed.length * PUDDLE_POINTS;
    for (const c of this.newPuddles) board.puddle[c.r][c.c] = true;
    // Night: matches light up the cells around them for a few moves.
    const lit: Cell[] = [];
    if (board.night) {
      const seen = new Set<number>();
      for (const { r, c } of [...this.matchedCells, ...this.clear.values()])
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc, k = cellKey(rr, cc);
            if (seen.has(k) || !board.inBounds({ r: rr, c: cc })) continue;
            seen.add(k);
            board.light[rr][cc] = LIGHT_MOVES;
            lit.push({ r: rr, c: cc });
          }
    }
    // Lava cooled by this step's matches and blasts.
    for (const cell of this.clear.values()) if (board.get(cell.r, cell.c)?.kind === LAVA) this.score += LAVA_POINTS;
    board.clear([...this.clear.values()]);
    for (const cr of this.created) {
      cr.tile.special = cr.special;
      if (cr.special === 'rainbow') cr.tile.kind = RAINBOW;
    }
    return { type: 'clear', chain: this.chain, cleared, created: this.created, blasts: this.blasts, score: this.score, pops: this.pops, combo, sand, ice, traits: this.traits, grown: this.grown, puddlesAdded: this.newPuddles, puddlesUsed, sweet: this.sweet, pinatas: this.pinataLog, lit };
  }
}

// ---------- full move ----------

export function playMove(board: Board, a: Cell, b: Cell, ctx: EngineCtx): MoveResult {
  const result = emptyResult();
  if (!board.isValidSwap(a, b)) return result;
  result.valid = true;
  board.swap(a, b);
  const movedTile = board.get(b.r, b.c)!; // the fruit the player dragged, now at b
  const otherTile = board.get(a.r, a.c)!;
  return resolve(board, ctx, result, (sb) => {
    const combo = sb.swapCombo(b, movedTile, a, otherTile);
    const groups = board.findMatches().filter((g) => g.cells.some((c) => !sb.clear.has(cellKey(c.r, c.c))));
    sb.planGroups(groups, [b, a]);
    sb.run();
    return combo;
  });
}

/** Fruit Hammer booster: smash one cell (like a tiny blast), then let the board settle. Free: no move used. */
export function playHammer(board: Board, cell: Cell, ctx: EngineCtx): MoveResult {
  const result = emptyResult();
  const t = board.get(cell.r, cell.c);
  if (!t || !board.inBounds(cell)) return result;
  result.valid = true;
  return resolve(board, ctx, result, (sb) => {
    sb.blasts.push({ type: 'bomb', origin: cell, cells: [cell], radius: 0 });
    if (t.kind === COCONUT) {
      sb.clear.set(cellKey(cell.r, cell.c), { r: cell.r, c: cell.c }); // the hammer can even knock a coconut away
    } else sb.add(cell);
    sb.run();
    return false;
  }, true);
}

/** Island Tilt: change which way gravity pulls; everything slides, then settles. Costs a move. */
export function playTilt(board: Board, dir: Gravity, ctx: EngineCtx): MoveResult {
  const result = emptyResult();
  if (board.gravity === dir) return result;
  result.valid = true;
  board.gravity = dir;
  result.steps.push({ type: 'tilt', gravity: dir });
  return resolve(board, ctx, result, null);
}

function emptyResult(): MoveResult {
  return { valid: false, steps: [], score: 0, collected: Array(6).fill(0), sandCleared: 0, coconuts: 0, flooded: false, iceCracked: 0, sweet: 0, pinatasBurst: 0, lavaCleared: 0 };
}

/** Shared end of every move: first clear (if any), cascades, ripening, tide, shuffle. */
function resolve(board: Board, ctx: EngineCtx, result: MoveResult, first: ((sb: StepBuilder) => boolean) | null, free = false): MoveResult {
  let chain = 1;
  let tidePushed = false;
  if (first) {
    const sb = new StepBuilder(board, ctx, chain);
    const combo = first(sb);
    push(sb.finalize(board, result.collected, combo));
  } else chain = 0;

  cascade();
  if (free) {
    // Boosters don't use a move, so nothing ticks (belts, ripening, lava, tide, night).
    if (!board.findHint()) {
      board.shuffle();
      result.steps.push({ type: 'shuffle' });
    }
    return result;
  }
  // Conveyor belts slide their rows one step (which can line up new matches).
  const conv = conveyorShift(board);
  if (conv) {
    result.steps.push(conv);
    if (board.findMatches().length) {
      chain = 0;
      cascade(true);
    }
  }
  // End of move: fruit ripens (which can set off more matches), old golden fruit spoils.
  const ripen = ripenBoard(board);
  if (ripen) {
    result.steps.push(ripen);
    if (board.findMatches().length) {
      chain = 0;
      cascade(true);
    }
  }

  // Lava creeps into a neighbouring fruit unless some was cooled this move.
  if (result.lavaCleared === 0 && board.lavaLeft() > 0) {
    const lava = spreadLava(board);
    if (lava) result.steps.push(lava);
  }

  // The tide: matches at the waterline push it back; it rises every few moves.
  if (board.tideEvery > 0) {
    let change = 0;
    if (tidePushed && board.tide > 0) {
      board.tide--;
      change--;
    }
    board.tideCounter++;
    if (board.tideCounter >= board.tideEvery) {
      board.tideCounter = 0;
      board.tide++;
      change++;
    }
    result.steps.push({ type: 'tide', tide: board.tide, pushed: tidePushed, change, nextRise: board.tideEvery - board.tideCounter });
    if (board.tide >= board.tideMax) result.flooded = true;
  }

  // Night: light fades a little each move; lanterns stay lit.
  if (board.night) {
    fadeLight(board);
    result.steps.push({ type: 'night', light: board.light.map((r) => [...r]) });
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
        // Coconuts that reached the far end are collected; the gap refills.
        for (let g2 = 0; g2 < 20; g2++) {
          const items = board.collectCoconuts();
          if (!items.length) break;
          result.coconuts += items.length;
          result.score += items.length * COCONUT_POINTS;
          result.steps.push({ type: 'collect', items });
          result.steps.push({ type: 'fall', falls: board.collapse(), spawns: board.refill() });
        }
      }
      const groups = board.findMatches();
      if (!groups.length) break;
      chain++;
      const sb = new StepBuilder(board, ctx, chain);
      sb.planGroups(groups, []);
      sb.run();
      push(sb.finalize(board, result.collected, false));
    }
  }
  function push(step: ClearStep) {
    result.steps.push(step);
    result.score += step.score;
    result.sandCleared += step.sand.length;
    result.iceCracked += step.ice.length;
    result.sweet += step.sweet;
    result.pinatasBurst += step.pinatas.filter((p) => p.hp <= 0).length;
    result.lavaCleared += step.cleared.filter((c) => c.kind === LAVA).length;
    if (board.tide > 0) {
      const waterTop = board.rows - board.tide;
      if (step.cleared.some((c) => c.r >= waterTop - 1)) tidePushed = true;
    }
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
/** Slide each conveyor row one step (wrapping around). Rows jammed by fixed tiles don't move. */
export function conveyorShift(board: Board): ConveyorStep | null {
  if (!board.conveyors.length) return null;
  const moves: ConveyorStep['moves'] = [];
  for (const { row, dir } of board.conveyors) {
    const cols: number[] = [];
    for (let c = 0; c < board.cols; c++) if (board.mask[row]?.[c]) cols.push(c);
    const tiles = cols.map((c) => board.grid[row][c]);
    if (tiles.some((t) => !t || t.kind === PINATA || t.kind === LAVA || t.ice)) continue;
    const n = cols.length;
    const moved = tiles.map((_, i) => tiles[(i - dir + n) % n]!);
    cols.forEach((c, i) => (board.grid[row][c] = moved[i]));
    tiles.forEach((t, i) => {
      const j = i + dir;
      moves.push({ tile: t!, r: row, fromC: cols[i], toC: cols[(j + n) % n], wrap: j < 0 || j >= n });
    });
  }
  return moves.length ? { type: 'conveyor', moves } : null;
}

/** Lava swallows one fruit next to it. */
export function spreadLava(board: Board): LavaStep | null {
  const options: Cell[] = [];
  for (let r = 0; r < board.rows; r++)
    for (let c = 0; c < board.cols; c++) {
      if (board.grid[r][c]?.kind !== LAVA) continue;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = board.get(r + dr, c + dc);
        if (t && t.kind >= 0 && !t.special && !t.ice) options.push({ r: r + dr, c: c + dc });
      }
    }
  if (!options.length) return null;
  const at = options[randInt(board.rng, options.length)];
  const t = board.grid[at.r][at.c]!;
  t.kind = LAVA;
  delete t.golden;
  delete t.unripe;
  return { type: 'lava', tile: t, r: at.r, c: at.c };
}

/** Night: every cell loses a move of light; lanterns keep their cell and neighbours lit. */
export function fadeLight(board: Board): void {
  for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) if (board.light[r][c] > 0) board.light[r][c]--;
  for (let r = 0; r < board.rows; r++)
    for (let c = 0; c < board.cols; c++)
      if (board.lantern[r][c])
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) if (board.inBounds({ r: r + dr, c: c + dc })) board.light[r + dr][c + dc] = LIGHT_MOVES;
}
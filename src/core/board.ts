import { Rng, randInt } from './rng';

/** Special fruit created by bigger matches. */
export type Special = 'jetH' | 'jetV' | 'bomb' | 'rainbow' | 'bee';

/** Kind used by the Rainbow Smoothie: never matches by colour. */
export const RAINBOW = -1;

export interface Tile {
  id: number;
  kind: number;
  special?: Special;
  /** Moves until this unripe (green) fruit ripens. Unripe fruit can't be matched. */
  unripe?: number;
  /** Ripe golden fruit: counts double. */
  golden?: boolean;
  /** Moves a golden fruit has waited; it spoils into mush when too old. */
  age?: number;
  /** Ice layers: frozen fruit can't be swapped; each clear cracks one layer instead of removing it. */
  ice?: number;
  /** Piñata hearts left. */
  hp?: number;
}

export interface Cell {
  r: number;
  c: number;
}

export interface MatchGroup {
  kind: number;
  cells: Cell[];
}

export interface FallMove {
  tile: Tile;
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  /** Same as toC (kept for convenience). */
  c: number;
}

export interface Spawn {
  tile: Tile;
  r: number;
  c: number;
  /** Virtual position just off the board edge the tile slides in from. */
  fromR: number;
  fromC: number;
  /** Same as fromR (kept for convenience). */
  dropFrom: number;
  /** Ripening countdown at the moment it spawned. */
  unripe?: number;
}

export const cellKey = (r: number, c: number) => r * 1000 + c;

/** Kind used by coconuts: can't be matched or blasted; drop them to the bottom to collect. */
export const COCONUT = -2;

/** Spoiled fruit: can't be matched; cleared by a match next to it or by a blast. */
export const MUSH = -3;

/** Piñata: can't be moved or matched; matches next to it (or blasts) knock off a heart; at 0 it bursts. */
export const PINATA = -4;

/** Lava: can't be moved or matched; cleared by a match next to it or a blast; spreads if left alone. */
export const LAVA = -5;

/** Tiles the player can never move. */
export const isFixed = (t: Tile) => t.kind === PINATA || t.kind === LAVA || !!t.ice;

export interface Conveyor {
  row: number;
  /** +1 slides right, -1 slides left. */
  dir: 1 | -1;
}

/** Which way fruit falls (Island Tilt changes this). */
export type Gravity = 'down' | 'up' | 'left' | 'right';
export const GRAVITY_VEC: Record<Gravity, [number, number]> = { down: [1, 0], up: [-1, 0], left: [0, -1], right: [0, 1] };

/** Pure game-board logic: no rendering, fully deterministic for a given RNG.
 *
 *  Optional layout strings (one per row) shape the board:
 *    '.' normal cell   ' ' or '#' hole (no cell; fruit falls straight past)
 *    's' sand          'S' deep sand (2 layers)     'o' starts with a coconut
 *    'i' frozen fruit  'I' double-frozen fruit
 *    'p' piñata        'v' lava        'l' lantern (always lit at night) */
export class Board {
  grid: (Tile | null)[][];
  /** Playable cells (false = hole). */
  mask: boolean[][];
  /** Sand layers under each cell. */
  sand: number[][];
  /** Coconuts still to drop in from the top during play. */
  coconutsToSpawn = 0;
  /** Max coconuts on the board at once. */
  maxCoconuts = 1;
  /** Chance a new fruit arrives unripe (0 = ripening off). */
  unripeChance = 0;
  /** Moves for unripe fruit to ripen. */
  ripenTurns = 3;
  /** Which way fruit falls. */
  gravity: Gravity = 'down';
  /** Rows covered by the tide, counted up from the bottom (0 = no water). */
  tide = 0;
  /** The tide rises one row every this many moves (0 = tide off). */
  tideEvery = 0;
  /** Moves since the tide last rose. */
  tideCounter = 0;
  /** Reaching this many rows floods the board (level lost). */
  tideMax = 99;
  /** Fruit Personalities: each fruit has a small power when matched. */
  personalities = false;
  /** Grape juice puddles: the next fruit popped on a puddle scores a bonus. */
  puddle: boolean[][];
  /** Night: the board is dark except near recent matches and lanterns. */
  night = false;
  /** Moves of light left on each cell (night levels). */
  light: number[][];
  /** Lanterns keep their cell and neighbours lit. */
  lantern: boolean[][];
  /** Rows that slide sideways after every move. */
  conveyors: Conveyor[] = [];
  private nextId = 1;
  private layout: string[] | null;

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly kinds: number,
    readonly rng: Rng,
    layout?: string[],
  ) {
    this.layout = layout ?? null;
    this.grid = Array.from({ length: rows }, () => Array<Tile | null>(cols).fill(null));
    this.mask = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
      const ch = layout?.[r]?.[c] ?? '.';
      return ch !== ' ' && ch !== '#';
    }));
    this.puddle = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
    this.light = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
    this.lantern = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => layout?.[r]?.[c] === 'l'));
    this.sand = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
      const ch = layout?.[r]?.[c];
      return ch === 's' ? 1 : ch === 'S' ? 2 : 0;
    }));
  }

  get(r: number, c: number): Tile | null {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
    return this.grid[r][c];
  }

  /** A real cell on the board (inside the grid and not a hole). */
  inBounds(cell: Cell): boolean {
    return cell.r >= 0 && cell.c >= 0 && cell.r < this.rows && cell.c < this.cols && this.mask[cell.r][cell.c];
  }

  /** Lanes of playable cells in the direction of gravity, each ordered from the
   *  side new fruit enters to the side it falls toward. */
  lanes(): Cell[][] {
    const out: Cell[][] = [];
    if (this.gravity === 'down' || this.gravity === 'up') {
      for (let c = 0; c < this.cols; c++) {
        const lane: Cell[] = [];
        for (let r = 0; r < this.rows; r++) if (this.mask[r][c]) lane.push({ r, c });
        out.push(this.gravity === 'up' ? lane.reverse() : lane);
      }
    } else {
      for (let r = 0; r < this.rows; r++) {
        const lane: Cell[] = [];
        for (let c = 0; c < this.cols; c++) if (this.mask[r][c]) lane.push({ r, c });
        out.push(this.gravity === 'left' ? lane.reverse() : lane);
      }
    }
    return out.filter((l) => l.length);
  }

  /** Is this row under the tide? */
  underwater(r: number): boolean {
    return this.tide > 0 && r >= this.rows - this.tide;
  }

  pinatasLeft(): number {
    return this.grid.flat().filter((t) => t?.kind === PINATA).length;
  }

  lavaLeft(): number {
    return this.grid.flat().filter((t) => t?.kind === LAVA).length;
  }

  iceLeft(): number {
    return this.grid.flat().reduce((n, t) => n + (t?.ice ?? 0), 0);
  }

  sandLeft(): number {
    return this.sand.flat().reduce((a, b) => a + b, 0);
  }

  coconutsOnBoard(): number {
    return this.grid.flat().filter((t) => t?.kind === COCONUT).length;
  }

  /** Coconuts that reached the far ("downhill") end of their lane are collected (removed). */
  collectCoconuts(): { tile: Tile; r: number; c: number }[] {
    const out: { tile: Tile; r: number; c: number }[] = [];
    for (const lane of this.lanes()) {
      const { r, c } = lane[lane.length - 1];
      const t = this.grid[r][c];
      if (t && t.kind === COCONUT) {
        out.push({ tile: t, r, c });
        this.grid[r][c] = null;
      }
    }
    return out;
  }

  newTile(kind: number, special?: Special): Tile {
    const t: Tile = { id: this.nextId++, kind };
    if (special) t.special = special;
    return t;
  }

  /** Same colour, a real fruit (not a Smoothie/coconut/mush), and ripe. */
  private same(t: Tile | null, kind: number): boolean {
    return !!t && t.kind >= 0 && !t.unripe && t.kind === kind && !t.unripe;
  }

  /** Maybe make a freshly spawned fruit unripe. */
  private maybeUnripe(t: Tile): Tile {
    if (this.unripeChance > 0 && t.kind >= 0 && this.rng() < this.unripeChance) t.unripe = this.ripenTurns;
    return t;
  }

  /** Sprinkle unripe fruit over a freshly filled board (used at level start). */
  seedUnripe(): void {
    for (const row of this.grid) for (const t of row) if (t) this.maybeUnripe(t);
  }

  /** Fill the board with no starting matches (lines or 2x2 squares) and at least one valid move. */
  fillInitial(): void {
    for (let attempt = 0; attempt < 200; attempt++) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (!this.mask[r][c]) {
            this.grid[r][c] = null;
            continue;
          }
          const lch = this.layout?.[r]?.[c];
          if (lch === 'o' || lch === 'p' || lch === 'v') {
            const t = this.newTile(lch === 'o' ? COCONUT : lch === 'p' ? PINATA : LAVA);
            if (lch === 'p') t.hp = 3;
            this.grid[r][c] = t;
            continue;
          }
          const banned = new Set<number>();
          const l1 = this.get(r, c - 1), l2 = this.get(r, c - 2);
          if (l1 && l2 && l1.kind === l2.kind) banned.add(l1.kind);
          const u1 = this.get(r - 1, c), u2 = this.get(r - 2, c);
          if (u1 && u2 && u1.kind === u2.kind) banned.add(u1.kind);
          const ul = this.get(r - 1, c - 1);
          if (l1 && u1 && ul && l1.kind === u1.kind && u1.kind === ul.kind) banned.add(l1.kind);
          let kind = randInt(this.rng, this.kinds);
          for (let i = 0; i < this.kinds && banned.has(kind); i++) kind = (kind + 1) % this.kinds;
          const t = this.newTile(kind);
          const ch = this.layout?.[r]?.[c];
          if (ch === 'i') t.ice = 1;
          else if (ch === 'I') t.ice = 2;
          this.grid[r][c] = t;
        }
      }
      if (this.findMatches().length === 0 && this.findHint()) return;
    }
  }

  isAdjacent(a: Cell, b: Cell): boolean {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  swap(a: Cell, b: Cell): void {
    const t = this.grid[a.r][a.c];
    this.grid[a.r][a.c] = this.grid[b.r][b.c];
    this.grid[b.r][b.c] = t;
  }

  /** Does the tile at (r,c) currently sit in a line of 3+ or a 2x2 square? */
  matchAt(r: number, c: number): boolean {
    const t = this.get(r, c);
    if (!t || t.kind < 0 || t.unripe) return false;
    const k = t.kind;
    let h = 1;
    for (let x = c - 1; this.same(this.get(r, x), k); x--) h++;
    for (let x = c + 1; this.same(this.get(r, x), k); x++) h++;
    if (h >= 3) return true;
    let v = 1;
    for (let y = r - 1; this.same(this.get(y, c), k); y--) v++;
    for (let y = r + 1; this.same(this.get(y, c), k); y++) v++;
    if (v >= 3) return true;
    for (const [dr, dc] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
      const r0 = r + dr, c0 = c + dc;
      if (this.same(this.get(r0, c0), k) && this.same(this.get(r0 + 1, c0), k) && this.same(this.get(r0, c0 + 1), k) && this.same(this.get(r0 + 1, c0 + 1), k)) return true;
    }
    return false;
  }

  /** Is swapping a and b a legal move? */
  isValidSwap(a: Cell, b: Cell): boolean {
    if (!this.inBounds(a) || !this.inBounds(b) || !this.isAdjacent(a, b)) return false;
    const ta = this.grid[a.r][a.c], tb = this.grid[b.r][b.c];
    if (!ta || !tb) return false;
    if (this.underwater(a.r) || this.underwater(b.r)) return false; // fruit under the tide can't be moved
    if (isFixed(ta) || isFixed(tb)) return false; // frozen fruit, piñatas and lava can't be moved
    if (ta.special === 'rainbow' || tb.special === 'rainbow') return true;
    if (ta.special && tb.special) return true;
    if (ta.kind === tb.kind) return false;
    this.swap(a, b);
    const ok = this.matchAt(a.r, a.c) || this.matchAt(b.r, b.c);
    this.swap(a, b);
    return ok;
  }

  /** All matches: lines of 3+ and 2x2 squares, with overlapping shapes merged into one group. */
  findMatches(): MatchGroup[] {
    const runs: Cell[][] = [];
    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        const t = this.get(r, c);
        let e = c + 1;
        if (t && t.kind >= 0 && !t.unripe) while (e < this.cols && this.same(this.get(r, e), t.kind)) e++;
        if (t && t.kind >= 0 && !t.unripe && e - c >= 3) runs.push(Array.from({ length: e - c }, (_, i) => ({ r, c: c + i })));
        c = e;
      }
    }
    for (let c = 0; c < this.cols; c++) {
      let r = 0;
      while (r < this.rows) {
        const t = this.get(r, c);
        let e = r + 1;
        if (t && t.kind >= 0 && !t.unripe) while (e < this.rows && this.same(this.get(e, c), t.kind)) e++;
        if (t && t.kind >= 0 && !t.unripe && e - r >= 3) runs.push(Array.from({ length: e - r }, (_, i) => ({ r: r + i, c })));
        r = e;
      }
    }
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const t = this.get(r, c);
        if (t && t.kind >= 0 && !t.unripe && this.same(this.get(r, c + 1), t.kind) && this.same(this.get(r + 1, c), t.kind) && this.same(this.get(r + 1, c + 1), t.kind)) {
          runs.push([{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }]);
        }
      }
    }

    // Union-find over runs that share a cell.
    const parent = runs.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const owner = new Map<number, number>();
    runs.forEach((run, i) => {
      for (const cell of run) {
        const k = cellKey(cell.r, cell.c);
        const o = owner.get(k);
        if (o === undefined) owner.set(k, i);
        else parent[find(i)] = find(o);
      }
    });

    const groups = new Map<number, Map<number, Cell>>();
    runs.forEach((run, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, new Map());
      const g = groups.get(root)!;
      for (const cell of run) g.set(cellKey(cell.r, cell.c), cell);
    });

    return [...groups.values()].map((cellMap) => {
      const cells = [...cellMap.values()];
      return { kind: this.grid[cells[0].r][cells[0].c]!.kind, cells };
    });
  }

  clear(cells: Cell[]): Tile[] {
    const removed: Tile[] = [];
    for (const { r, c } of cells) {
      const t = this.grid[r][c];
      if (t) {
        removed.push(t);
        this.grid[r][c] = null;
      }
    }
    return removed;
  }

  /** Slide tiles toward gravity into empty spaces (passing straight over holes). */
  collapse(): FallMove[] {
    const moves: FallMove[] = [];
    for (const lane of this.lanes()) {
      let w = lane.length - 1;
      for (let i = lane.length - 1; i >= 0; i--) {
        const from = lane[i];
        const t = this.grid[from.r][from.c];
        if (!t) continue;
        const to = lane[w];
        if (from.r !== to.r || from.c !== to.c) {
          this.grid[to.r][to.c] = t;
          this.grid[from.r][from.c] = null;
          moves.push({ tile: t, fromR: from.r, fromC: from.c, toR: to.r, toC: to.c, c: to.c });
        }
        w--;
      }
    }
    return moves;
  }

  /** Fill empty cells (at the entry side after collapse) with new fruit, and the odd coconut. */
  refill(): Spawn[] {
    const spawns: Spawn[] = [];
    const [dr, dc] = GRAVITY_VEC[this.gravity];
    let coconutRoom = this.coconutsToSpawn > 0 ? Math.max(0, this.maxCoconuts - this.coconutsOnBoard()) : 0;
    for (const lane of this.lanes()) {
      let empty = 0;
      while (empty < lane.length && !this.grid[lane[empty].r][lane[empty].c]) empty++;
      for (let i = 0; i < empty; i++) {
        const { r, c } = lane[i];
        let kind = randInt(this.rng, this.kinds);
        if (coconutRoom > 0 && this.coconutsToSpawn > 0 && i === 0 && this.rng() < 0.3) {
          kind = COCONUT;
          coconutRoom--;
          this.coconutsToSpawn--;
        }
        const t = this.maybeUnripe(this.newTile(kind));
        this.grid[r][c] = t;
        const back = empty - i;
        const fromR = lane[0].r - dr * back, fromC = lane[0].c - dc * back;
        spawns.push({ tile: t, r, c, fromR, fromC, dropFrom: fromR, unripe: t.unripe });
      }
    }
    return spawns;
  }
  /** First legal swap, or null if the board is stuck. */
  findHint(): [Cell, Cell] | null {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const a = { r, c }, b = { r: r + dr, c: c + dc };
          if (this.isValidSwap(a, b)) return [a, b];
        }
      }
    }
    return null;
  }

  /** All legal swaps (used by the simulator / bots). */
  allMoves(): [Cell, Cell][] {
    const out: [Cell, Cell][] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const a = { r, c }, b = { r: r + dr, c: c + dc };
          if (this.isValidSwap(a, b)) out.push([a, b]);
        }
      }
    }
    return out;
  }

  /** Rearrange existing fruit until there are no matches and a move exists. */
  shuffle(): void {
    // Only fruit moves; holes and coconuts stay put.
    const cells: Cell[] = [];
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const t = this.grid[r][c];
        if (t && t.kind !== COCONUT && !isFixed(t)) cells.push({ r, c });
      }
    const tiles = cells.map(({ r, c }) => this.grid[r][c]!);
    for (let attempt = 0; attempt < 500; attempt++) {
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = randInt(this.rng, i + 1);
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      }
      cells.forEach(({ r, c }, i) => (this.grid[r][c] = tiles[i]));
      if (this.findMatches().length === 0 && this.findHint()) return;
    }
    // Extremely unlikely fallback: regenerate.
    this.fillInitial();
  }
}

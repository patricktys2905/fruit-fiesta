import { Board, COCONUT } from './board';
import { mulberry32 } from './rng';

export interface CollectGoal {
  kind: number;
  count: number;
}

export interface LevelDef {
  id: number;
  name: string;
  cols: number;
  rows: number;
  /** How many fruit types appear (4 to 6). Fewer = easier, more cascades. */
  kinds: number;
  moves: number;
  seed: number;
  /** Score needed for 1, 2, 3 stars. 1 star is required to win. */
  stars: [number, number, number];
  collect: CollectGoal[];
  /** Board shape and obstacles, one string per row:
   *  '.' cell, ' ' hole, 's' sand, 'S' deep sand (2 layers), 'o' coconut. */
  layout?: string[];
  /** Coconuts to bring to the bottom (includes any 'o' in the layout). */
  coconuts?: number;
  /** Max coconuts on the board at once (default 1). */
  maxCoconuts?: number;
}

export interface WorldDef {
  id: number;
  name: string;
  /** Short description shown on the map. */
  blurb: string;
  /** Art name for the map background (src/art/<map>.webp). */
  map: string;
  /** Level stops on the map: % of map width/height, bottom → top. */
  spots: [number, number][];
  levels: LevelDef[];
}

/** Does this level have sand to clear? */
export const hasSand = (l: LevelDef) => !!l.layout?.some((row) => /[sS]/.test(row));

/** Build the starting board for a level (same seed → same board, for fair challenges). */
export function createBoard(level: LevelDef, seed = level.seed): Board {
  const b = new Board(level.cols, level.rows, level.kinds, mulberry32(seed), level.layout);
  b.fillInitial();
  const placed = b.grid.flat().filter((t) => t?.kind === COCONUT).length;
  b.coconutsToSpawn = Math.max(0, (level.coconuts ?? 0) - placed);
  b.maxCoconuts = level.maxCoconuts ?? 1;
  return b;
}

type Def = Omit<LevelDef, 'cols' | 'rows' | 'seed'> & { cols?: number; rows?: number };
const L = (d: Def): LevelDef => ({
  cols: d.layout?.[0].length ?? 8,
  rows: d.layout?.length ?? 9,
  seed: d.id * 101,
  ...d,
});

// Fruit kinds: 0 Strawberry, 1 Orange, 2 Lemon, 3 Kiwi, 4 Grape, 5 Blueberry

const SUNNY_ISLE: LevelDef[] = [
  L({ id: 1, name: 'Sunny Start', kinds: 5, moves: 15, stars: [4000, 9000, 18000], collect: [] }),
  L({ id: 2, name: 'Berry Picking', kinds: 5, moves: 20, stars: [1500, 9000, 14000], collect: [{ kind: 0, count: 35 }] }),
  L({ id: 3, name: 'Citrus Grove', kinds: 5, moves: 20, stars: [1500, 9500, 15000], collect: [{ kind: 1, count: 35 }, { kind: 2, count: 35 }] }),
  L({ id: 4, name: 'Kiwi Cove', kinds: 5, moves: 20, stars: [1500, 9500, 16000], collect: [{ kind: 3, count: 40 }] }),
  L({ id: 5, name: 'Grape Escape', kinds: 6, moves: 22, stars: [3500, 7000, 12000], collect: [] }),
  L({ id: 6, name: 'Blue Lagoon', kinds: 6, moves: 24, stars: [1500, 7500, 11000], collect: [{ kind: 5, count: 28 }, { kind: 4, count: 28 }] }),
  L({ id: 7, name: 'Fruit Salad', kinds: 5, moves: 24, stars: [1500, 9000, 14000], collect: [{ kind: 0, count: 25 }, { kind: 3, count: 25 }, { kind: 4, count: 25 }] }),
  L({
    id: 8, name: 'Heart Beach', kinds: 5, moves: 22, stars: [5000, 9000, 14000], collect: [],
    layout: [
      ' ..  .. ',
      '........',
      '........',
      '........',
      '........',
      ' ...... ',
      '  ....  ',
      '   ..   ',
    ],
  }),
];

const COCONUT_COVE: LevelDef[] = [
  L({
    id: 9, name: 'Sandy Toes', kinds: 5, moves: 20, stars: [2000, 13000, 18000], collect: [],
    layout: [
      '........',
      '........',
      '........',
      'ssssssss',
      'ssssssss',
      'ssssssss',
      '........',
      '........',
      '........',
    ],
  }),
  L({
    id: 10, name: 'Tide Pools', kinds: 5, moves: 24, stars: [2000, 16500, 23500], collect: [],
    layout: [
      'ss....ss',
      's......s',
      '........',
      '...ss...',
      '..sSSs..',
      '...ss...',
      '........',
      's......s',
      'ss....ss',
    ],
  }),
  L({
    id: 11, name: 'First Coconut', kinds: 5, moves: 28, stars: [2000, 19000, 29000], collect: [], coconuts: 2,
    layout: [
      '...o....',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ],
  }),
  L({
    id: 12, name: 'Palm Path', kinds: 5, moves: 22, stars: [2000, 8500, 10500], collect: [],
    layout: [
      '...  ...',
      '...  ...',
      'ss.  .ss',
      'ss....ss',
      'ssssssss',
      'ss....ss',
      'ss.  .ss',
      '...  ...',
      '...  ...',
    ],
  }),
  L({
    id: 13, name: 'Coconut Drop', kinds: 5, moves: 33, stars: [3000, 28500, 38500], collect: [], coconuts: 4, maxCoconuts: 2,
    layout: [
      '.o....o.',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ],
  }),
  L({
    id: 14, name: 'Hidden Lagoon', kinds: 5, moves: 32, stars: [2000, 9500, 11500], collect: [],
    layout: [
      'ssssssss',
      'ss....ss',
      's.    .s',
      's.    .s',
      's.    .s',
      's.    .s',
      's......s',
      'ss....ss',
      'ssssssss',
    ],
  }),
  L({
    id: 15, name: 'Shell Bay', kinds: 6, moves: 26, stars: [2000, 12500, 15500], collect: [{ kind: 5, count: 22 }],
    layout: [
      '........',
      '........',
      '..SSSS..',
      '.SSSSSS.',
      '.SSSSSS.',
      '..SSSS..',
      '........',
      '........',
      '........',
    ],
  }),
  L({
    id: 16, name: 'Cove Festival', kinds: 5, moves: 34, stars: [3000, 26500, 35000], collect: [], coconuts: 3,
    layout: [
      '...oo...',
      '........',
      '........',
      's......s',
      'ss....ss',
      'sss..sss',
      'ssssssss',
      'ssssssss',
      'ssssssss',
    ],
  }),
];

const BERRY_MOUNTAIN: LevelDef[] = [
  L({
    id: 17, name: 'Base Camp', kinds: 5, moves: 28, stars: [2000, 24000, 31500], collect: [{ kind: 0, count: 22 }],
    layout: [
      's......s',
      'Ss....sS',
      '.Ss..sS.',
      '..SssS..',
      '...SS...',
      '..SssS..',
      '.Ss..sS.',
      'Ss....sS',
      's......s',
    ],
  }),
  L({
    id: 18, name: 'Rocky Steps', kinds: 5, moves: 30, stars: [3000, 13500, 20000], collect: [], coconuts: 2, maxCoconuts: 2,
    layout: [
      'o.......',
      '........',
      '........',
      '........',
      '......##',
      '......##',
      '.....###',
      '....####',
      '....####',
    ].map((r) => r.replace(/#/g, ' ')),
  }),
  L({
    id: 19, name: 'Berry Bridge', kinds: 6, moves: 30, stars: [2000, 5000, 6500], collect: [{ kind: 0, count: 20 }, { kind: 5, count: 20 }],
    layout: [
      '...  ...',
      '...  ...',
      '...  ...',
      '........',
      '........',
      '...  ...',
      '...  ...',
      '...  ...',
      '...  ...',
    ],
  }),
  L({
    id: 20, name: 'Misty Falls', kinds: 5, moves: 32, stars: [3000, 25500, 34000], collect: [],
    layout: [
      'SSSSSSSS',
      'ssssssss',
      'ss....ss',
      'ss....ss',
      'ss....ss',
      'ss....ss',
      'ssssssss',
      'SSSSSSSS',
    ],
  }),
  L({
    id: 21, name: 'Avalanche', kinds: 5, moves: 35, stars: [3000, 25500, 33500], collect: [], coconuts: 4, maxCoconuts: 2,
    layout: [
      'o..oo..o',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ],
  }),
  L({
    id: 22, name: 'Crystal Cave', kinds: 6, moves: 26, stars: [2000, 8500, 10500], collect: [],
    layout: [
      '   ..   ',
      '  .ss.  ',
      ' .ssss. ',
      '.ssSSss.',
      'ssSSSSss',
      '.ssSSss.',
      ' .ssss. ',
      '  .ss.  ',
      '   ..   ',
    ],
  }),
  L({
    id: 23, name: 'Summit Path', kinds: 5, moves: 30, stars: [3000, 11000, 17500], collect: [], coconuts: 3, maxCoconuts: 2,
    layout: [
      '   oo   ',
      '  ....  ',
      '  ....  ',
      ' ...... ',
      ' ...... ',
      '........',
      '........',
      '........',
      '........',
    ],
  }),
  L({
    id: 24, name: 'Peak Fiesta', kinds: 5, moves: 34, stars: [4000, 29500, 36000], collect: [], coconuts: 3, maxCoconuts: 2,
    layout: [
      '...oo...',
      '........',
      's......s',
      'Ss....sS',
      'SSs..sSS',
      'SSSssSSS',
      'SSSSSSSS',
      'ssssssss',
      'ssssssss',
    ],
  }),
];

/** Zig-zag of 8 stops up an island map (% of width, % of height). */
const ZIGZAG: [number, number][] = [
  [30, 87], [68, 79], [38, 69], [70, 59], [32, 49], [66, 39], [36, 29], [56, 18],
];

export const WORLDS: WorldDef[] = [
  { id: 1, name: 'Sunny Isle', blurb: 'Where every fiesta begins', map: 'bg-map', spots: ZIGZAG, levels: SUNNY_ISLE },
  { id: 2, name: 'Coconut Cove', blurb: 'Wash away the sand, catch the coconuts', map: 'bg-map-2', spots: ZIGZAG, levels: COCONUT_COVE },
  { id: 3, name: 'Berry Mountain', blurb: 'The tallest, juiciest challenge', map: 'bg-map-3', spots: ZIGZAG, levels: BERRY_MOUNTAIN },
];

export const LEVELS: LevelDef[] = WORLDS.flatMap((w) => w.levels);

export const worldOf = (levelId: number): WorldDef => WORLDS.find((w) => w.levels.some((l) => l.id === levelId))!;

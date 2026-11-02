import { Board, COCONUT } from './board';
import { mulberry32 } from './rng';
import { CafeDef } from './orders';

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
  /** Beach Café: serve customers' smoothie orders. */
  cafe?: CafeDef;
  /** Ripening: chance new fruit arrives green, and moves to ripen. */
  ripen?: { chance: number; turns?: number };
  /** Goal: pop this many golden (ripe) fruit. */
  golden?: number;
  /** Tides: rows underwater at the start, moves between rises, rows that flood the board. */
  tide?: { start: number; every: number; max: number };
  /** Island Tilt: the player can change gravity (costs a move). */
  tilt?: boolean;
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
  if (level.tide) {
    b.tide = level.tide.start;
    b.tideEvery = level.tide.every;
    b.tideMax = level.tide.max;
  }
  if (level.ripen) {
    b.unripeChance = level.ripen.chance;
    b.ripenTurns = level.ripen.turns ?? 3;
    b.seedUnripe();
  }
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
  L({ id: 1, name: 'Café Opening', kinds: 5, moves: 18, stars: [1500, 6000, 9500], collect: [], cafe: { serve: 3, slots: 1, patience: 12, size: [6, 8] } }),
  L({ id: 2, name: 'Berry Rush', kinds: 5, moves: 20, stars: [1500, 9000, 14000], collect: [], cafe: { serve: 4, slots: 1, patience: 9, size: [8, 10] } }),
  L({ id: 3, name: 'Two at a Time', kinds: 5, moves: 20, stars: [1500, 7000, 10500], collect: [], cafe: { serve: 5, slots: 2, patience: 8, size: [7, 9] } }),
  L({ id: 4, name: 'Ripe & Ready', kinds: 5, moves: 18, stars: [1500, 8500, 11500], collect: [], golden: 18, ripen: { chance: 0.2 } }),
  L({ id: 5, name: 'Golden Hour', kinds: 5, moves: 20, stars: [1500, 8000, 10500], collect: [], cafe: { serve: 5, slots: 2, patience: 8, size: [8, 10] }, ripen: { chance: 0.15 } }),
  L({ id: 6, name: 'Rush Hour', kinds: 6, moves: 22, stars: [1500, 5000, 7000], collect: [], cafe: { serve: 6, slots: 3, patience: 8, size: [5, 7] } }),
  L({ id: 7, name: 'Mushy Mess', kinds: 5, moves: 22, stars: [1500, 8500, 10500], collect: [], golden: 20, cafe: { serve: 4, slots: 2, patience: 11, size: [7, 9] }, ripen: { chance: 0.25 } }),
  L({
    id: 8, name: 'Heart Beach', kinds: 5, moves: 24, stars: [1500, 7500, 10000], collect: [], cafe: { serve: 7, slots: 2, patience: 9, size: [7, 9] }, ripen: { chance: 0.12 },
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
    id: 12, name: 'Rising Tide', kinds: 5, moves: 22, tide: { start: 1, every: 4, max: 5 }, stars: [2000, 8000, 10500], collect: [],
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
    id: 14, name: 'Hidden Lagoon', kinds: 5, moves: 32, tide: { start: 1, every: 5, max: 5 }, stars: [2000, 10000, 12500], collect: [],
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
    id: 15, name: 'Shell Bay', kinds: 6, moves: 26, tide: { start: 2, every: 4, max: 6 }, stars: [2000, 12000, 15000], collect: [{ kind: 5, count: 22 }],
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
    id: 16, name: 'Cove Festival', kinds: 5, moves: 34, tide: { start: 1, every: 5, max: 6 }, stars: [3000, 27500, 38000], collect: [], coconuts: 3,
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
    id: 18, name: 'Rocky Steps', kinds: 5, moves: 26, tilt: true, stars: [3000, 7500, 10500], collect: [], coconuts: 2, maxCoconuts: 2,
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
    id: 21, name: 'Avalanche', kinds: 5, moves: 31, tilt: true, stars: [3000, 9000, 15000], collect: [], coconuts: 4, maxCoconuts: 2,
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
    id: 23, name: 'Summit Path', kinds: 5, moves: 30, tilt: true, stars: [3000, 7500, 10500], collect: [], coconuts: 3, maxCoconuts: 2,
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
    id: 24, name: 'Peak Fiesta', kinds: 5, moves: 34, tilt: true, tide: { start: 0, every: 6, max: 5 }, stars: [4000, 28000, 34000], collect: [], coconuts: 3, maxCoconuts: 2,
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
  { id: 1, name: 'Sunny Isle', blurb: 'Open your beach café!', map: 'bg-map', spots: ZIGZAG, levels: SUNNY_ISLE },
  { id: 2, name: 'Coconut Cove', blurb: 'Sand, coconuts and rising tides', map: 'bg-map-2', spots: ZIGZAG, levels: COCONUT_COVE },
  { id: 3, name: 'Berry Mountain', blurb: 'Tilt the island to roll the fruit', map: 'bg-map-3', spots: ZIGZAG, levels: BERRY_MOUNTAIN },
];

export const LEVELS: LevelDef[] = WORLDS.flatMap((w) => w.levels);

export const worldOf = (levelId: number): WorldDef => WORLDS.find((w) => w.levels.some((l) => l.id === levelId))!;

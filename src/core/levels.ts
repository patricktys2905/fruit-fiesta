import { Board, COCONUT, Conveyor } from './board';
import { mulberry32 } from './rng';
import { CafeDef } from './orders';
import tuning from './tuning.json';

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
  /** Fruit Personalities: each fruit has a small power when matched. */
  personalities?: boolean;
  /** Night: the board is dark except near recent matches and lanterns ('l'). */
  night?: boolean;
  /** Rows that slide sideways after every move. */
  conveyors?: Conveyor[];
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
/** Does this level have frozen fruit to break? */
export const hasIce = (l: LevelDef) => !!l.layout?.some((row) => /[iI]/.test(row));
export const pinataCount = (l: LevelDef) => (l.layout ?? []).join('').split('p').length - 1;
export const hasLava = (l: LevelDef) => !!l.layout?.some((row) => row.includes('v'));

/** Build the starting board for a level (same seed → same board, for fair challenges). */
export function createBoard(level: LevelDef, seed = level.seed): Board {
  const b = new Board(level.cols, level.rows, level.kinds, mulberry32(seed), level.layout);
  b.fillInitial();
  const placed = b.grid.flat().filter((t) => t?.kind === COCONUT).length;
  b.coconutsToSpawn = Math.max(0, (level.coconuts ?? 0) - placed);
  b.maxCoconuts = level.maxCoconuts ?? 1;
  b.personalities = !!level.personalities;
  b.night = !!level.night;
  b.conveyors = level.conveyors ?? [];
  if (b.night) {
    // Start with a glow in the middle so the first move isn't a blind guess, plus the lanterns.
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (Math.abs(r - b.rows / 2) < 2 && Math.abs(c - b.cols / 2) < 2.5) b.light[r][c] = 3;
    for (let r = 0; r < b.rows; r++)
      for (let c = 0; c < b.cols; c++)
        if (b.lantern[r][c]) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (b.inBounds({ r: r + dr, c: c + dc })) b.light[r + dr][c + dc] = 4;
  }
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

type Def = Omit<LevelDef, 'cols' | 'rows' | 'seed'> & { cols?: number; rows?: number; seed?: number };
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
  L({ id: 0, seed: 9101, name: 'Smoothie Party', kinds: 5, moves: 26, stars: [1500, 8000, 12000], collect: [], cafe: { serve: 7, slots: 3, patience: 9, size: [6, 8] }, ripen: { chance: 0.12 } }),
  L({
    id: 0, seed: 9202, name: 'Sunset Fiesta', kinds: 5, moves: 26, stars: [1500, 9000, 13000], collect: [], golden: 14, cafe: { serve: 5, slots: 2, patience: 9, size: [7, 9] }, ripen: { chance: 0.18 },
    layout: [
      '   ..   ',
      '  ....  ',
      ' ...... ',
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
  L({
    id: 0, seed: 9303, name: 'Coconut Tide', kinds: 5, moves: 30, stars: [3000, 9000, 14000], collect: [], coconuts: 3, maxCoconuts: 2, tide: { start: 1, every: 5, max: 6 },
    layout: ['.o....o.', '........', '........', '........', '........', '........', '........', '........', '........'],
  }),
  L({
    id: 0, seed: 9404, name: 'Treasure Cove', kinds: 5, moves: 32, stars: [3000, 9000, 14000], collect: [], coconuts: 2, tide: { start: 1, every: 6, max: 6 },
    layout: ['...oo...', '........', '..ssss..', '.sSSSSs.', '.sSSSSs.', '..ssss..', '........', '........', '........'],
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
  L({
    id: 0, seed: 9505, name: 'Rolling Hills', kinds: 5, moves: 30, stars: [3000, 9000, 14000], collect: [], coconuts: 4, maxCoconuts: 2, tilt: true,
    layout: ['o......o', '........', 'ss....ss', 'ssssssss', '........', '........', 'ssssssss', 'ss....ss', '........'],
  }),
  L({ id: 0, seed: 9606, name: 'Mountain Café', kinds: 5, moves: 28, stars: [2000, 9000, 13000], collect: [], tilt: true, cafe: { serve: 6, slots: 2, patience: 9, size: [7, 9] }, ripen: { chance: 0.12 } }),
];

// World 4: every fruit has a personality (lemons zing sand, kiwis ripen fruit, grapes leave
// juice puddles, oranges pop a neighbour, strawberries calm café customers, blueberries chill).
const CITRUS_GROVE: LevelDef[] = [
  L({ id: 0, seed: 4101, name: 'Meet the Fruit', kinds: 5, moves: 22, stars: [5000, 10000, 15000], collect: [], personalities: true }),
  L({
    id: 0, seed: 4102, name: 'Lemon Zing', kinds: 5, moves: 22, stars: [2000, 9000, 13000], collect: [{ kind: 2, count: 25 }], personalities: true,
    layout: ['ssssssss', 'ssssssss', '........', '........', '........', '........', '........', 'ssssssss', 'ssssssss'],
  }),
  L({ id: 0, seed: 4103, name: 'Kiwi Patch', kinds: 5, moves: 22, stars: [2000, 9000, 13000], collect: [{ kind: 3, count: 25 }], golden: 15, personalities: true, ripen: { chance: 0.22 } }),
  L({ id: 0, seed: 4104, name: 'Sweet Service', kinds: 5, moves: 24, stars: [1500, 9000, 13000], collect: [], personalities: true, cafe: { serve: 6, slots: 2, patience: 7, size: [7, 9] } }),
  L({
    id: 0, seed: 4105, name: 'Grape Vines', kinds: 5, moves: 22, stars: [8000, 13000, 18000], collect: [], personalities: true,
    layout: ['.. .. ..', '........', '........', '. .... .', '........', '........', '. .... .', '........', '........'],
  }),
  L({
    id: 0, seed: 4106, name: 'Orange Orchard', kinds: 5, moves: 24, stars: [2000, 9000, 13000], collect: [{ kind: 1, count: 30 }], personalities: true,
    layout: ['ss....ss', 's......s', '........', '...SS...', '..SSSS..', '...SS...', '........', 's......s', 'ss....ss'],
  }),
  L({ id: 0, seed: 4107, name: 'Citrus Rush', kinds: 6, moves: 26, stars: [1500, 9000, 13000], collect: [], personalities: true, cafe: { serve: 7, slots: 3, patience: 8, size: [5, 7] }, ripen: { chance: 0.12 } }),
  L({
    id: 0, seed: 4108, name: 'Zesty Tide', kinds: 5, moves: 28, stars: [2000, 9000, 13000], collect: [], personalities: true, tide: { start: 1, every: 5, max: 6 },
    layout: ['........', '........', 'ssssssss', 'ssssssss', '........', '........', 'ssssssss', '........', '........'],
  }),
  L({
    id: 0, seed: 4109, name: 'Fruit Parade', kinds: 6, moves: 28, stars: [3000, 9000, 13000], collect: [], coconuts: 3, maxCoconuts: 2, personalities: true, tilt: true, golden: 10, ripen: { chance: 0.15 },
    layout: ['o......o', '........', '........', '........', '........', '........', '........', '........', '........'],
  }),
  L({
    id: 0, seed: 4110, name: 'Grove Fiesta', kinds: 6, moves: 30, stars: [2000, 9000, 13000], collect: [], personalities: true, cafe: { serve: 6, slots: 2, patience: 9, size: [7, 9] }, ripen: { chance: 0.12 },
    layout: ['  ....  ', ' ...... ', '........', 'ssssssss', 'ssssssss', 'ssssssss', '........', ' ...... ', '  ....  '],
  }),
];

// World 5: frozen fruit can't be moved and needs a match (or two) to thaw. Blueberries chill nearby ice.
const FROSTY_FALLS: LevelDef[] = [
  L({ id: 0, seed: 5101, name: 'First Frost', kinds: 5, moves: 20, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '........', '........', '..iiii..', '..iiii..', '..iiii..', '........', '........', '........'] }),
  L({ id: 0, seed: 5102, name: 'Ice Cubes', kinds: 5, moves: 22, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['ii....ii', 'ii....ii', '........', '...ii...', '...ii...', '........', 'ii....ii', 'ii....ii', '........'] }),
  L({ id: 0, seed: 5103, name: 'Blueberry Chill', kinds: 6, moves: 28, stars: [2000, 8000, 12000], collect: [{ kind: 5, count: 16 }], personalities: true, layout: ['........', '........', 'i.i.i.i.', '........', '........', '.i.i.i.i', '........', '........', '........'] }),
  L({ id: 0, seed: 5104, name: 'Double Freeze', kinds: 5, moves: 24, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '........', '.iIIIIi.', '.i....i.', '.i....i.', '.iIIIIi.', '........', '........', '........'] }),
  L({ id: 0, seed: 5105, name: 'Frozen Café', kinds: 5, moves: 26, stars: [1500, 9000, 13000], collect: [], personalities: true, cafe: { serve: 6, slots: 2, patience: 9, size: [7, 9] }, layout: ['........', '........', '........', '........', 'iiiiiiii', 'iiiiiiii', '........', '........', '........'] }),
  L({ id: 0, seed: 5106, name: 'Icicle Falls', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['i  ii  i', 'i  ii  i', 'i......i', '........', '........', '..iiii..', '........', '........', '........'] }),
  L({ id: 0, seed: 5107, name: 'Snowy Sands', kinds: 5, moves: 28, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['ssssssss', 'ss....ss', '..iiii..', '..iiii..', '........', '..iiii..', '..iiii..', 'ss....ss', 'ssssssss'] }),
  L({ id: 0, seed: 5108, name: 'Glacier Tide', kinds: 5, moves: 28, stars: [2000, 8000, 12000], collect: [], personalities: true, tide: { start: 1, every: 5, max: 6 }, layout: ['........', '........', '.iiiiii.', '.iiiiii.', '........', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 5109, name: 'Avalanche Ice', kinds: 5, moves: 30, stars: [3000, 9000, 13000], collect: [], coconuts: 3, maxCoconuts: 2, personalities: true, tilt: true, layout: ['o......o', '........', '..IIII..', '..IIII..', '........', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 5110, name: 'Frost Fiesta', kinds: 5, moves: 30, stars: [2000, 9000, 13000], collect: [], golden: 10, personalities: true, ripen: { chance: 0.12 }, layout: ['   ..   ', '  ....  ', ' ..ii.. ', '..iIIi..', '.iIIIIi.', '..iIIi..', ' ..ii.. ', '  ....  ', '   ..   '] }),
];

// World 6: piñatas take three hits from matches beside them, then burst in confetti.
const PINATA_PLAZA: LevelDef[] = [
  L({ id: 0, seed: 6101, name: 'First Piñata', kinds: 5, moves: 20, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '........', '........', '........', '...p....', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 6102, name: 'Party Pair', kinds: 5, moves: 22, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '........', '..p..p..', '........', '........', '........', '..p..p..', '........', '........'] }),
  L({ id: 0, seed: 6103, name: 'Confetti Café', kinds: 5, moves: 24, stars: [1500, 9000, 13000], collect: [], personalities: true, cafe: { serve: 5, slots: 2, patience: 9, size: [7, 9] }, layout: ['........', '........', '........', '.p....p.', '........', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 6104, name: 'Sandy Fiesta', kinds: 5, moves: 24, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['ssssssss', 'ss....ss', 's..p...s', '........', '...ss...', '........', 's...p..s', 'ss....ss', 'ssssssss'] }),
  L({ id: 0, seed: 6105, name: 'Piñata Row', kinds: 5, moves: 24, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '........', '........', '........', 'p..p..p.', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 6106, name: 'Golden Party', kinds: 5, moves: 24, stars: [2000, 9000, 13000], collect: [], golden: 12, personalities: true, ripen: { chance: 0.15 }, layout: ['........', '........', '...p....', '........', '........', '........', '....p...', '........', '........'] }),
  L({ id: 0, seed: 6107, name: 'Frosted Piñatas', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '..iiii..', '..ip.i..', '..iiii..', '........', '..iiii..', '..i.pi..', '..iiii..', '........'] }),
  L({ id: 0, seed: 6108, name: 'Plaza Tide', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, tide: { start: 1, every: 5, max: 6 }, layout: ['........', '........', '.p....p.', '........', '........', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 6109, name: 'Tilted Party', kinds: 5, moves: 26, stars: [3000, 9000, 13000], collect: [], coconuts: 2, maxCoconuts: 2, personalities: true, tilt: true, layout: ['o......o', '........', '........', '...pp...', '........', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 6110, name: 'Plaza Fiesta', kinds: 6, moves: 30, stars: [2000, 9000, 13000], collect: [], personalities: true, cafe: { serve: 6, slots: 3, patience: 9, size: [5, 7] }, layout: ['  ....  ', ' ...... ', '..p..p..', '........', '........', '........', '..p..p..', ' ...... ', '  ....  '] }),
];

// World 7: night falls. Only cells near recent matches (and lanterns) are lit.
const FIREFLY_NIGHT: LevelDef[] = [
  L({ id: 0, seed: 7101, name: 'Dusk', kinds: 5, moves: 22, stars: [5000, 10000, 15000], collect: [], personalities: true, night: true, layout: ['........', '.l....l.', '........', '........', '........', '........', '........', '.l....l.', '........'] }),
  L({ id: 0, seed: 7102, name: 'Lantern Lane', kinds: 5, moves: 22, stars: [2000, 9000, 13000], collect: [{ kind: 0, count: 25 }], personalities: true, night: true, layout: ['........', '...l....', '........', '......l.', '........', '.l......', '........', '....l...', '........'] }),
  L({ id: 0, seed: 7103, name: 'Moonlit Café', kinds: 5, moves: 24, stars: [1500, 9000, 13000], collect: [], personalities: true, night: true, cafe: { serve: 5, slots: 2, patience: 10, size: [7, 9] }, layout: ['........', '........', '..l..l..', '........', '........', '........', '..l..l..', '........', '........'] }),
  L({ id: 0, seed: 7104, name: 'Glow Sand', kinds: 5, moves: 24, stars: [2000, 8000, 12000], collect: [], personalities: true, night: true, layout: ['ssssssss', 'sl....ls', '........', '........', '........', '........', '........', 'sl....ls', 'ssssssss'] }),
  L({ id: 0, seed: 7105, name: 'Firefly Piñata', kinds: 5, moves: 24, stars: [2000, 8000, 12000], collect: [], personalities: true, night: true, layout: ['........', '.l....l.', '........', '...p....', '........', '....p...', '........', '.l....l.', '........'] }),
  L({ id: 0, seed: 7106, name: 'Night Harvest', kinds: 5, moves: 24, stars: [2000, 9000, 13000], collect: [], golden: 14, personalities: true, night: true, ripen: { chance: 0.18 }, layout: ['........', '..l..l..', '........', '........', '........', '........', '........', '..l..l..', '........'] }),
  L({ id: 0, seed: 7107, name: 'Starry Ice', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, night: true, layout: ['........', '.l....l.', '..iiii..', '..iiii..', '........', '..iiii..', '........', '.l....l.', '........'] }),
  L({ id: 0, seed: 7108, name: 'Midnight Tide', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, night: true, tide: { start: 1, every: 5, max: 6 }, layout: ['........', '.l....l.', 'ssssssss', 'SSSSSSSS', '........', '...ll...', 'ssssssss', '........', '........'] }),
  L({ id: 0, seed: 7109, name: 'Owl Hill', kinds: 5, moves: 28, stars: [3000, 9000, 13000], collect: [], coconuts: 2, maxCoconuts: 2, personalities: true, night: true, tilt: true, layout: ['o......o', '........', '.l....l.', '........', '........', '........', '.l....l.', '........', '........'] }),
  L({ id: 0, seed: 7110, name: 'Firefly Fiesta', kinds: 6, moves: 30, stars: [2000, 9000, 13000], collect: [], personalities: true, night: true, cafe: { serve: 6, slots: 2, patience: 10, size: [7, 9] }, layout: ['  ....  ', ' .l..l. ', '........', '...pp...', '........', '........', '........', ' .l..l. ', '  ....  '] }),
];

// World 8: conveyor belts slide their rows one step after every move.
const CARNIVAL_PIER: LevelDef[] = [
  L({ id: 0, seed: 8101, name: 'All Aboard', kinds: 5, moves: 22, stars: [5000, 10000, 15000], collect: [], personalities: true, conveyors: [{ row: 4, dir: 1 }] }),
  L({ id: 0, seed: 8102, name: 'Two-Way Ride', kinds: 5, moves: 22, stars: [2000, 9000, 13000], collect: [{ kind: 1, count: 25 }], personalities: true, conveyors: [{ row: 2, dir: 1 }, { row: 6, dir: -1 }] }),
  L({ id: 0, seed: 8103, name: 'Sushi-Belt Café', kinds: 5, moves: 24, stars: [1500, 9000, 13000], collect: [], personalities: true, cafe: { serve: 8, slots: 2, patience: 7, size: [9, 11] }, conveyors: [{ row: 3, dir: 1 }, { row: 5, dir: 1 }] }),
  L({ id: 0, seed: 8104, name: 'Pier Sand', kinds: 5, moves: 24, stars: [2000, 8000, 12000], collect: [], personalities: true, conveyors: [{ row: 4, dir: -1 }], layout: ['........', '........', 'SSSSSSSS', 'SSSSSSSS', '........', 'SSSSSSSS', 'SSSSSSSS', '........', '........'] }),
  L({ id: 0, seed: 8105, name: 'Prize Piñatas', kinds: 5, moves: 24, stars: [2000, 8000, 12000], collect: [], personalities: true, conveyors: [{ row: 1, dir: 1 }, { row: 7, dir: -1 }], layout: ['........', '........', '........', '.p....p.', '........', '.p....p.', '........', '........', '........'] }),
  L({ id: 0, seed: 8106, name: 'Carousel', kinds: 5, moves: 24, stars: [2000, 9000, 13000], collect: [], golden: 12, personalities: true, ripen: { chance: 0.15 }, conveyors: [{ row: 2, dir: 1 }, { row: 4, dir: -1 }, { row: 6, dir: 1 }] }),
  L({ id: 0, seed: 8107, name: 'Ice Cream Belt', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, conveyors: [{ row: 4, dir: 1 }], layout: ['........', '.iiiiii.', '........', '........', '........', '........', '........', '.iiiiii.', '........'] }),
  L({ id: 0, seed: 8108, name: 'Boardwalk Tide', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, tide: { start: 1, every: 5, max: 6 }, conveyors: [{ row: 3, dir: -1 }], layout: ['........', '........', '........', 'ssssssss', 'SSSSSSSS', 'SSSSSSSS', '........', '........', '........'] }),
  L({ id: 0, seed: 8109, name: 'Coconut Shy', kinds: 5, moves: 28, stars: [3000, 9000, 13000], collect: [], coconuts: 3, maxCoconuts: 2, personalities: true, conveyors: [{ row: 4, dir: 1 }], layout: ['.o....o.', '........', '........', '........', '........', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 8110, name: 'Carnival Fiesta', kinds: 6, moves: 30, stars: [2000, 9000, 13000], collect: [], personalities: true, cafe: { serve: 6, slots: 3, patience: 9, size: [5, 7] }, conveyors: [{ row: 2, dir: 1 }, { row: 6, dir: -1 }], layout: ['........', '........', '........', '...pp...', '........', '........', '........', '........', '........'] }),
];

// World 9: lava creeps into a neighbouring fruit every move you don't cool some.
const VOLCANO_VALLEY: LevelDef[] = [
  L({ id: 0, seed: 9111, name: 'Warm Rocks', kinds: 5, moves: 22, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '........', '........', '........', '...vv...', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 9112, name: 'Twin Vents', kinds: 5, moves: 22, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '........', '.v....v.', '........', '........', '........', '.v....v.', '........', '........'] }),
  L({ id: 0, seed: 9113, name: 'Lava Café', kinds: 5, moves: 24, stars: [1500, 9000, 13000], collect: [], personalities: true, cafe: { serve: 5, slots: 2, patience: 10, size: [7, 9] }, layout: ['........', '........', '........', '........', '........', '........', '...vv...', '........', '........'] }),
  L({ id: 0, seed: 9114, name: 'Ash Beach', kinds: 5, moves: 24, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['ssssssss', 'ss....ss', '........', '...v....', '........', '....v...', '........', 'ss....ss', 'ssssssss'] }),
  L({ id: 0, seed: 9115, name: 'Fire & Ice', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '.iiiiii.', '........', '...vv...', '........', '........', '.iiiiii.', '........', '........'] }),
  L({ id: 0, seed: 9116, name: 'Hot Piñatas', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '........', '..p..p..', '........', '...vv...', '........', '..p..p..', '........', '........'] }),
  L({ id: 0, seed: 9117, name: 'Magma Slope', kinds: 5, moves: 26, stars: [3000, 9000, 13000], collect: [], coconuts: 2, maxCoconuts: 2, personalities: true, tilt: true, layout: ['o......o', '........', '........', '........', '...vv...', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 9118, name: 'Ember Night', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, night: true, layout: ['........', '.l....l.', '........', '...v....', '........', '....v...', '........', '.l....l.', '........'] }),
  L({ id: 0, seed: 9119, name: 'Lava Belt', kinds: 5, moves: 28, stars: [2000, 8000, 12000], collect: [], personalities: true, conveyors: [{ row: 2, dir: 1 }, { row: 6, dir: -1 }], layout: ['........', '..v..v..', '........', '...v....', '........', '....v...', '........', '..v..v..', '........'] }),
  L({ id: 0, seed: 9120, name: 'Volcano Fiesta', kinds: 6, moves: 30, stars: [2000, 9000, 13000], collect: [], golden: 10, personalities: true, ripen: { chance: 0.12 }, layout: ['   ..   ', '  ....  ', ' ...... ', '...vv...', '........', '..p..p..', '........', '........', '........'] }),
];

// World 10: the Grand Fiesta mixes everything.
const GRAND_FIESTA: LevelDef[] = [
  L({ id: 0, seed: 1001, name: 'Opening Parade', kinds: 5, moves: 26, stars: [1500, 9000, 13000], collect: [], personalities: true, cafe: { serve: 5, slots: 2, patience: 9, size: [7, 9] }, ripen: { chance: 0.12 }, conveyors: [{ row: 4, dir: 1 }] }),
  L({ id: 0, seed: 1002, name: 'Lantern Piñatas', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true, night: true, layout: ['........', '.l....l.', '..p..p..', '........', '........', '........', '..p..p..', '.l....l.', '........'] }),
  L({ id: 0, seed: 1003, name: 'Frozen Lava', kinds: 5, moves: 28, stars: [2000, 8000, 12000], collect: [], personalities: true, layout: ['........', '..iiii..', '.i....i.', '.i.vv.i.', '.i....i.', '..iiii..', '........', '........', '........'] }),
  L({ id: 0, seed: 1004, name: 'Tidal Carnival', kinds: 5, moves: 28, stars: [3000, 9000, 13000], collect: [], coconuts: 2, maxCoconuts: 2, personalities: true, tide: { start: 1, every: 6, max: 6 }, conveyors: [{ row: 3, dir: 1 }], layout: ['.o....o.', '........', '........', '........', 'ssssssss', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 1005, name: 'Midnight Café', kinds: 5, moves: 28, stars: [1500, 9000, 13000], collect: [], personalities: true, night: true, cafe: { serve: 6, slots: 3, patience: 10, size: [5, 7] }, layout: ['........', '.l....l.', '........', '........', '...ll...', '........', '........', '.l....l.', '........'] }),
  L({ id: 0, seed: 1006, name: 'Tilt-a-Whirl', kinds: 5, moves: 28, stars: [3000, 9000, 13000], collect: [], coconuts: 3, maxCoconuts: 2, personalities: true, tilt: true, layout: ['o......o', '........', '..p..p..', '........', '........', '........', '..iiii..', '........', '........'] }),
  L({ id: 0, seed: 1007, name: 'Golden Volcano', kinds: 5, moves: 28, stars: [2000, 9000, 13000], collect: [], golden: 12, personalities: true, ripen: { chance: 0.18 }, layout: ['........', '........', '...v....', '........', 'ssssssss', '........', '....v...', '........', '........'] }),
  L({ id: 0, seed: 1008, name: 'Fireworks', kinds: 6, moves: 30, stars: [2000, 9000, 13000], collect: [], personalities: true, conveyors: [{ row: 1, dir: 1 }, { row: 7, dir: -1 }], layout: ['........', '........', '.p.pp.p.', '........', '........', '........', '.p.pp.p.', '........', '........'] }),
  L({ id: 0, seed: 1009, name: 'Last Dance', kinds: 6, moves: 32, stars: [2000, 9000, 13000], collect: [], personalities: true, night: true, tide: { start: 1, every: 6, max: 6 }, layout: ['   ..   ', ' .l..l. ', '.iiiiii.', '........', '...vv...', '........', '........', '........', '........'] }),
  L({ id: 0, seed: 1010, name: 'Grand Fiesta!', kinds: 6, moves: 34, stars: [2000, 9000, 13000], collect: [], personalities: true, cafe: { serve: 6, slots: 2, patience: 10, size: [7, 9] }, ripen: { chance: 0.12 }, conveyors: [{ row: 4, dir: 1 }], layout: ['  ....  ', ' .p..p. ', '..iiii..', 's......s', 'ss....ss', 's......s', '..v..v..', ' ...... ', '  ....  '] }),
];

/** Zig-zag of 10 stops up an island map (% of width, % of height), bottom to top. */
const ZIGZAG: [number, number][] = [
  [30, 88], [68, 81], [36, 73], [70, 65], [32, 57], [66, 49], [34, 41], [68, 33], [38, 25], [58, 16],
];

export const WORLDS: WorldDef[] = [
  { id: 1, name: 'Sunny Isle', blurb: 'Open your beach café!', map: 'bg-map', spots: ZIGZAG, levels: SUNNY_ISLE },
  { id: 2, name: 'Coconut Cove', blurb: 'Sand, coconuts and rising tides', map: 'bg-map-2', spots: ZIGZAG, levels: COCONUT_COVE },
  { id: 3, name: 'Berry Mountain', blurb: 'Tilt the island to roll the fruit', map: 'bg-map-3', spots: ZIGZAG, levels: BERRY_MOUNTAIN },
  { id: 4, name: 'Citrus Grove', blurb: 'Every fruit has a personality', map: 'bg-map-4', spots: ZIGZAG, levels: CITRUS_GROVE },
  { id: 5, name: 'Frosty Falls', blurb: 'Thaw the frozen fruit', map: 'bg-map-5', spots: ZIGZAG, levels: FROSTY_FALLS },
  { id: 6, name: 'Piñata Plaza', blurb: 'Smash the piñatas!', map: 'bg-map-6', spots: ZIGZAG, levels: PINATA_PLAZA },
  { id: 7, name: 'Firefly Night', blurb: 'Light up the dark', map: 'bg-map-7', spots: ZIGZAG, levels: FIREFLY_NIGHT },
  { id: 8, name: 'Carnival Pier', blurb: 'Ride the conveyor belts', map: 'bg-map-8', spots: ZIGZAG, levels: CARNIVAL_PIER },
  { id: 9, name: 'Volcano Valley', blurb: 'Cool the creeping lava', map: 'bg-map-9', spots: ZIGZAG, levels: VOLCANO_VALLEY },
  { id: 10, name: 'Grand Fiesta', blurb: 'Everything at once!', map: 'bg-map-10', spots: ZIGZAG, levels: GRAND_FIESTA },
];

export const LEVELS: LevelDef[] = WORLDS.flatMap((w) => w.levels);

// Level numbers run 1..N in world order (seeds are fixed per level, so boards stay the same).
LEVELS.forEach((l, i) => (l.id = i + 1));

// Moves and star scores chosen by the auto-tuner (scripts/tune.ts) override the drafts above.
for (const [id, t] of Object.entries(tuning as unknown as Record<string, { moves: number; stars: [number, number, number] }>)) {
  const l = LEVELS[Number(id) - 1];
  if (l) Object.assign(l, t);
}

export const worldOf = (levelId: number): WorldDef => WORLDS.find((w) => w.levels.some((l) => l.id === levelId))!;

/** Saves made when worlds had 8 levels map onto the new 10-level worlds. */
export const migrateOldLevelId = (oldId: number): number => oldId + 2 * Math.floor((oldId - 1) / 8);
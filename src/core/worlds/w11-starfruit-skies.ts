// World 11: floating cloud islands. Gaps split the board and wind rows (conveyors) carry
// fruit across them. Added in update 1.1 (2026-11-03).
import type { WorldDef } from '../levels';
import { L, ZIGZAG } from '../levelKit';

// Fruit kinds: 0 Strawberry, 1 Orange, 2 Lemon, 3 Kiwi, 4 Grape, 5 Blueberry (needs kinds: 6)
export const STARFRUIT_SKIES: WorldDef = {
  id: 11,
  name: 'Starfruit Skies',
  blurb: 'Ride the wind between floating islands',
  map: 'bg-map-11',
  spots: ZIGZAG,
  levels: [
    L({
      id: 0, seed: 11101, name: 'Cloud Hop', kinds: 5, moves: 24, stars: [2000, 9000, 13000], collect: [{ kind: 4, count: 24 }], personalities: true,
      conveyors: [{ row: 4, dir: 1 }],
      layout: ['...  ...', '...  ...', '...  ...', '........', '........', '........', '...  ...', '...  ...', '...  ...'],
    }),
    L({
      id: 0, seed: 11102, name: 'Windy Café', kinds: 5, moves: 24, stars: [1500, 9000, 13000], collect: [], personalities: true,
      cafe: { serve: 8, slots: 2, patience: 8, size: [9, 11] },
      conveyors: [{ row: 4, dir: 1 }],
      layout: [' ...... ', '........', '........', '........', '........', '........', '........', '........', ' ...... '],
    }),
    L({
      id: 0, seed: 11103, name: 'Sky Coconuts', kinds: 5, moves: 28, stars: [3000, 9000, 13000], collect: [], coconuts: 4, maxCoconuts: 2, personalities: true, tilt: true,
      layout: ['o..  ..o', '...  ...', '...  ...', '........', '........', '........', '...  ...', '...  ...', '...  ...'],
    }),
    L({
      id: 0, seed: 11104, name: 'Frozen Clouds', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true,
      conveyors: [{ row: 4, dir: -1 }],
      layout: [' ...... ', '.iiiiii.', '.i....i.', '........', '........', '........', '.i....i.', '.iiiiii.', ' ...... '],
    }),
    L({
      id: 0, seed: 11105, name: 'Kite Festival', kinds: 5, moves: 26, stars: [2000, 8000, 12000], collect: [], personalities: true,
      conveyors: [{ row: 3, dir: 1 }, { row: 5, dir: -1 }],
      layout: ['........', '..p..p..', '........', '........', '.p.  .p.', '........', '........', '..p..p..', '........'],
    }),
    L({
      id: 0, seed: 11106, name: 'Starry Skies', kinds: 5, moves: 26, stars: [2000, 9000, 13000], collect: [{ kind: 3, count: 24 }], personalities: true, night: true,
      layout: ['.l.  .l.', '...  ...', '........', '........', '...ll...', '........', '........', '...  ...', '.l.  .l.'],
    }),
    L({
      id: 0, seed: 11107, name: 'Golden Sunrise', kinds: 5, moves: 26, stars: [2000, 9000, 13000], collect: [], golden: 14, personalities: true, ripen: { chance: 0.18 },
      conveyors: [{ row: 5, dir: -1 }],
      layout: ['  ....  ', ' ...... ', '........', '........', '........', '........', '........', '........', '........'],
    }),
    L({
      id: 0, seed: 11108, name: 'Rainbow Bridge', kinds: 6, moves: 28, stars: [1500, 9000, 13000], collect: [], personalities: true,
      cafe: { serve: 7, slots: 3, patience: 9, size: [5, 7] },
      conveyors: [{ row: 1, dir: 1 }],
      layout: ['........', '........', '........', '...  ...', '...  ...', '...  ...', '...  ...', '...  ...', '...  ...'],
    }),
    L({
      id: 0, seed: 11109, name: 'Island Chain', kinds: 5, moves: 30, stars: [3000, 9000, 13000], collect: [], coconuts: 5, maxCoconuts: 2, personalities: true, tilt: true,
      conveyors: [{ row: 4, dir: 1 }],
      layout: ['o. .. .o', '.. .. ..', '.. .. ..', '........', '........', '........', '.. .. ..', '.. .. ..', '.. .. ..'],
    }),
    L({
      id: 0, seed: 11110, name: 'Sky Fiesta', kinds: 6, moves: 30, stars: [1500, 9000, 13000], collect: [], personalities: true,
      cafe: { serve: 6, slots: 2, patience: 10, size: [7, 9] },
      conveyors: [{ row: 4, dir: 1 }],
      layout: ['   ..   ', '  ....  ', ' .p..p. ', '........', '........', '.iiiiii.', ' ...... ', '  ....  ', '   ..   '],
    }),
  ],
};

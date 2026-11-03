/** Helpers for writing level data. World files in src/core/worlds/ use these.
 *  See docs/ADDING-LEVELS.md for how to add a new world. */
import type { LevelDef } from './levels';

export type Def = Omit<LevelDef, 'cols' | 'rows' | 'seed'> & { cols?: number; rows?: number; seed?: number };

/** Fill in board size from the layout (default 8×9). Give every level its own fixed `seed`. */
export const L = (d: Def): LevelDef => ({
  cols: d.layout?.[0].length ?? 8,
  rows: d.layout?.length ?? 9,
  seed: d.id * 101,
  ...d,
});

/** Zig-zag of 10 stops up an island map (% of width, % of height), bottom to top. */
export const ZIGZAG: [number, number][] = [
  [30, 88], [68, 81], [36, 73], [70, 65], [32, 57], [66, 49], [34, 41], [68, 33], [38, 25], [58, 16],
];

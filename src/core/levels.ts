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
}

// Fruit kinds: 0 Strawberry, 1 Orange, 2 Lemon, 3 Kiwi, 4 Grape, 5 Blueberry
export const LEVELS: LevelDef[] = [
  { id: 1, name: 'Sunny Start', cols: 8, rows: 9, kinds: 5, moves: 15, seed: 101, stars: [4000, 9000, 18000], collect: [] },
  { id: 2, name: 'Berry Picking', cols: 8, rows: 9, kinds: 5, moves: 20, seed: 202, stars: [1500, 9000, 14000], collect: [{ kind: 0, count: 35 }] },
  { id: 3, name: 'Citrus Grove', cols: 8, rows: 9, kinds: 5, moves: 20, seed: 303, stars: [1500, 9500, 15000], collect: [{ kind: 1, count: 35 }, { kind: 2, count: 35 }] },
  { id: 4, name: 'Kiwi Cove', cols: 8, rows: 9, kinds: 5, moves: 20, seed: 404, stars: [1500, 9500, 16000], collect: [{ kind: 3, count: 40 }] },
  { id: 5, name: 'Grape Escape', cols: 8, rows: 9, kinds: 6, moves: 22, seed: 505, stars: [3500, 7000, 12000], collect: [] },
  { id: 6, name: 'Blue Lagoon', cols: 8, rows: 9, kinds: 6, moves: 24, seed: 606, stars: [1500, 7500, 11000], collect: [{ kind: 5, count: 28 }, { kind: 4, count: 28 }] },
];

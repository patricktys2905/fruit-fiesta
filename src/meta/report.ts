/** What happened in one level attempt: feeds daily quests and achievements. */
export interface LevelReport {
  levelId: number;
  won: boolean;
  stars: number;
  score: number;
  movesLeft: number;
  jets: number;
  bees: number;
  bursts: number;
  smoothies: number;
  combos: number;
  maxChain: number;
  fruit: number;
  fruitByKind: number[];
  sand: number;
  coconuts: number;
  golden: number;
  customers: number;
  walkouts: number;
  ice: number;
  pinatas: number;
  lava: number;
}

export const emptyReport = (levelId: number): LevelReport => ({
  levelId, won: false, stars: 0, score: 0, movesLeft: 0,
  jets: 0, bees: 0, bursts: 0, smoothies: 0, combos: 0, maxChain: 0,
  fruit: 0, fruitByKind: [0, 0, 0, 0, 0, 0], sand: 0, coconuts: 0, golden: 0, customers: 0, walkouts: 0, ice: 0, pinatas: 0, lava: 0,
});

export const specialsIn = (r: LevelReport) => r.jets + r.bees + r.bursts + r.smoothies;

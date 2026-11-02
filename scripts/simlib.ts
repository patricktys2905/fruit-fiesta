/** Bot players for balancing levels. They use the real game engine. */
import { Board, Cell, Gravity, Tile } from '../src/core/board';
import { playMove, playTilt, ClearStep, MoveResult } from '../src/core/engine';
import { LevelDef, createBoard, hasSand, hasIce } from '../src/core/levels';
import { mulberry32 } from '../src/core/rng';
import { starsFor, LEFTOVER_MOVE_BONUS } from '../src/core/scoring';
import { Cafe } from '../src/core/orders';

export function cloneBoard(b: Board, seed: number): Board {
  const c = new Board(b.cols, b.rows, b.kinds, mulberry32(seed));
  c.grid = b.grid.map((row) => row.map((t) => (t ? ({ ...t } as Tile) : null)));
  c.mask = b.mask;
  c.sand = b.sand.map((row) => [...row]);
  c.puddle = b.puddle.map((row) => [...row]);
  c.coconutsToSpawn = b.coconutsToSpawn;
  c.maxCoconuts = b.maxCoconuts;
  c.unripeChance = b.unripeChance;
  c.ripenTurns = b.ripenTurns;
  c.gravity = b.gravity;
  c.tide = b.tide;
  c.tideEvery = b.tideEvery;
  c.tideCounter = b.tideCounter;
  c.tideMax = b.tideMax;
  c.personalities = b.personalities;
  return c;
}

export interface PlayResult {
  won: boolean;
  score: number;
  stars: number;
  specialsMade: number;
  sandLeft: number;
}

/** Play one game. `smart` looks one move ahead; otherwise it plays randomly (like a casual player). */
export function play(level: LevelDef, seed: number, smart: boolean): PlayResult {
  const board = createBoard(level, seed * 7919 + level.id);
  const pick = mulberry32(seed * 7 + 1);
  let score = 0;
  const collected = Array(6).fill(0);
  let coconuts = 0;
  let golden = 0;
  let moves = level.moves;
  let flooded = false;
  const cafe = level.cafe ? new Cafe(level.cafe, level.kinds, level.seed + seed) : null;
  const wanted = () => (cafe ? cafe.wanted() : level.collect.filter((g) => collected[g.kind] < g.count).map((g) => g.kind));
  const needSand = hasSand(level);
  const needIce = hasIce(level);
  const goalsDone = () =>
    level.collect.every((g) => collected[g.kind] >= g.count) &&
    (!needSand || board.sandLeft() === 0) &&
    (!needIce || board.iceLeft() === 0) &&
    coconuts >= (level.coconuts ?? 0) &&
    golden >= (level.golden ?? 0) &&
    (!cafe || cafe.done);
  const hasGoals = level.collect.length > 0 || needSand || needIce || !!level.coconuts || !!cafe || !!level.golden;
  const ctx = { wantedKinds: wanted, wantSand: () => needSand };
  let specialsMade = 0;

  type Opt = { swap?: [Cell, Cell]; tilt?: Gravity };
  while (moves > 0) {
    const options: Opt[] = board.allMoves().map((m) => ({ swap: m }));
    const tilts: Opt[] = level.tilt ? (['down', 'up', 'left', 'right'] as Gravity[]).filter((g) => g !== board.gravity).map((g) => ({ tilt: g })) : [];
    const run = (b: Board, o: Opt): MoveResult => (o.tilt ? playTilt(b, o.tilt, ctx) : playMove(b, o.swap![0], o.swap![1], ctx));
    if (!options.length && !tilts.length) { board.shuffle(); continue; }
    let move: Opt = tilts.length && (pick() < 0.08 || !options.length) ? tilts[Math.floor(pick() * tilts.length)] : options[Math.floor(pick() * options.length)];
    if (smart) {
      let best = -Infinity;
      for (const m of [...options, ...tilts]) {
        const trial = cloneBoard(board, seed + moves);
        const r = run(trial, m);
        const w = new Set(wanted());
        let v = r.score + r.collected.reduce((s, n, k) => s + (w.has(k) ? n * 60 : 0), 0) + r.sandCleared * 150 + r.iceCracked * 170 + r.coconuts * 1500 - trial.tide * 500 - (r.flooded ? 1e6 : 0);
        if (level.coconuts)
          for (let rr = 0; rr < trial.rows; rr++)
            for (let cc = 0; cc < trial.cols; cc++)
              if (trial.grid[rr][cc]?.kind === -2) {
                const g = trial.gravity;
                v += (g === 'down' ? rr : g === 'up' ? trial.rows - 1 - rr : g === 'right' ? cc : trial.cols - 1 - cc) * 40;
              }
        if (v > best) { best = v; move = m; }
      }
    }
    const res = run(board, move);
    if (res.flooded) { flooded = true; break; }
    moves--;
    score += res.score;
    coconuts += res.coconuts;
    for (const st of res.steps) {
      if (st.type !== 'clear') continue;
      golden += st.cleared.filter((c) => c.golden).length;
      cafe?.feed(st.cleared);
    }
    if (cafe) {
      const before = cafe.tips;
      if (res.sweet) cafe.soothe(res.sweet);
      cafe.tick();
      score += cafe.tips - before;
    }
    res.collected.forEach((n, k) => (collected[k] += n));
    specialsMade += res.steps.filter((s): s is ClearStep => s.type === 'clear').reduce((n, s) => n + s.created.length, 0);
    if (hasGoals && goalsDone() && score >= level.stars[0]) break;
  }
  const won = !flooded && goalsDone() && score >= level.stars[0];
  if (won) score += moves * LEFTOVER_MOVE_BONUS;
  return { won, score, stars: won ? starsFor(score, level.stars) : 0, specialsMade, sandLeft: board.sandLeft() };
}

export interface Summary {
  randWin: number;
  smartWin: number;
  rand3: number;
  smart3: number;
  /** Suggested 2★ / 3★ from winning games. */
  suggest: [number, number];
  minWinScore: number;
}

export function summarize(level: LevelDef, randRuns: number, smartRuns: number): Summary {
  const r = Array.from({ length: randRuns }, (_, i) => play(level, i + 1, false));
  const s = Array.from({ length: smartRuns }, (_, i) => play(level, i + 1000, true));
  const wins = [...r, ...s].filter((x) => x.won).map((x) => x.score).sort((a, b) => a - b);
  const wp = (p: number) => wins[Math.floor(p * (wins.length - 1))] ?? 0;
  const round = (n: number) => Math.max(500, Math.round(n / 500) * 500);
  return {
    randWin: r.filter((x) => x.won).length / randRuns,
    smartWin: s.filter((x) => x.won).length / smartRuns,
    rand3: r.filter((x) => x.stars === 3).length / randRuns,
    smart3: s.filter((x) => x.stars === 3).length / smartRuns,
    suggest: [round(wp(0.45)), round(wp(0.8))],
    minWinScore: wins[0] ?? 0,
  };
}

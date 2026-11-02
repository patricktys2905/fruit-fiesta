/** Level balance simulator: plays each level many times with bots and reports
 *  win rate and score spread. Uses the real game engine. Run with `npm run sim`. */
import { Board, Tile } from '../src/core/board';
import { playMove, ClearStep } from '../src/core/engine';
import { LEVELS, LevelDef } from '../src/core/levels';
import { mulberry32 } from '../src/core/rng';
import { starsFor, LEFTOVER_MOVE_BONUS } from '../src/core/scoring';

function cloneBoard(b: Board, seed: number): Board {
  const c = new Board(b.cols, b.rows, b.kinds, mulberry32(seed));
  c.grid = b.grid.map((row) => row.map((t) => (t ? ({ ...t } as Tile) : null)));
  return c;
}

function play(level: LevelDef, seed: number, smart: boolean) {
  const board = new Board(level.cols, level.rows, level.kinds, mulberry32(seed));
  const pick = mulberry32(seed * 7 + 1);
  board.fillInitial();
  let score = 0;
  const collected = Array(6).fill(0);
  let moves = level.moves;
  const wanted = () => level.collect.filter((g) => collected[g.kind] < g.count).map((g) => g.kind);
  const goalsDone = () => level.collect.every((g) => collected[g.kind] >= g.count);
  let specialsMade = 0;

  while (moves > 0) {
    const options = board.allMoves();
    let move = options[Math.floor(pick() * options.length)];
    if (smart) {
      let best = -Infinity;
      for (const m of options) {
        const trial = cloneBoard(board, seed + moves);
        const r = playMove(trial, m[0], m[1], { wantedKinds: wanted });
        const w = new Set(wanted());
        const v = r.score + r.collected.reduce((s, n, k) => s + (w.has(k) ? n * 60 : 0), 0);
        if (v > best) { best = v; move = m; }
      }
    }
    const res = playMove(board, move[0], move[1], { wantedKinds: wanted });
    moves--;
    score += res.score;
    res.collected.forEach((n, k) => (collected[k] += n));
    specialsMade += res.steps.filter((s): s is ClearStep => s.type === 'clear').reduce((n, s) => n + s.created.length, 0);
    if (level.collect.length && goalsDone() && score >= level.stars[0]) break;
  }
  score += moves * LEFTOVER_MOVE_BONUS;
  const won = goalsDone() && score >= level.stars[0];
  return { won, score, stars: won ? starsFor(score, level.stars) : 0, specialsMade };
}

for (const level of LEVELS) {
  for (const smart of [false, true]) {
    const RUNS = smart ? 120 : 400;
    const res = Array.from({ length: RUNS }, (_, i) => play(level, i + 1, smart));
    const wins = res.filter((r) => r.won).length;
    const scores = res.map((r) => r.score).sort((a, b) => a - b);
    const pct = (p: number) => scores[Math.floor(p * (scores.length - 1))];
    const s3 = res.filter((r) => r.stars === 3).length;
    const sp = res.reduce((n, r) => n + r.specialsMade, 0) / RUNS;
    console.log(
      `L${level.id} ${level.name.padEnd(14)} ${smart ? 'smart ' : 'random'} win ${(100 * wins / RUNS).toFixed(0).padStart(3)}%  3★ ${(100 * s3 / RUNS).toFixed(0).padStart(3)}%  specials/lvl ${sp.toFixed(1).padStart(4)}  score p25/p50/p90 ${pct(.25)}/${pct(.5)}/${pct(.9)}`,
    );
  }
}

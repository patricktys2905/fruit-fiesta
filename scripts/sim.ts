/** Level balance simulator: plays each level many times with bots and reports
 *  win rate, star rate and a suggested star curve. Uses the real game engine.
 *  Run with `npm run sim` or `npm run sim -- 9 16` for a range of level ids. */
import { Board, Tile } from '../src/core/board';
import { playMove, ClearStep } from '../src/core/engine';
import { LEVELS, LevelDef, createBoard, hasSand } from '../src/core/levels';
import { mulberry32 } from '../src/core/rng';
import { starsFor, LEFTOVER_MOVE_BONUS } from '../src/core/scoring';

function cloneBoard(b: Board, seed: number): Board {
  const c = new Board(b.cols, b.rows, b.kinds, mulberry32(seed));
  c.grid = b.grid.map((row) => row.map((t) => (t ? ({ ...t } as Tile) : null)));
  c.mask = b.mask;
  c.sand = b.sand.map((row) => [...row]);
  c.coconutsToSpawn = b.coconutsToSpawn;
  c.maxCoconuts = b.maxCoconuts;
  return c;
}

function play(level: LevelDef, seed: number, smart: boolean) {
  const board = createBoard(level, seed * 7919 + level.id);
  const pick = mulberry32(seed * 7 + 1);
  let score = 0;
  const collected = Array(6).fill(0);
  let coconuts = 0;
  let moves = level.moves;
  const wanted = () => level.collect.filter((g) => collected[g.kind] < g.count).map((g) => g.kind);
  const needSand = hasSand(level);
  const goalsDone = () =>
    level.collect.every((g) => collected[g.kind] >= g.count) &&
    (!needSand || board.sandLeft() === 0) &&
    coconuts >= (level.coconuts ?? 0);
  const hasGoals = level.collect.length > 0 || needSand || !!level.coconuts;
  let specialsMade = 0;

  while (moves > 0) {
    const options = board.allMoves();
    let move = options[Math.floor(pick() * options.length)];
    if (smart) {
      let best = -Infinity;
      for (const m of options) {
        const trial = cloneBoard(board, seed + moves);
        const r = playMove(trial, m[0], m[1], { wantedKinds: wanted, wantSand: () => needSand });
        const w = new Set(wanted());
        // value: score, goal fruit, sand, coconuts, and how low coconuts sit
        let v = r.score + r.collected.reduce((s, n, k) => s + (w.has(k) ? n * 60 : 0), 0) + r.sandCleared * 150 + r.coconuts * 1500;
        if (level.coconuts) for (let rr = 0; rr < trial.rows; rr++) for (let cc = 0; cc < trial.cols; cc++) if (trial.grid[rr][cc]?.kind === -2) v += rr * 40;
        if (v > best) { best = v; move = m; }
      }
    }
    const res = playMove(board, move[0], move[1], { wantedKinds: wanted, wantSand: () => needSand });
    moves--;
    score += res.score;
    coconuts += res.coconuts;
    res.collected.forEach((n, k) => (collected[k] += n));
    specialsMade += res.steps.filter((s): s is ClearStep => s.type === 'clear').reduce((n, s) => n + s.created.length, 0);
    if (hasGoals && goalsDone() && score >= level.stars[0]) break;
  }
  const won = goalsDone() && score >= level.stars[0];
  if (won) score += moves * LEFTOVER_MOVE_BONUS;
  return { won, score, stars: won ? starsFor(score, level.stars) : 0, specialsMade, sandLeft: board.sandLeft(), coconuts };
}

const [from, to] = [Number(process.argv[2] ?? 1), Number(process.argv[3] ?? LEVELS.length)];
for (const level of LEVELS.filter((l) => l.id >= from && l.id <= to)) {
  const out: string[] = [];
  const all: { won: boolean; score: number }[] = [];
  for (const smart of [false, true]) {
    const RUNS = smart ? 60 : 200;
    const res = Array.from({ length: RUNS }, (_, i) => play(level, i + 1, smart));
    all.push(...res);
    const wins = res.filter((r) => r.won).length;
    const s3 = res.filter((r) => r.stars === 3).length;
    const scores = res.map((r) => r.score).sort((a, b) => a - b);
    const pct = (p: number) => scores[Math.floor(p * (scores.length - 1))];
    const sand = res.reduce((n, r) => n + r.sandLeft, 0) / RUNS;
    out.push(`${smart ? 'smart' : 'rand '} win ${String(Math.round((100 * wins) / RUNS)).padStart(3)}% 3★ ${String(Math.round((100 * s3) / RUNS)).padStart(3)}% p50 ${pct(0.5)}${hasSand(level) ? ` sandLeft ${sand.toFixed(1)}` : ''}`);
  }
  // Suggested curve from winning games: 2★ ≈ median win, 3★ ≈ 80th percentile win.
  const winScores = all.filter((r) => r.won).map((r) => r.score).sort((a, b) => a - b);
  const wp = (p: number) => winScores[Math.floor(p * (winScores.length - 1))] ?? 0;
  const round = (n: number) => Math.round(n / 500) * 500;
  console.log(`L${String(level.id).padStart(2)} ${level.name.padEnd(14)} | ${out.join(' | ')} | suggest 2★ ${round(wp(0.45))} 3★ ${round(wp(0.8))}`);
}

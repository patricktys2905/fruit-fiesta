/** Auto-tuner: adjusts each level's moves until bots hit the target difficulty for its
 *  world, then sets the star curve. Writes src/core/tuning.json.
 *  Run: npm run tune -- <fromId> <toId> */
import fs from 'node:fs';
import { LEVELS, WORLDS } from '../src/core/levels';
import { summarize } from './simlib';

const FILE = 'src/core/tuning.json';
const tuning: Record<string, { moves: number; stars: [number, number, number] }> = JSON.parse(fs.readFileSync(FILE, 'utf8') || '{}');

/** Target win rate for the look-ahead bot, by world: gently harder each world. */
const TARGET: Record<number, [number, number]> = {
  1: [0.95, 1.01], 2: [0.88, 0.99], 3: [0.86, 0.98], 4: [0.84, 0.96], 5: [0.82, 0.95],
  6: [0.8, 0.94], 7: [0.78, 0.93], 8: [0.76, 0.92], 9: [0.74, 0.91], 10: [0.72, 0.9],
};

/** Target win rate for a random ("casual") player, by world. */
const RAND: Record<number, [number, number]> = {
  1: [0.55, 0.85], 2: [0.3, 0.7], 3: [0.25, 0.65], 4: [0.22, 0.6], 5: [0.18, 0.55],
  6: [0.16, 0.5], 7: [0.14, 0.48], 8: [0.12, 0.45], 9: [0.1, 0.42], 10: [0.08, 0.4],
};
/** Levels never get shorter than this; short levels feel rushed. */
const MIN_MOVES = 16;
/** ...and never longer than this. */
const MAX_MOVES = 36;

const [from, to] = [Number(process.argv[2] ?? 1), Number(process.argv[3] ?? LEVELS.length)];
for (const level of LEVELS.filter((l) => l.id >= from && l.id <= to)) {
  const world = WORLDS.find((w) => w.levels.includes(level))!.id;
  const [lo, hi] = TARGET[world] ?? [0.75, 0.92];
  let [rlo, rhi] = RAND[world] ?? [0.15, 0.5];
  // Random play is hopeless at steering coconuts; people aim them, so ask less of the casual bot there.
  if (level.coconuts) rlo *= 0.4;
  level.moves = Math.min(level.moves, MAX_MOVES);
  let s = summarize(level, 50, 24);
  for (let i = 0; i < 8; i++) {
    if ((s.smartWin < lo || s.randWin < rlo) && level.moves < MAX_MOVES) level.moves = Math.min(MAX_MOVES, level.moves + (s.smartWin < lo - 0.2 || s.randWin < rlo - 0.15 ? 4 : 2));
    else if ((s.smartWin > hi || s.randWin > rhi) && level.moves - 2 >= MIN_MOVES) level.moves -= 2;
    else break;
    s = summarize(level, 50, 24);
  }  // Star curve: 1★ is just finishing the goals (kept low for goal levels), 2★/3★ from winning scores.
  const goalLevel = level.collect.length || level.cafe || level.coconuts || level.golden || level.layout?.some((r) => /[sSiI]/.test(r));
  const one = goalLevel ? Math.min(level.stars[0], Math.max(500, Math.floor(s.minWinScore / 500) * 500)) : level.stars[0];
  const two = Math.max(one + 500, s.suggest[0]);
  const three = Math.max(two + 1000, s.suggest[1]);
  level.stars = [one, two, three];
  tuning[level.id] = { moves: level.moves, stars: level.stars };
  fs.writeFileSync(FILE, JSON.stringify(tuning, null, 1));
  console.log(`L${String(level.id).padStart(3)} ${level.name.padEnd(16)} moves ${String(level.moves).padStart(2)} | smart ${(s.smartWin * 100).toFixed(0).padStart(3)}% rand ${(s.randWin * 100).toFixed(0).padStart(3)}% | stars ${level.stars.join('/')}`);
}

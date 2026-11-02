/** Level balance report: plays each level with bots and prints win rates and a
 *  suggested star curve. Run with `npm run sim` or `npm run sim -- 9 16`. */
import { LEVELS } from '../src/core/levels';
import { summarize } from './simlib';

const [from, to] = [Number(process.argv[2] ?? 1), Number(process.argv[3] ?? LEVELS.length)];
for (const level of LEVELS.filter((l) => l.id >= from && l.id <= to)) {
  const s = summarize(level, 120, 40);
  const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);
  console.log(
    `L${String(level.id).padStart(3)} ${level.name.padEnd(16)} moves ${String(level.moves).padStart(2)} | rand win ${pct(s.randWin)} 3★ ${pct(s.rand3)} | smart win ${pct(s.smartWin)} 3★ ${pct(s.smart3)} | stars ${level.stars.join('/')} | suggest 2★ ${s.suggest[0]} 3★ ${s.suggest[1]}`,
  );
}

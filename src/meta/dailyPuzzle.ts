/** Daily Puzzle: one new level each day, the same for everyone (built from the date).
 *  It remixes one of the tuned levels with a fresh board, so it's always fair. */
import { hashString, mulberry32, randInt } from '../core/rng';
import { LEVELS, LevelDef } from '../core/levels';

/** Daily puzzles have ids from here up (never clash with the 100 campaign levels). */
export const DAILY_ID = 9000;

/** Which campaign levels can be remixed: a mix of everything, avoiding the very hardest. */
const POOL = LEVELS.filter((l) => l.id <= 90);

export function dailyLevel(date: string): LevelDef {
  const rng = mulberry32(hashString(`daily-${date}`));
  const base = POOL[randInt(rng, POOL.length)];
  const [, m, d] = date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return {
    ...base,
    id: DAILY_ID,
    name: `Daily · ${month} ${d}`,
    seed: hashString(`daily-board-${date}`) % 1_000_000,
    collect: base.collect.map((g) => ({ ...g })),
    cafe: base.cafe ? { ...base.cafe } : undefined,
    // A little more room than the campaign version: it's a puzzle to enjoy, then to master.
    moves: base.moves + 2,
    daily: date,
  };
}

export interface DailyPuzzleState {
  /** Best result per date. */
  history: Record<string, { best: number; stars: number; won: boolean; tries: number }>;
  /** Days in a row with a win. */
  streak: number;
  lastWin: string;
  /** Date the first-win reward was last collected. */
  rewarded: string;
}

export const freshDailyPuzzle = (): DailyPuzzleState => ({ history: {}, streak: 0, lastWin: '', rewarded: '' });

function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const p = new Date(y, m - 1, d - 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
}

/** Record an attempt. Returns true if this was today's first win (earns the daily reward). */
export function recordDaily(s: DailyPuzzleState, date: string, score: number, stars: number, won: boolean): boolean {
  const h = (s.history[date] ??= { best: 0, stars: 0, won: false, tries: 0 });
  h.tries++;
  h.best = Math.max(h.best, score);
  h.stars = Math.max(h.stars, stars);
  if (!won) return false;
  const firstWin = !h.won;
  h.won = true;
  if (firstWin) {
    s.streak = s.lastWin === previousDay(date) ? s.streak + 1 : 1;
    s.lastWin = date;
  }
  return firstWin && s.rewarded !== date;
}

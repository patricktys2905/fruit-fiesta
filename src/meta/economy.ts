/** Coins, boosters, the shop, the daily spin, the gift calendar and Fiesta Week.
 *  Everything is earned by playing; nothing costs real money. Pure functions for testing. */
import { hashString, mulberry32, randInt } from '../core/rng';
import { QUEST_TEMPLATES, Quest, questDone, templateOf } from './quests';
import { LevelReport } from './report';

export type BoosterId = 'hammer' | 'shuffle' | 'moves5' | 'beeStart';

export const BOOSTERS: Record<BoosterId, { icon: string; name: string; desc: string; price: number }> = {
  hammer: { icon: '🔨', name: 'Fruit Hammer', desc: 'Smash any one fruit or obstacle. Free: no move used.', price: 150 },
  shuffle: { icon: '🔀', name: 'Shuffle', desc: 'Mix up the board. Free: no move used.', price: 90 },
  moves5: { icon: '➕', name: '+5 Moves', desc: 'Out of moves? Keep playing with 5 more.', price: 200 },
  beeStart: { icon: '🐝', name: 'Bee Start', desc: 'Start a level with 2 Busy Bees on the board.', price: 120 },
};

export const LIFE_PRICE = 80;

export type Inventory = Record<BoosterId, number>;
export const emptyInventory = (): Inventory => ({ hammer: 1, shuffle: 1, moves5: 1, beeStart: 1 });

/** A reward bundle: coins, boosters, lives, unlimited-lives minutes. */
export interface Reward {
  coins?: number;
  boosters?: Partial<Inventory>;
  lives?: number;
  unlimitedMin?: number;
}

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`🪙 ${r.coins}`);
  for (const [k, n] of Object.entries(r.boosters ?? {})) if (n) parts.push(`${BOOSTERS[k as BoosterId].icon}×${n}`);
  if (r.lives) parts.push(`❤️×${r.lives}`);
  if (r.unlimitedMin) parts.push(`❤️∞ ${r.unlimitedMin} min`);
  return parts.join('  ');
}

/** Coins for finishing a level: more for more stars, extra the first time you earn each star. */
export function winCoins(stars: number, prevStars: number): number {
  const newStars = Math.max(0, stars - prevStars);
  return 10 + stars * 5 + newStars * 15;
}

// ---------- daily spin ----------

export const SPIN_SLICES: { reward: Reward; weight: number; color: string }[] = [
  { reward: { coins: 25 }, weight: 22, color: '#ffd23f' },
  { reward: { boosters: { shuffle: 1 } }, weight: 14, color: '#3fd0c9' },
  { reward: { coins: 50 }, weight: 16, color: '#ff9a3c' },
  { reward: { boosters: { hammer: 1 } }, weight: 12, color: '#ff5c8a' },
  { reward: { lives: 2 }, weight: 12, color: '#a456ff' },
  { reward: { boosters: { beeStart: 1 } }, weight: 10, color: '#7bd13b' },
  { reward: { coins: 150 }, weight: 6, color: '#3d7bff' },
  { reward: { boosters: { moves5: 1 } }, weight: 8, color: '#ff7aa0' },
];

/** Which slice today's spin lands on (seeded by the date, so it's fair and can't be re-rolled). */
export function spinResult(date: string, salt = 0): number {
  const rng = mulberry32(hashString(`spin-${date}-${salt}`));
  const total = SPIN_SLICES.reduce((n, s) => n + s.weight, 0);
  let x = rng() * total;
  for (let i = 0; i < SPIN_SLICES.length; i++) {
    x -= SPIN_SLICES[i].weight;
    if (x < 0) return i;
  }
  return 0;
}

// ---------- gift calendar (7 days, advances on each new day you play; never resets) ----------

export const CALENDAR: Reward[] = [
  { coins: 50 },
  { boosters: { hammer: 1 } },
  { coins: 100 },
  { boosters: { shuffle: 1, beeStart: 1 } },
  { boosters: { moves5: 1 } },
  { coins: 150, lives: 2 },
  { coins: 300, boosters: { hammer: 1, beeStart: 2 }, unlimitedMin: 60 },
];

export interface CalendarState {
  /** Next calendar day to claim (0-6). */
  day: number;
  /** Date the last gift was claimed. */
  lastClaim: string;
  /** Total gifts claimed (for awards). */
  total: number;
}

export const freshCalendar = (): CalendarState => ({ day: 0, lastClaim: '', total: 0 });
export const calendarReady = (s: CalendarState, today: string) => s.lastClaim !== today;

export function claimCalendar(s: CalendarState, today: string): Reward | null {
  if (!calendarReady(s, today)) return null;
  const reward = CALENDAR[s.day];
  s.day = (s.day + 1) % CALENDAR.length;
  s.lastClaim = today;
  s.total++;
  return reward;
}

// ---------- Fiesta Week: 5 bigger quests from Monday to Sunday ----------

export interface WeeklyState {
  week: string;
  quests: Quest[];
  claimed: boolean[];
  chestClaimed: boolean;
}

/** Monday of the week containing this date (YYYY-MM-DD). */
export function weekKey(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}

export const WEEKLY_QUEST_REWARD: Reward = { coins: 120, boosters: { hammer: 1 } };
export const WEEKLY_CHEST: Reward = { coins: 500, boosters: { moves5: 2, beeStart: 2, shuffle: 2 } };

export function generateWeekly(week: string, maxLevel: number): WeeklyState {
  const rng = mulberry32(hashString(`week-${week}`));
  const pool = QUEST_TEMPLATES.filter((t) => (t.minLevel ?? 0) <= maxLevel);
  const quests: Quest[] = [];
  while (quests.length < 5 && pool.length) {
    const t = pool.splice(randInt(rng, pool.length), 1)[0];
    const base = t.targets[t.targets.length - 1];
    quests.push({ tid: t.id, arg: t.args ? randInt(rng, 5) : 0, target: Math.round(base * 4), progress: 0, claimed: false });
  }
  return { week, quests, claimed: quests.map(() => false), chestClaimed: false };
}

export function ensureWeek(s: WeeklyState | null, week: string, maxLevel: number): WeeklyState {
  return s && s.week === week ? s : generateWeekly(week, maxLevel);
}

export function applyWeekly(s: WeeklyState, r: LevelReport): Quest[] {
  const done: Quest[] = [];
  for (const q of s.quests) {
    if (questDone(q)) continue;
    q.progress = Math.min(q.target, q.progress + templateOf(q).amount(r, q.arg));
    if (questDone(q)) done.push(q);
  }
  return done;
}

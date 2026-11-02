/** Daily quests: 3 per day, picked from the date (same quests all day, offline). */
import { hashString, mulberry32, randInt } from '../core/rng';
import { LevelReport, specialsIn } from './report';

const FRUIT_NAMES = ['strawberries', 'oranges', 'lemons', 'kiwis', 'grapes', 'blueberries'];
const FRUIT_EMOJI = ['🍓', '🍊', '🍋', '🥝', '🍇', '🫐'];

export interface QuestTemplate {
  id: string;
  icon: string;
  /** Possible targets (one is picked per day). */
  targets: number[];
  text: (n: number, arg: number) => string;
  /** How much one level attempt counts toward it. */
  amount: (r: LevelReport, arg: number) => number;
  /** Only offer once the player can reach this level. */
  minLevel?: number;
  /** Variant argument (e.g. fruit kind). */
  args?: number;
}

export const QUEST_TEMPLATES: QuestTemplate[] = [
  { id: 'win', icon: '🏁', targets: [2, 3], text: (n) => `Win ${n} levels`, amount: (r) => (r.won ? 1 : 0) },
  { id: 'stars', icon: '⭐', targets: [4, 6], text: (n) => `Earn ${n} stars`, amount: (r) => (r.won ? r.stars : 0) },
  { id: 'score', icon: '💯', targets: [25000, 40000], text: (n) => `Score ${n.toLocaleString()} points`, amount: (r) => r.score },
  { id: 'specials', icon: '✨', targets: [6, 10], text: (n) => `Make ${n} special fruits`, amount: (r) => specialsIn(r) },
  { id: 'jets', icon: '🧃', targets: [3, 5], text: (n) => `Make ${n} Juice Jets`, amount: (r) => r.jets },
  { id: 'bees', icon: '🐝', targets: [3, 5], text: (n) => `Make ${n} Busy Bees`, amount: (r) => r.bees },
  { id: 'bursts', icon: '💥', targets: [2, 3], text: (n) => `Make ${n} Fruit Bursts`, amount: (r) => r.bursts },
  { id: 'combo', icon: '🌀', targets: [1, 2], text: (n) => `Fire ${n} Super Combo${n > 1 ? 's' : ''}`, amount: (r) => r.combos },
  { id: 'fruit', icon: '🧺', targets: [60, 90], args: 6, text: (n, k) => `Collect ${n} ${FRUIT_NAMES[k]} ${FRUIT_EMOJI[k]}`, amount: (r, k) => r.fruitByKind[k] },
  { id: 'customers', icon: '🥤', targets: [5, 8], text: (n) => `Serve ${n} café customers`, amount: (r) => r.customers },
  { id: 'golden', icon: '✨', targets: [10, 20], minLevel: 4, text: (n) => `Pop ${n} golden fruit`, amount: (r) => r.golden },
  { id: 'ice', icon: '🧊', targets: [15, 25], minLevel: 41, text: (n) => 'Crack ' + n + ' ice', amount: (r) => r.ice ?? 0 },
  { id: 'sand', icon: '🏖️', targets: [20, 35], minLevel: 11, text: (n) => `Wash away ${n} sand`, amount: (r) => r.sand },
  { id: 'coconuts', icon: '🥥', targets: [2, 4], minLevel: 13, text: (n) => `Collect ${n} coconuts`, amount: (r) => r.coconuts },
];

export interface Quest {
  tid: string;
  arg: number;
  target: number;
  progress: number;
  claimed: boolean;
}

export interface DailyState {
  date: string;
  quests: Quest[];
  chestClaimed: boolean;
  /** Days in a row with all quests done. */
  streak: number;
  /** Last date all quests were completed. */
  lastAllDone: string;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
}

export function generateQuests(date: string, maxLevel: number): Quest[] {
  const rng = mulberry32(hashString(`fiesta-${date}`));
  const pool = QUEST_TEMPLATES.filter((t) => (t.minLevel ?? 0) <= maxLevel);
  const picked: Quest[] = [];
  while (picked.length < 3 && pool.length) {
    const t = pool.splice(randInt(rng, pool.length), 1)[0];
    picked.push({ tid: t.id, arg: t.args ? randInt(rng, Math.min(t.args, 5)) : 0, target: t.targets[randInt(rng, t.targets.length)], progress: 0, claimed: false });
  }
  return picked;
}

/** Roll over to a new day if needed (keeping the streak if yesterday was completed). */
export function ensureToday(s: DailyState | null, today: string, maxLevel: number): DailyState {
  if (s && s.date === today) return s;
  const keepStreak = s && (s.lastAllDone === previousDay(today) || s.lastAllDone === today);
  return { date: today, quests: generateQuests(today, maxLevel), chestClaimed: false, streak: keepStreak ? s!.streak : 0, lastAllDone: s?.lastAllDone ?? '' };
}

export const templateOf = (q: Quest) => QUEST_TEMPLATES.find((t) => t.id === q.tid)!;
export const questText = (q: Quest) => templateOf(q).text(q.target, q.arg);
export const questDone = (q: Quest) => q.progress >= q.target;

/** Count a level attempt toward today's quests. Returns quests that just became complete. */
export function applyReport(s: DailyState, r: LevelReport): Quest[] {
  const finished: Quest[] = [];
  for (const q of s.quests) {
    if (questDone(q)) continue;
    q.progress = Math.min(q.target, q.progress + templateOf(q).amount(r, q.arg));
    if (questDone(q)) finished.push(q);
  }
  if (s.quests.every(questDone) && s.lastAllDone !== s.date) {
    s.streak += 1;
    s.lastAllDone = s.date;
  }
  return finished;
}

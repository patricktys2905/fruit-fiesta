/** Achievements: permanent badges with progress. */
import { LevelReport } from './report';

/** Lifetime totals tracked across all play. */
export interface Lifetime {
  wins: number;
  jets: number;
  bees: number;
  bursts: number;
  smoothies: number;
  combos: number;
  fruit: number;
  sand: number;
  coconuts: number;
  bestScore: number;
  bestChain: number;
  lastMoveWins: number;
  questsDone: number;
  customers: number;
  golden: number;
  ice: number;
}

export const freshLifetime = (): Lifetime => ({
  wins: 0, jets: 0, bees: 0, bursts: 0, smoothies: 0, combos: 0, fruit: 0, sand: 0, coconuts: 0,
  bestScore: 0, bestChain: 0, lastMoveWins: 0, questsDone: 0, customers: 0, golden: 0, ice: 0,
});

export function addReport(l: Lifetime, r: LevelReport): void {
  if (r.won) l.wins++;
  l.jets += r.jets;
  l.bees += r.bees;
  l.bursts += r.bursts;
  l.smoothies += r.smoothies;
  l.combos += r.combos;
  l.fruit += r.fruit;
  l.sand += r.sand;
  l.coconuts += r.coconuts;
  l.customers += r.customers ?? 0;
  l.golden += r.golden ?? 0;
  l.ice += r.ice ?? 0;
  l.bestScore = Math.max(l.bestScore, r.score);
  l.bestChain = Math.max(l.bestChain, r.maxChain);
  if (r.won && r.movesLeft === 0) l.lastMoveWins++;
}

/** Extra facts derived from level progress and dailies. */
export interface AchieveCtx {
  life: Lifetime;
  totalStars: number;
  threeStarLevels: number;
  worldsDone: number;
  streak: number;
}

export interface Achievement {
  id: string;
  icon: string;
  name: string;
  desc: string;
  target: number;
  value: (c: AchieveCtx) => number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-win', icon: '🎉', name: 'First Fiesta', desc: 'Win your first level', target: 1, value: (c) => c.life.wins },
  { id: 'wins-25', icon: '🏅', name: 'Party Regular', desc: 'Win 25 levels', target: 25, value: (c) => c.life.wins },
  { id: 'barista', icon: '🥤', name: 'Star Barista', desc: 'Serve 50 café customers', target: 50, value: (c) => c.life.customers },
  { id: 'golden', icon: '✨', name: 'Golden Touch', desc: 'Pop 100 golden fruit', target: 100, value: (c) => c.life.golden },
  { id: 'ice', icon: '🧊', name: 'Ice Breaker', desc: 'Crack 150 ice', target: 150, value: (c) => c.life.ice },
  { id: 'world-5', icon: '❄️', name: 'Snow Champion', desc: 'Finish Frosty Falls', target: 5, value: (c) => c.worldsDone },
  { id: 'jets', icon: '🧃', name: 'Juice Master', desc: 'Make 50 Juice Jets', target: 50, value: (c) => c.life.jets },
  { id: 'bees', icon: '🐝', name: 'Bee Keeper', desc: 'Make 30 Busy Bees', target: 30, value: (c) => c.life.bees },
  { id: 'bursts', icon: '💥', name: 'Kaboom!', desc: 'Make 30 Fruit Bursts', target: 30, value: (c) => c.life.bursts },
  { id: 'smoothies', icon: '🌈', name: 'Rainbow Maker', desc: 'Make 10 Rainbow Smoothies', target: 10, value: (c) => c.life.smoothies },
  { id: 'combos', icon: '🌀', name: 'Combo Chef', desc: 'Fire 10 Super Combos', target: 10, value: (c) => c.life.combos },
  { id: 'chain', icon: '⛓️', name: 'Chain Reaction', desc: 'Get a 6-step cascade in one move', target: 6, value: (c) => c.life.bestChain },
  { id: 'fruit', icon: '🧺', name: 'Fruit Fanatic', desc: 'Pop 5,000 fruit', target: 5000, value: (c) => c.life.fruit },
  { id: 'score', icon: '💯', name: 'High Scorer', desc: 'Score 30,000 in one level', target: 30000, value: (c) => c.life.bestScore },
  { id: 'clutch', icon: '😅', name: 'Close Call', desc: 'Win a level on your very last move', target: 1, value: (c) => c.life.lastMoveWins },
  { id: 'sand', icon: '🏖️', name: 'Sand Sweeper', desc: 'Wash away 200 sand', target: 200, value: (c) => c.life.sand },
  { id: 'coconuts', icon: '🥥', name: 'Coconut Catcher', desc: 'Collect 25 coconuts', target: 25, value: (c) => c.life.coconuts },
  { id: 'stars-24', icon: '⭐', name: 'Star Gazer', desc: 'Collect 24 stars', target: 24, value: (c) => c.totalStars },
  { id: 'stars-60', icon: '🌟', name: 'Superstar', desc: 'Collect 60 stars', target: 60, value: (c) => c.totalStars },
  { id: 'perfect-10', icon: '💎', name: 'Perfectionist', desc: '3-star 10 levels', target: 10, value: (c) => c.threeStarLevels },
  { id: 'world-1', icon: '🏝️', name: 'Island Hopper', desc: 'Finish Sunny Isle', target: 1, value: (c) => c.worldsDone },
  { id: 'world-3', icon: '🏔️', name: 'Summit Reached', desc: 'Finish 3 worlds', target: 3, value: (c) => c.worldsDone },
  { id: 'quests', icon: '📅', name: 'Quest Hunter', desc: 'Complete 15 daily quests', target: 15, value: (c) => c.life.questsDone },
  { id: 'streak', icon: '🔥', name: 'On Fire', desc: 'Finish all daily quests 7 days in a row', target: 7, value: (c) => c.streak },
];

/** Achievements newly earned (not in `have`). */
export function newlyEarned(ctx: AchieveCtx, have: Record<string, number>): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !have[a.id] && a.value(ctx) >= a.target);
}

import { describe, it, expect } from 'vitest';
import { MAX_LIVES, REFILL_MS, freshLives, loseLife, refresh, timeToNext, canPlay, addLives, addUnlimited, formatTime } from '../src/meta/lives';
import { generateQuests, ensureToday, applyReport, questDone, questText } from '../src/meta/quests';
import { ACHIEVEMENTS, addReport, freshLifetime, newlyEarned } from '../src/meta/achievements';
import { emptyReport } from '../src/meta/report';

const T0 = 1_800_000_000_000;

describe('lives', () => {
  it('losing a life from full starts the refill timer', () => {
    let s = freshLives(T0);
    s = loseLife(s, T0);
    expect(s.lives).toBe(MAX_LIVES - 1);
    expect(timeToNext(s, T0)).toBe(REFILL_MS);
    expect(refresh(s, T0 + REFILL_MS - 1).lives).toBe(MAX_LIVES - 1);
    expect(refresh(s, T0 + REFILL_MS).lives).toBe(MAX_LIVES);
  });

  it('refills several lives over time and never above the max', () => {
    let s = freshLives(T0);
    for (let i = 0; i < 5; i++) s = loseLife(s, T0);
    expect(s.lives).toBe(0);
    expect(canPlay(s, T0)).toBe(false);
    const later = refresh(s, T0 + REFILL_MS * 2 + 5000);
    expect(later.lives).toBe(2);
    expect(timeToNext(later, T0 + REFILL_MS * 2 + 5000)).toBe(REFILL_MS - 5000);
    expect(refresh(s, T0 + REFILL_MS * 99).lives).toBe(MAX_LIVES);
  });

  it('unlimited lives means no life is lost; rewards can exceed the max', () => {
    let s = addUnlimited(freshLives(T0), 3600_000, T0);
    expect(loseLife(s, T0 + 1000).lives).toBe(MAX_LIVES);
    s = addLives(freshLives(T0), 2, T0);
    expect(s.lives).toBe(MAX_LIVES + 2);
    expect(formatTime(65_000)).toBe('1:05');
    expect(formatTime(3_725_000)).toBe('1:02:05');
  });
});

describe('daily quests', () => {
  it('are the same all day, 3 distinct, and respect unlocked content', () => {
    const a = generateQuests('2026-11-02', 1), b = generateQuests('2026-11-02', 1);
    expect(a).toEqual(b);
    expect(new Set(a.map((q) => q.tid)).size).toBe(3);
    for (let d = 1; d <= 28; d++) {
      const qs = generateQuests(`2026-12-${String(d).padStart(2, '0')}`, 1);
      expect(qs.some((q) => q.tid === 'sand' || q.tid === 'coconuts')).toBe(false);
      for (const q of qs) expect(questText(q).length).toBeGreaterThan(3);
    }
  });

  it('tracks progress, keeps the streak across consecutive days, resets after a gap', () => {
    let s = ensureToday(null, '2026-11-02', 24);
    const big = { ...emptyReport(1), won: true, stars: 3, score: 99999, jets: 9, bees: 9, bursts: 9, combos: 9, fruit: 999, fruitByKind: [999, 999, 999, 999, 999, 999], sand: 99, coconuts: 9, golden: 99, customers: 99 };
    const done = applyReport(s, big);
    expect(done.length).toBeGreaterThan(0);
    // "win N levels" needs several wins
    for (let i = 0; i < 3; i++) applyReport(s, big);
    expect(s.quests.every(questDone)).toBe(true);
    expect(s.streak).toBe(1);
    s = ensureToday(s, '2026-11-03', 24);
    expect(s.streak).toBe(1);
    for (let i = 0; i < 4; i++) applyReport(s, big);
    expect(s.streak).toBe(2);
    s = ensureToday(s, '2026-11-06', 24);
    expect(s.streak).toBe(0);
  });
});

describe('achievements', () => {
  it('unlock from lifetime stats and level progress', () => {
    const life = freshLifetime();
    addReport(life, { ...emptyReport(1), won: true, movesLeft: 0, bees: 30, maxChain: 6, score: 31000 });
    const ctx = { life, totalStars: 3, threeStarLevels: 1, worldsDone: 0, streak: 0 };
    const ids = newlyEarned(ctx, {}).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['first-win', 'bees', 'chain', 'score', 'clutch']));
    expect(ids).not.toContain('world-1');
    expect(newlyEarned(ctx, Object.fromEntries(ids.map((i) => [i, 1])))).toHaveLength(0);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

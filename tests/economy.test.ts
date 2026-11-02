import { describe, it, expect } from 'vitest';
import { Board } from '../src/core/board';
import { playHammer } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';
import {
  SPIN_SLICES, spinResult, freshCalendar, claimCalendar, calendarReady, CALENDAR,
  weekKey, generateWeekly, ensureWeek, applyWeekly, winCoins, rewardText,
} from '../src/meta/economy';
import { emptyReport } from '../src/meta/report';

describe('fruit hammer', () => {
  it('smashes one fruit without ticking anything, and the board refills', () => {
    const b = new Board(6, 6, 5, mulberry32(4));
    b.fillInitial();
    b.tideEvery = 1; // would rise on a normal move
    const target = b.grid[3][3]!;
    const res = playHammer(b, { r: 3, c: 3 }, { wantedKinds: () => [] });
    expect(res.valid).toBe(true);
    expect(b.grid.flat()).not.toContain(target);
    expect(b.grid.flat().every(Boolean)).toBe(true);
    expect(b.tide).toBe(0);
    expect(res.steps.some((s) => s.type === 'tide')).toBe(false);
  });
});

describe('economy', () => {
  it('pays more for more stars and new stars', () => {
    expect(winCoins(3, 0)).toBeGreaterThan(winCoins(3, 3));
    expect(winCoins(3, 3)).toBeGreaterThan(winCoins(1, 1));
    expect(rewardText({ coins: 50, boosters: { hammer: 1 } })).toContain('🔨');
  });

  it('daily spin is fixed per day and lands on every slice sometimes', () => {
    expect(spinResult('2026-11-03')).toBe(spinResult('2026-11-03'));
    const seen = new Set<number>();
    for (let d = 1; d <= 200; d++) seen.add(spinResult(`2026-${String((d % 12) + 1).padStart(2, '0')}-${String((d % 28) + 1).padStart(2, '0')}`, d));
    expect(seen.size).toBe(SPIN_SLICES.length);
  });

  it('gift calendar: one per day, walks 7 days, then loops (never resets on missed days)', () => {
    const c = freshCalendar();
    expect(claimCalendar(c, '2026-11-01')).toEqual(CALENDAR[0]);
    expect(claimCalendar(c, '2026-11-01')).toBeNull();
    expect(calendarReady(c, '2026-11-05')).toBe(true); // a few days later: just the next gift
    expect(claimCalendar(c, '2026-11-05')).toEqual(CALENDAR[1]);
    for (let i = 2; i < 7; i++) claimCalendar(c, `2026-11-${10 + i}`);
    expect(c.day).toBe(0);
    expect(c.total).toBe(7);
  });

  it('Fiesta Week: Monday-based week key, 5 big quests, progress from play', () => {
    expect(weekKey(new Date(2026, 10, 4))).toBe('2026-11-02'); // Wednesday -> Monday
    expect(weekKey(new Date(2026, 10, 8))).toBe('2026-11-02'); // Sunday -> same week
    expect(weekKey(new Date(2026, 10, 9))).toBe('2026-11-09');
    const w = generateWeekly('2026-11-02', 100);
    expect(w.quests).toHaveLength(5);
    expect(ensureWeek(w, '2026-11-02', 100)).toBe(w);
    expect(ensureWeek(w, '2026-11-09', 100)).not.toBe(w);
    const big = { ...emptyReport(1), won: true, stars: 3, score: 1e6, jets: 99, bees: 99, bursts: 99, combos: 99, fruit: 9999, fruitByKind: [999, 999, 999, 999, 999, 999], sand: 999, coconuts: 99, golden: 999, customers: 99, ice: 999, pinatas: 99, lava: 999 };
    let done = 0;
    for (let i = 0; i < 20; i++) done += applyWeekly(w, big).length;
    expect(done).toBe(5);
  });
});

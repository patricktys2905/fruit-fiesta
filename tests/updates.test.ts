import { describe, it, expect } from 'vitest';
import { LEVELS, WORLDS } from '../src/core/levels';
import tuning from '../src/core/tuning.json';
import { STICKERS, ALBUM_PAGES } from '../src/meta/stickers';
import { UPDATES, LATEST_UPDATE, unseenUpdates, markUpdatesSeen } from '../src/updates';
import lock from './level-lock.json';

describe('content updates stay save-safe', () => {
  it('never renumbers released levels (saves are keyed by level number)', () => {
    // Released levels must keep their number and seed. Add new levels at the END,
    // then append them to tests/level-lock.json. Editing a level's layout or goals is fine.
    for (const l of lock) {
      const now = LEVELS[l.id - 1];
      expect(now, `level ${l.id} was removed`).toBeDefined();
      expect({ id: now.id, seed: now.seed }, `level ${l.id} "${l.name}" moved`).toEqual({ id: l.id, seed: l.seed });
    }
  });

  it('every level is in the lock file, and levels added after launch are tuned', () => {
    expect(LEVELS.length, 'append new levels to tests/level-lock.json').toBe(lock.length);
    const t = tuning as Record<string, unknown>;
    const missing = LEVELS.filter((l) => l.id > 100 && !t[l.id]).map((l) => l.id);
    expect(missing, 'run: npm run tune -- <first> <last>').toEqual([]);
  });

  it('levels added after launch have their own seeds', () => {
    const seeds = LEVELS.filter((l) => l.id <= 100).map((l) => l.seed);
    for (const l of LEVELS.filter((x) => x.id > 100)) {
      expect(seeds, `level ${l.id} reuses a seed`).not.toContain(l.seed);
      seeds.push(l.seed);
    }
  });

  it('each world has map stops, and an album page', () => {
    for (const w of WORLDS) expect(w.spots.length).toBeGreaterThanOrEqual(w.levels.length);
    expect(ALBUM_PAGES).toBe(WORLDS.length);
    expect(STICKERS.length).toBe(WORLDS.length * 6);
    expect(WORLDS.map((w) => w.id)).toEqual(WORLDS.map((_, i) => i + 1));
  });
});

describe("what's new", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it('newest note is first and versions go down', () => {
    expect(LATEST_UPDATE).toBe(Math.max(...UPDATES.map((u) => u.version)));
    UPDATES.forEach((u, i) => i && expect(u.version).toBeLessThan(UPDATES[i - 1].version));
  });

  it('new players see nothing; returning players see each update once', () => {
    const fresh = store();
    expect(unseenUpdates(fresh, true)).toEqual([]);
    expect(unseenUpdates(fresh, false)).toEqual([]);

    const old = store();
    old.setItem('ff-seen-update', '1');
    expect(unseenUpdates(old, false).map((u) => u.version)).toEqual(UPDATES.filter((u) => u.version > 1).map((u) => u.version));
    markUpdatesSeen(old);
    expect(unseenUpdates(old, false)).toEqual([]);

    // A player from before notes existed (has progress, never saw any) gets everything after launch.
    expect(unseenUpdates(store(), false).length).toBe(UPDATES.length - 1);
  });
});

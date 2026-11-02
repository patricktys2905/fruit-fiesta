import { migrateOldLevelId } from './core/levels';
/** Progress saved on the device. (Family Profiles in Phase 4 will key this per player.) */
export interface Progress {
  /** Best stars per level id. */
  stars: Record<number, number>;
  best: Record<number, number>;
}

const KEY = 'ff-progress-v2';
const OLD_KEY = 'ff-progress-v1';

export function loadProgress(): Progress {
  migrateV1();
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '');
    if (p && typeof p === 'object') return { stars: p.stars || {}, best: p.best || {} };
  } catch {
    /* fresh save */
  }
  return { stars: {}, best: {} };
}

export function saveProgress(p: Progress): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function isUnlocked(p: Progress, levelId: number): boolean {
  // Open if it's the first level, the previous one is done, or it was already completed before.
  return levelId === 1 || (p.stars[levelId - 1] ?? 0) > 0 || (p.stars[levelId] ?? 0) > 0;
}

/** v1 saves were made when each world had 8 levels; renumber them for 10-level worlds. */
function migrateV1(): void {
  if (localStorage.getItem(KEY) || !localStorage.getItem(OLD_KEY)) return;
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || '{}');
    const remap = (o: Record<string, number> = {}) => Object.fromEntries(Object.entries(o).map(([id, v]) => [migrateOldLevelId(Number(id)), v]));
    localStorage.setItem(KEY, JSON.stringify({ stars: remap(old.stars), best: remap(old.best) }));
  } catch {
    /* ignore a broken old save */
  }
}
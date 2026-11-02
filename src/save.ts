/** Progress saved on the device. (Family Profiles in Phase 4 will key this per player.) */
export interface Progress {
  /** Best stars per level id. */
  stars: Record<number, number>;
  best: Record<number, number>;
}

const KEY = 'ff-progress-v1';

export function loadProgress(): Progress {
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
  return levelId === 1 || (p.stars[levelId - 1] ?? 0) > 0;
}

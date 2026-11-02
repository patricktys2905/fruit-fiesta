/** Lives: lose one for failing (or quitting) a level, refill over time. Clock-based, so it
 *  works offline and keeps refilling while the app is closed. Pure functions for testing. */
export const MAX_LIVES = 5;
export const REFILL_MS = 20 * 60 * 1000;
/** Lives can go above the max from rewards, up to this cap. */
export const BONUS_CAP = 9;

export interface LivesState {
  lives: number;
  /** When the refill timer started (only meaningful below MAX_LIVES). */
  at: number;
  /** Unlimited lives until this time (ms). */
  unlimitedUntil: number;
}

export const freshLives = (now: number): LivesState => ({ lives: MAX_LIVES, at: now, unlimitedUntil: 0 });

/** Apply any refills earned since `at`. */
export function refresh(s: LivesState, now: number): LivesState {
  if (s.lives >= MAX_LIVES) return { ...s, at: now };
  const elapsed = Math.max(0, now - s.at);
  const gained = Math.floor(elapsed / REFILL_MS);
  if (gained <= 0) return s;
  const lives = Math.min(MAX_LIVES, s.lives + gained);
  return { ...s, lives, at: lives >= MAX_LIVES ? now : s.at + gained * REFILL_MS };
}

export const hasUnlimited = (s: LivesState, now: number) => s.unlimitedUntil > now;

export function canPlay(s: LivesState, now: number): boolean {
  return hasUnlimited(s, now) || refresh(s, now).lives > 0;
}

/** Milliseconds until the next life, or 0 if full. */
export function timeToNext(s: LivesState, now: number): number {
  const r = refresh(s, now);
  if (r.lives >= MAX_LIVES) return 0;
  return REFILL_MS - ((now - r.at) % REFILL_MS);
}

export function loseLife(s: LivesState, now: number): LivesState {
  if (hasUnlimited(s, now)) return s;
  const r = refresh(s, now);
  if (r.lives <= 0) return r;
  // Leaving "full" starts the refill clock now.
  return { ...r, lives: r.lives - 1, at: r.lives >= MAX_LIVES ? now : r.at };
}

export function addLives(s: LivesState, n: number, now: number): LivesState {
  const r = refresh(s, now);
  const lives = Math.min(BONUS_CAP, r.lives + n);
  return { ...r, lives, at: lives >= MAX_LIVES ? now : r.at };
}

export function addUnlimited(s: LivesState, ms: number, now: number): LivesState {
  return { ...s, unlimitedUntil: Math.max(s.unlimitedUntil, now) + ms };
}

export function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

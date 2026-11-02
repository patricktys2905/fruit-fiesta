/** Points for clearing one group of `size` fruit during cascade step `chain` (1 = the player's own match). */
export function groupScore(size: number, chain: number): number {
  const base = size * 20 + Math.max(0, size - 3) * 40;
  return base * chain;
}

/** Bonus for each move left over when a level is finished early. */
export const LEFTOVER_MOVE_BONUS = 150;

export function starsFor(score: number, thresholds: [number, number, number]): number {
  return thresholds.filter((t) => score >= t).length;
}

import { describe, it, expect } from 'vitest';
import { LEVELS, WORLDS, createBoard, hasSand } from '../src/core/levels';
import { COCONUT } from '../src/core/board';

describe('level data', () => {
  it('has unique, consecutive ids across worlds', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(LEVELS.map((_, i) => i + 1));
    for (const w of WORLDS) expect(w.spots.length).toBeGreaterThanOrEqual(w.levels.length);
  });

  for (const level of LEVELS) {
    it(`level ${level.id} "${level.name}" is well formed and starts playable`, () => {
      if (level.layout) {
        expect(level.layout.length).toBe(level.rows);
        for (const row of level.layout) expect(row.length).toBe(level.cols);
        expect(level.layout.join('')).toMatch(/^[ .sSoiI#]+$/);
      }
      expect(level.stars[0]).toBeLessThan(level.stars[1]);
      expect(level.stars[1]).toBeLessThan(level.stars[2]);
      const b = createBoard(level);
      expect(b.findMatches()).toHaveLength(0);
      expect(b.findHint()).not.toBeNull();
      // every playable cell has a tile
      for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) expect(!!b.grid[r][c]).toBe(b.mask[r][c]);
      if (level.coconuts) {
        const placed = b.grid.flat().filter((t) => t?.kind === COCONUT).length;
        expect(placed + b.coconutsToSpawn).toBe(level.coconuts);
      }
      // a level must have some goal beyond score, or a score goal
      expect(level.collect.length > 0 || hasSand(level) || !!level.coconuts || level.stars[0] > 0).toBe(true);
    });
  }
});

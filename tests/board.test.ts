import { describe, it, expect } from 'vitest';
import { Board } from '../src/core/board';
import { mulberry32 } from '../src/core/rng';

function boardFrom(rows: string[], kinds = 6): Board {
  const b = new Board(rows[0].length, rows.length, kinds, mulberry32(1));
  let id = 1000;
  rows.forEach((line, r) => [...line].forEach((ch, c) => (b.grid[r][c] = { id: id++, kind: Number(ch) })));
  return b;
}

describe('Board', () => {
  it('starts with no matches and at least one move', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const b = new Board(8, 9, 5, mulberry32(seed));
      b.fillInitial();
      expect(b.findMatches()).toHaveLength(0);
      expect(b.findHint()).not.toBeNull();
    }
  });

  it('is deterministic for the same seed', () => {
    const a = new Board(8, 9, 6, mulberry32(42));
    const b = new Board(8, 9, 6, mulberry32(42));
    a.fillInitial();
    b.fillInitial();
    expect(a.grid.map((r) => r.map((t) => t!.kind))).toEqual(b.grid.map((r) => r.map((t) => t!.kind)));
  });

  it('merges L-shaped matches into one group', () => {
    const b = boardFrom(['00012', '12013', '23014', '34555']);
    const groups = b.findMatches();
    const zeros = groups.find((g) => g.kind === 0)!;
    expect(zeros.cells).toHaveLength(5); // row of three + column sharing the corner
    expect(groups.find((g) => g.kind === 5)!.cells).toHaveLength(3);
  });

  it('collapses and refills to a full board', () => {
    const b = boardFrom(['123', '111', '231']);
    const groups = b.findMatches();
    b.clear(groups.flatMap((g) => g.cells));
    const falls = b.collapse();
    expect(falls.length).toBeGreaterThan(0);
    const spawns = b.refill();
    expect(spawns).toHaveLength(3);
    expect(b.grid.flat().every((t) => t !== null)).toBe(true);
    expect(spawns.every((s) => s.dropFrom < 0)).toBe(true);
  });

  it('shuffle leaves a playable board with no matches', () => {
    const b = new Board(8, 9, 6, mulberry32(7));
    b.fillInitial();
    b.shuffle();
    expect(b.findMatches()).toHaveLength(0);
    expect(b.findHint()).not.toBeNull();
  });
});

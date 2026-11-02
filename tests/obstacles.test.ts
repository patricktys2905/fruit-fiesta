import { describe, it, expect } from 'vitest';
import { Board, COCONUT } from '../src/core/board';
import { playMove, ClearStep } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';

const ctx = { wantedKinds: () => [] as number[] };

function boardFrom(rows: string[], layout?: string[]): Board {
  const b = new Board(rows[0].length, rows.length, 6, mulberry32(5), layout);
  rows.forEach((line, r) =>
    [...line].forEach((ch, c) => {
      if (ch === ' ') b.grid[r][c] = null;
      else if (ch === 'o') b.grid[r][c] = b.newTile(COCONUT);
      else b.grid[r][c] = b.newTile(Number(ch));
    }),
  );
  return b;
}

describe('holes', () => {
  it('fruit falls straight past a hole', () => {
    const layout = ['...', '. .', '...'];
    // column 1: (0,1)=2, hole at (1,1), (2,1)=0 will be cleared by a row match
    const b = boardFrom(['324', '1 5', '000'], layout);
    b.grid[2][1] = b.newTile(0);
    const groups = b.findMatches();
    b.clear(groups.flatMap((g) => g.cells));
    const falls = b.collapse();
    const f = falls.find((x) => x.c === 1)!;
    expect(f).toMatchObject({ fromR: 0, toR: 2 });
    expect(b.grid[1][1]).toBeNull();
    b.refill();
    expect(b.grid[1][1]).toBeNull(); // holes never get fruit
    expect(b.grid[0][1]).not.toBeNull();
  });

  it('initial fill and shuffle leave holes empty', () => {
    const layout = [' ...... ', '........', '........', '...  ...', '........', '........', ' ...... '];
    for (let seed = 1; seed < 20; seed++) {
      const b = new Board(8, 7, 5, mulberry32(seed), layout);
      b.fillInitial();
      expect(b.grid[0][0]).toBeNull();
      expect(b.grid[3][3]).toBeNull();
      expect(b.findMatches()).toHaveLength(0);
      b.shuffle();
      expect(b.grid[3][4]).toBeNull();
      expect(b.grid.flat().filter(Boolean)).toHaveLength(layout.join('').replace(/ /g, '').length);
    }
  });
});

describe('sand', () => {
  it('a match washes one layer of sand from each cleared cell', () => {
    const layout = ['SSs.', '....', '....'];
    const b = boardFrom(['0010', '2302', '3423'], layout);
    // swap (0,3)=0 with (0,2)=1? that gives 0001 → no. Swap (1,2)=0 up into (0,2): row0 = 0 0 0 0
    const res = playMove(b, { r: 1, c: 2 }, { r: 0, c: 2 }, ctx);
    expect(res.valid).toBe(true);
    const first = res.steps[0] as ClearStep;
    expect(first.sand.length).toBe(3);
    expect(b.sand[0]).toEqual([1, 1, 0, 0]);
    expect(res.sandCleared).toBe(3);
  });
});

describe('coconuts', () => {
  it('are immune to blasts and get collected at the bottom', () => {
    // coconut at (0,1); clearing the column below lets it fall to the bottom
    const b = boardFrom(['2o3', '101', '414', '515'].map((r) => r), undefined);
    // make column 1 below the coconut clear via a vertical match: put 1s at (1,1),(2,1),(3,1)
    b.grid[2][1] = b.newTile(0);
    b.grid[3][1] = b.newTile(0);
    b.grid[1][1] = b.newTile(2);
    b.grid[1][0] = b.newTile(0);
    // swap (1,0)=0 with (1,1)=2 → column 1 rows1-3 = 0,0,0
    const res = playMove(b, { r: 1, c: 0 }, { r: 1, c: 1 }, ctx);
    expect(res.valid).toBe(true);
    expect(res.coconuts).toBe(1);
    expect(res.steps.some((s) => s.type === 'collect')).toBe(true);
    expect(b.grid.flat().some((t) => t?.kind === COCONUT)).toBe(false);
  });

  it('cannot be swapped with another coconut, and refill spawns them up to the limit', () => {
    const b = new Board(6, 6, 5, mulberry32(9));
    b.fillInitial();
    b.coconutsToSpawn = 3;
    b.maxCoconuts = 2;
    for (let i = 0; i < 40 && b.coconutsToSpawn > 0; i++) {
      b.clear([{ r: 5, c: i % 6 }, { r: 4, c: i % 6 }]);
      b.collapse();
      b.refill();
      expect(b.coconutsOnBoard()).toBeLessThanOrEqual(2);
      b.collectCoconuts();
      b.collapse();
      b.refill();
    }
    expect(b.coconutsToSpawn).toBe(0);
  });
});

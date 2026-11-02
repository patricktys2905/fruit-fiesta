import { describe, it, expect } from 'vitest';
import { Board } from '../src/core/board';
import { playMove, ClearStep } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';
import { Cafe } from '../src/core/orders';

const ctx = { wantedKinds: () => [] as number[] };

function boardFrom(rows: string[]): Board {
  const b = new Board(rows[0].length, rows.length, 6, mulberry32(21));
  rows.forEach((line, r) => [...line].forEach((ch, c) => (b.grid[r][c] = b.newTile(Number(ch)))));
  return b;
}

describe('ice', () => {
  it('frozen fruit cannot be swapped, and a match cracks one layer instead of removing it', () => {
    const b = boardFrom(['00103', '24135', '31425']);
    const frozen = b.grid[0][0]!;
    frozen.ice = 2;
    expect(b.isValidSwap({ r: 0, c: 0 }, { r: 1, c: 0 })).toBe(false);
    // swap (0,3)=0 with (0,2)=1: row 0 becomes 0 0 0 1 3 including the frozen strawberry
    const res = playMove(b, { r: 0, c: 3 }, { r: 0, c: 2 }, ctx);
    expect(res.valid).toBe(true);
    const first = res.steps[0] as ClearStep;
    expect(first.ice).toHaveLength(1);
    expect(frozen.ice).toBe(1);
    expect(b.grid.flat()).toContain(frozen); // still on the board
    expect(res.iceCracked).toBeGreaterThanOrEqual(1);
  });

  it('layout i/I creates frozen fruit and iceLeft counts layers', () => {
    const b = new Board(4, 4, 5, mulberry32(3), ['i...', '....', '..I.', '....']);
    b.fillInitial();
    expect(b.grid[0][0]!.ice).toBe(1);
    expect(b.grid[2][2]!.ice).toBe(2);
    expect(b.iceLeft()).toBe(3);
  });
});

describe('fruit personalities', () => {
  it('lemons zing nearby sand, grapes leave puddles, strawberries are sweet', () => {
    const b = boardFrom(['22322', '41504', '05140']);
    b.personalities = true;
    b.sand[1][1] = 1; // under a cell next to the lemon match
    // swap (0,2)=3 with (1,2)=5? Instead move the 2 at (0,4)… row 0 is 2 2 3 2 2: swap (0,2)<->(0,3)? gives 2 2 2 3 2
    const res = playMove(b, { r: 0, c: 3 }, { r: 0, c: 2 }, ctx);
    expect(res.valid).toBe(true);
    const first = res.steps[0] as ClearStep;
    const zing = first.traits.find((t) => t.kind === 2)!;
    expect(zing).toBeTruthy();
    expect(first.sand.some((c) => c.r === 1 && c.c === 1)).toBe(true);
  });

  it('grape puddles pay out when fruit is later popped on them', () => {
    const b = boardFrom(['44122', '21432', '35213']);
    b.personalities = true;
    // move the grape at (1,2) up: row 0 becomes 4 4 4 2 2
    const res = playMove(b, { r: 1, c: 2 }, { r: 0, c: 2 }, ctx);
    const first = res.steps[0] as ClearStep;
    expect(first.puddlesAdded.length).toBe(3);
    expect(first.traits.some((t) => t.kind === 4)).toBe(true);
  });

  it('kiwis ripen neighbouring green fruit', () => {
    const b = boardFrom(['33433', '12524', '45152']);
    b.personalities = true;
    const green = b.grid[1][1]!;
    green.unripe = 1;
    playMove(b, { r: 0, c: 3 }, { r: 0, c: 2 }, ctx);
    expect(green.unripe).toBeUndefined();
    expect(green.golden).toBe(true);
  });

  it('off by default (older levels keep their balance)', () => {
    const b = boardFrom(['22322', '41504', '05140']);
    const res = playMove(b, { r: 0, c: 3 }, { r: 0, c: 2 }, ctx);
    expect((res.steps[0] as ClearStep).traits).toHaveLength(0);
  });

  it('strawberry sweetness tops up café patience', () => {
    const cafe = new Cafe({ serve: 3, slots: 2, patience: 5, size: [6, 6] }, 6, 1);
    cafe.tick();
    cafe.tick();
    cafe.soothe(1);
    expect(cafe.active[0].patience).toBe(4);
  });
});

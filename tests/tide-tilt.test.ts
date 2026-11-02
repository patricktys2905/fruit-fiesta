import { describe, it, expect } from 'vitest';
import { Board, COCONUT } from '../src/core/board';
import { playMove, playTilt, TideStep } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';

const ctx = { wantedKinds: () => [] as number[] };

function boardFrom(rows: string[]): Board {
  const b = new Board(rows[0].length, rows.length, 6, mulberry32(11));
  rows.forEach((line, r) => [...line].forEach((ch, c) => (b.grid[r][c] = b.newTile(ch === 'o' ? COCONUT : Number(ch)))));
  return b;
}

describe('tides', () => {
  it('fruit underwater cannot be swapped', () => {
    const b = boardFrom(['0120', '3453', '1201', '0340']);
    b.tide = 1;
    b.tideEvery = 3;
    // (3,0)/(3,1) are underwater
    expect(b.isValidSwap({ r: 3, c: 0 }, { r: 3, c: 1 })).toBe(false);
    expect(b.isValidSwap({ r: 2, c: 0 }, { r: 3, c: 0 })).toBe(false);
  });

  it('rises every N moves and floods at the max', () => {
    const b = new Board(8, 9, 5, mulberry32(4));
    b.fillInitial();
    b.tideEvery = 2;
    b.tideMax = 2;
    const tides: number[] = [];
    let flooded = false;
    for (let i = 0; i < 6 && !flooded; i++) {
      const moves = b.allMoves();
      const r = playMove(b, moves[0][0], moves[0][1], ctx);
      const t = r.steps.find((s): s is TideStep => s.type === 'tide')!;
      tides.push(t.tide);
      flooded = r.flooded;
    }
    expect(tides[0]).toBe(0);
    expect(Math.max(...tides)).toBe(2);
    expect(flooded).toBe(true);
  });

  it('a match at the waterline pushes the tide back', () => {
    // bottom row underwater; match in the row just above the water
    const b = boardFrom(['12345', '23451', '34012', '00100', '45123']);
    b.tide = 1;
    b.tideEvery = 10;
    // moving the 0 at (2,2) down completes row 3, right above the water (row 4)
    const r = playMove(b, { r: 2, c: 2 }, { r: 3, c: 2 }, ctx);
    expect(r.valid).toBe(true);
    const t = r.steps.find((s): s is TideStep => s.type === 'tide')!;
    expect(t.pushed).toBe(true);
    expect(b.tide).toBe(0);
  });
});

describe('island tilt', () => {
  it('changes gravity so fruit slides sideways and refills from the opposite edge', () => {
    const b = new Board(6, 6, 5, mulberry32(8));
    b.fillInitial();
    b.grid[2][5] = null;
    b.grid[2][4] = null;
    const r = playTilt(b, 'right', ctx);
    expect(r.valid).toBe(true);
    expect(b.gravity).toBe('right');
    expect(r.steps[0]).toMatchObject({ type: 'tilt', gravity: 'right' });
    expect(b.grid.flat().every(Boolean)).toBe(true);
    const fall = r.steps.find((s) => s.type === 'fall');
    if (fall && fall.type === 'fall') {
      for (const sp of fall.spawns) expect(sp.fromC).toBeLessThan(0); // came in from the left edge
    }
    expect(playTilt(b, 'right', ctx).valid).toBe(false);
  });

  it('coconuts are collected at the downhill edge', () => {
    const b = new Board(4, 4, 5, mulberry32(2));
    b.fillInitial();
    b.grid[1][3] = b.newTile(COCONUT);
    b.gravity = 'right';
    const items = b.collectCoconuts();
    expect(items.map((i) => [i.r, i.c])).toEqual([[1, 3]]);
  });
});

import { describe, it, expect } from 'vitest';
import { Board, PINATA, LAVA } from '../src/core/board';
import { playMove, conveyorShift, spreadLava, fadeLight, ClearStep, LIGHT_MOVES } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';

const ctx = { wantedKinds: () => [] as number[] };

function boardFrom(rows: string[]): Board {
  const b = new Board(rows[0].length, rows.length, 6, mulberry32(31));
  rows.forEach((line, r) =>
    [...line].forEach((ch, c) => {
      const t = b.newTile(ch === 'p' ? PINATA : ch === 'v' ? LAVA : Number(ch));
      if (ch === 'p') t.hp = 3;
      b.grid[r][c] = t;
    }),
  );
  return b;
}

describe('piñatas', () => {
  it('cannot be moved; a match next to it knocks off one heart', () => {
    const b = boardFrom(['00103', 'p4135', '31425']);
    expect(b.isValidSwap({ r: 1, c: 0 }, { r: 1, c: 1 })).toBe(false);
    const pin = b.grid[1][0]!;
    const res = playMove(b, { r: 0, c: 3 }, { r: 0, c: 2 }, ctx); // row 0: 0 0 0 1 3, right above the piñata
    expect(res.valid).toBe(true);
    expect((res.steps[0] as ClearStep).pinatas[0]).toMatchObject({ hp: 2 });
    expect(pin.hp).toBe(2);
    expect(b.grid.flat()).toContain(pin);
  });

  it('bursts at zero hearts and clears the cells around it', () => {
    const b = boardFrom(['00103', 'p4135', '31425']);
    b.grid[1][0]!.hp = 1;
    const res = playMove(b, { r: 0, c: 3 }, { r: 0, c: 2 }, ctx);
    const first = res.steps[0] as ClearStep;
    expect(first.pinatas[0].hp).toBe(0);
    expect(res.pinatasBurst).toBe(1);
    expect(first.blasts.some((x) => x.type === 'bomb' && x.radius === 1)).toBe(true);
    expect(b.pinatasLeft()).toBe(0);
  });
});

describe('lava', () => {
  it('is cleared by a match next to it', () => {
    const b = boardFrom(['00103', 'v4135', '31425']);
    const res = playMove(b, { r: 0, c: 3 }, { r: 0, c: 2 }, ctx);
    expect(res.lavaCleared).toBe(1);
    expect(res.steps.some((s) => s.type === 'lava')).toBe(false); // cooled, so no spreading
  });

  it('spreads into a neighbouring fruit when left alone', () => {
    const b = boardFrom(['012', '3v4', '120']);
    const before = b.lavaLeft();
    const step = spreadLava(b)!;
    expect(step.type).toBe('lava');
    expect(b.lavaLeft()).toBe(before + 1);
  });
});

describe('conveyors', () => {
  it('slide a row one step, wrapping around', () => {
    const b = boardFrom(['0123', '4501', '2345']);
    b.conveyors = [{ row: 1, dir: 1 }];
    const ids = b.grid[1].map((t) => t!.id);
    const step = conveyorShift(b)!;
    expect(b.grid[1].map((t) => t!.id)).toEqual([ids[3], ids[0], ids[1], ids[2]]);
    expect(step.moves.filter((m) => m.wrap)).toHaveLength(1);
  });

  it('jam when a fixed tile (piñata, lava, ice) sits on the belt', () => {
    const b = boardFrom(['0123', '45p1', '2345']);
    b.conveyors = [{ row: 1, dir: -1 }];
    expect(conveyorShift(b)).toBeNull();
  });
});

describe('night', () => {
  it('matches light up nearby cells, and light fades except around lanterns', () => {
    const b = boardFrom(['00103', '24135', '31425', '12341']);
    b.night = true;
    b.lantern[3][4] = true;
    playMove(b, { r: 0, c: 3 }, { r: 0, c: 2 }, ctx);
    // after the move: light faded once from LIGHT_MOVES near the match; lantern area is full
    expect(b.light[0][1]).toBe(LIGHT_MOVES - 1);
    expect(b.light[3][4]).toBe(LIGHT_MOVES);
    for (let i = 0; i < LIGHT_MOVES; i++) fadeLight(b);
    expect(b.light[0][1]).toBe(0);
    expect(b.light[2][3]).toBe(LIGHT_MOVES);
  });
});

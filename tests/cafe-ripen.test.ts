import { describe, it, expect } from 'vitest';
import { Board, MUSH } from '../src/core/board';
import { playMove, ripenBoard, ClearStep, SPOIL_MOVES } from '../src/core/engine';
import { Cafe, RECIPES } from '../src/core/orders';
import { mulberry32 } from '../src/core/rng';

const ctx = { wantedKinds: () => [] as number[] };

function boardFrom(rows: string[]): Board {
  const b = new Board(rows[0].length, rows.length, 6, mulberry32(5));
  rows.forEach((line, r) => [...line].forEach((ch, c) => (b.grid[r][c] = b.newTile(ch === 'm' ? MUSH : Number(ch)))));
  return b;
}

describe('ripening', () => {
  it('unripe fruit cannot be matched', () => {
    const b = boardFrom(['000', '123', '231']);
    expect(b.findMatches()).toHaveLength(1);
    b.grid[0][1]!.unripe = 2;
    expect(b.findMatches()).toHaveLength(0);
    b.grid[0][1]!.unripe = undefined;
    b.grid[0][0]!.unripe = 1;
    expect(b.findMatches()).toHaveLength(0); // unripe can't start a run either
  });

  it('ripens into golden fruit after its countdown, then spoils into mush', () => {
    const b = boardFrom(['012', '345', '120']);
    const t = b.grid[1][1]!;
    t.unripe = 2;
    ripenBoard(b);
    expect(t.unripe).toBe(1);
    const step = ripenBoard(b)!;
    expect(step.ripened).toContain(t);
    expect(t.golden).toBe(true);
    for (let i = 0; i < SPOIL_MOVES; i++) ripenBoard(b);
    expect(t.kind).toBe(MUSH);
  });

  it('golden fruit counts double and a match next to mush clears the mush', () => {
    const b = boardFrom(['00103', '24m35', '31425']);
    b.grid[0][0]!.golden = true;
    // swap (0,2)=1 with (1,2)=m? mush can't help match; instead swap (0,3)=0 with (0,2)=1 → row0: 0 0 0 1 3
    const res = playMove(b, { r: 0, c: 3 }, { r: 0, c: 2 }, ctx);
    expect(res.valid).toBe(true);
    const first = res.steps[0] as ClearStep;
    expect(first.cleared.some((x) => x.kind === MUSH)).toBe(true);
    expect(res.collected[0]).toBeGreaterThanOrEqual(4); // 3 strawberries, one golden = 4
  });
});

describe('café orders', () => {
  it('only uses fruit available in the level, and fills slots', () => {
    const cafe = new Cafe({ serve: 5, slots: 2, patience: 6, size: [6, 8] }, 4, 42);
    expect(cafe.active).toHaveLength(2);
    for (const o of cafe.active) for (const n of o.needs) expect(n.kind).toBeLessThan(4);
    expect(cafe.active[0].customer).not.toBe(cafe.active[1].customer);
    expect(RECIPES.length).toBeGreaterThan(8);
  });

  it('serves the oldest customer first, pays tips, and replaces served customers', () => {
    const cafe = new Cafe({ serve: 3, slots: 1, patience: 5, size: [4, 4] }, 6, 7);
    const o = cafe.active[0];
    const fruit = o.needs.flatMap((n) => Array.from({ length: n.total }, () => ({ kind: n.kind })));
    const res = cafe.feed(fruit);
    expect(res.served.map((x) => x.id)).toEqual([o.id]);
    expect(cafe.served).toBe(1);
    expect(cafe.tips).toBeGreaterThan(0);
    expect(res.arrived).toHaveLength(1);
    expect(cafe.active[0].id).not.toBe(o.id);
  });

  it('golden fruit fills two, and impatient customers walk out', () => {
    const cafe = new Cafe({ serve: 2, slots: 1, patience: 2, size: [2, 2] }, 6, 3);
    const k = cafe.active[0].needs[0].kind;
    const res = cafe.feed([{ kind: k, golden: true }]);
    expect(res.pours.reduce((n, p) => n + p.amount, 0)).toBeGreaterThanOrEqual(1);
    const id = cafe.active[0].id;
    cafe.tick();
    const t = cafe.tick();
    expect(t.left.map((x) => x.id)).toContain(id);
    expect(cafe.walked).toBe(1);
    expect(cafe.active).toHaveLength(1);
    expect(cafe.done).toBe(false);
  });
});

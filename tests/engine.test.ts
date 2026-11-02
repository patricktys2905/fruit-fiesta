import { describe, it, expect } from 'vitest';
import { Board, RAINBOW, Special } from '../src/core/board';
import { classify, playMove, ClearStep } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';

const ctx = { wantedKinds: () => [] as number[] };

/** Build a board from digit rows; letters mark specials on that cell:
 *  h=jetH v=jetV b=bomb e=bee (fruit kind from `kinds` map), R=rainbow. */
function boardFrom(rows: string[], specials: Record<string, Special> = {}): Board {
  const b = new Board(rows[0].length, rows.length, 6, mulberry32(3));
  rows.forEach((line, r) =>
    [...line].forEach((ch, c) => {
      if (ch === 'R') b.grid[r][c] = b.newTile(RAINBOW, 'rainbow');
      else b.grid[r][c] = b.newTile(Number(ch), specials[`${r},${c}`]);
    }),
  );
  return b;
}

const cells = (spec: [number, number][]) => spec.map(([r, c]) => ({ r, c }));

describe('classify', () => {
  it('maps match shapes to specials', () => {
    expect(classify(cells([[0, 0], [0, 1], [0, 2]]))).toBeNull();
    expect(classify(cells([[0, 0], [0, 1], [0, 2], [0, 3]]))).toBe('jetH');
    expect(classify(cells([[0, 0], [1, 0], [2, 0], [3, 0]]))).toBe('jetV');
    expect(classify(cells([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]))).toBe('rainbow');
    expect(classify(cells([[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]]))).toBe('bomb');
    expect(classify(cells([[0, 0], [0, 1], [1, 0], [1, 1]]))).toBe('bee');
  });
});

describe('playMove', () => {
  it('rejects swaps that make no match', () => {
    const b = boardFrom(['0123', '1230', '2301']);
    expect(playMove(b, { r: 0, c: 0 }, { r: 0, c: 1 }, ctx).valid).toBe(false);
  });

  it('a 4-in-a-row creates a Juice Jet where the fruit was dropped', () => {
    // Moving the 0 at (1,3) up into (0,3) makes 0000 on row 0.
    const b = boardFrom(['00012', '12303', '23412', '34123']);
    const res = playMove(b, { r: 1, c: 3 }, { r: 0, c: 3 }, ctx);
    expect(res.valid).toBe(true);
    const first = res.steps[0] as ClearStep;
    expect(first.created).toHaveLength(1);
    expect(first.created[0].special).toBe('jetH');
    expect(first.created[0]).toMatchObject({ r: 0, c: 3 });
    expect(first.cleared).toHaveLength(3);
  });

  it('a 2x2 square creates a Busy Bee', () => {
    const b = boardFrom(['00213', '01324', '23140', '34201']);
    // Move the 0 at (2,4)... simpler: swap (1,1)=1 with (1,2)? Build directly instead:
    const b2 = boardFrom(['00213', '01324', '23140']);
    b2.grid[1][1] = b2.newTile(3);
    b2.grid[1][2] = b2.newTile(0);
    // row1 now: 0 3 0 2 4 → swapping (1,1)<->(1,2) makes 2x2 of 0s at top-left
    const res = playMove(b2, { r: 1, c: 2 }, { r: 1, c: 1 }, ctx);
    expect(res.valid).toBe(true);
    expect((res.steps[0] as ClearStep).created[0]?.special).toBe('bee');
    expect(b.cols).toBe(5);
  });

  it('matching a Jet clears its whole row', () => {
    const b = boardFrom(['12131', '34045', '00454', '45313'], { '0,0': 'jetH' });
    // Swap (0,1)=2 with (1,1)? Instead make column match through the jet: col 0 is 1,3,0,4.
    // Put a 1 under the jet: swap (1,0)=3 with (1,1)=4 does nothing; craft directly:
    b.grid[1][0] = b.newTile(5);
    b.grid[1][1] = b.newTile(1);
    b.grid[2][0] = b.newTile(1);
    // col 0: 1(jet),5,1,4 ; swapping (1,0)<->(1,1) puts 1 at (1,0) → vertical 1,1,1 incl. jet
    const res = playMove(b, { r: 1, c: 1 }, { r: 1, c: 0 }, ctx);
    const first = res.steps[0] as ClearStep;
    expect(first.blasts.some((x) => x.type === 'row' && x.origin.r === 0)).toBe(true);
    const row0 = first.cleared.filter((x) => x.r === 0);
    expect(row0).toHaveLength(5);
  });

  it('a Rainbow Smoothie swapped with a fruit clears every fruit of that kind', () => {
    const b = boardFrom(['R2131', '34245', '20452', '45323']);
    const twos = b.grid.flat().filter((t) => t!.kind === 2).length;
    const res = playMove(b, { r: 0, c: 0 }, { r: 0, c: 1 }, ctx);
    expect(res.valid).toBe(true);
    const first = res.steps[0] as ClearStep;
    expect(first.cleared.filter((x) => x.kind === 2)).toHaveLength(twos);
    expect(first.cleared.some((x) => x.kind === RAINBOW)).toBe(true);
    expect(res.collected[2]).toBeGreaterThanOrEqual(twos);
  });

  it('two Jets swapped together blast a cross', () => {
    const b = boardFrom(['12131', '34245', '20452', '45323'], { '1,1': 'jetH', '1,2': 'jetV' });
    const res = playMove(b, { r: 1, c: 1 }, { r: 1, c: 2 }, ctx);
    const first = res.steps[0] as ClearStep;
    expect(first.combo).toBe(true);
    expect(first.blasts.map((x) => x.type).sort()).toEqual(['col', 'row']);
    expect(first.cleared.length).toBe(5 + 4 - 1);
  });

  it('every move leaves a full board with a legal move', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const b = new Board(8, 9, 5, mulberry32(seed));
      b.fillInitial();
      for (let i = 0; i < 15; i++) {
        const moves = b.allMoves();
        const [x, y] = moves[i % moves.length];
        expect(playMove(b, x, y, ctx).valid).toBe(true);
        expect(b.grid.flat().every((t) => t)).toBe(true);
        expect(b.findMatches()).toHaveLength(0);
        expect(b.findHint()).not.toBeNull();
      }
    }
  });
});

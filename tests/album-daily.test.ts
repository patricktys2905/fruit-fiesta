import { describe, it, expect } from 'vitest';
import { STICKERS, ALBUM_PAGES, freshAlbum, dropSticker, pageComplete, pageStickers, ownedCount } from '../src/meta/stickers';
import { dailyLevel, recordDaily, freshDailyPuzzle, DAILY_ID } from '../src/meta/dailyPuzzle';
import { createBoard } from '../src/core/levels';
import { mulberry32 } from '../src/core/rng';

describe('sticker album', () => {
  it('has a page of 6 unique stickers per world', () => {
    expect(STICKERS).toHaveLength(ALBUM_PAGES * 6);
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(ALBUM_PAGES * 6);
    for (let w = 1; w <= ALBUM_PAGES; w++) expect(pageStickers(w)).toHaveLength(6);
  });

  it('only drops stickers from reached worlds, favours new ones, and pages fill up', () => {
    const a = freshAlbum();
    const rng = mulberry32(7);
    let drops = 0;
    while (!pageComplete(a, 1) && drops < 60) {
      const { sticker } = dropSticker(a, 1, rng);
      expect(sticker.world).toBe(1);
      drops++;
    }
    expect(pageComplete(a, 1)).toBe(true);
    expect(drops).toBeLessThan(25); // shouldn't take forever
    for (let i = 0; i < 400; i++) dropSticker(a, 10, rng);
    expect(ownedCount(a)).toBe(60);
  });
});

describe('daily puzzle', () => {
  it('is the same for everyone on a date, different across dates, and starts playable', () => {
    const a = dailyLevel('2026-11-03'), b = dailyLevel('2026-11-03'), c = dailyLevel('2026-11-04');
    expect(a).toEqual(b);
    expect(a.seed === c.seed && a.name === c.name).toBe(false);
    expect(a.id).toBe(DAILY_ID);
    for (let d = 1; d <= 30; d++) {
      const lvl = dailyLevel(`2026-12-${String(d).padStart(2, '0')}`);
      const board = createBoard(lvl);
      expect(board.findMatches()).toHaveLength(0);
      expect(board.findHint()).not.toBeNull();
    }
  });

  it('tracks best score, first win reward and streaks', () => {
    const s = freshDailyPuzzle();
    expect(recordDaily(s, '2026-11-03', 5000, 0, false)).toBe(false);
    expect(recordDaily(s, '2026-11-03', 9000, 2, true)).toBe(true);
    expect(recordDaily(s, '2026-11-03', 12000, 3, true)).toBe(false); // already won today
    expect(s.history['2026-11-03']).toMatchObject({ best: 12000, stars: 3, tries: 3 });
    expect(recordDaily(s, '2026-11-04', 8000, 1, true)).toBe(true);
    expect(s.streak).toBe(2);
    recordDaily(s, '2026-11-07', 8000, 1, true);
    expect(s.streak).toBe(1);
  });
});

/** "What's new" notes, shown once after the game updates. Add the newest update at the TOP.
 *  `version` only needs to go up each time (it is compared as a number). */
export interface UpdateNote {
  version: number;
  date: string;
  title: string;
  notes: string[];
}

export const UPDATES: UpdateNote[] = [
  {
    version: 2,
    date: '2026-11-03',
    title: 'Starfruit Skies ☁️',
    notes: [
      'New World 11: Starfruit Skies, with 10 new levels (101–110) on floating cloud islands.',
      'Wind rows carry fruit across the gaps between islands.',
      'A new Sticker Album page and a new achievement: Sky High.',
      'Reworked a few late levels (Lava Belt, Midnight Café, Last Dance, Grand Fiesta! and more) so they play better.',
    ],
  },
  {
    version: 1,
    date: '2026-11-02',
    title: 'Fruit Fiesta launch',
    notes: ['100 levels across 10 worlds.'],
  },
];

export const LATEST_UPDATE = UPDATES[0].version;
const KEY = 'ff-seen-update';

/** Notes the player hasn't seen yet. Brand-new players see none (everything is new to them). */
export function unseenUpdates(storage: Pick<Storage, 'getItem' | 'setItem'>, isNewPlayer: boolean): UpdateNote[] {
  const stored = storage.getItem(KEY);
  // Players from before update notes existed have already seen version 1 (the launch).
  const seen = Number(stored ?? 1);
  if (isNewPlayer && stored === null) {
    storage.setItem(KEY, String(LATEST_UPDATE));
    return [];
  }
  return UPDATES.filter((u) => u.version > seen);
}

export function markUpdatesSeen(storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(KEY, String(LATEST_UPDATE));
}

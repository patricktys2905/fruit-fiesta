# Adding levels and worlds (content updates)

Fruit Fiesta is built to grow. Every update follows the same steps.

## The one golden rule
**Saved progress is keyed by level number.** Never insert, remove or reorder released levels.
Always add new levels **at the end**. `tests/updates.test.ts` checks this against
`tests/level-lock.json` and fails the build if a released level moves.

Editing a released level (layout, goals, moves) is fine. Its number stays the same.

## Add a new world
1. Copy `src/core/worlds/w11-starfruit-skies.ts` to `src/core/worlds/w12-<name>.ts`.
   - Set `id: 12`, a name, a blurb and `map: 'bg-map-12'`.
   - Write 10 levels. Give each one its own `seed` (convention: `12101`…`12110`). Set `id: 0`, because ids are filled in automatically.
   - Layout characters: `.` cell, ` ` gap, `s`/`S` sand, `o` coconut, `i`/`I` ice, `p` piñata,
     `v` lava, `l` lantern (night levels). Other options: `cafe`, `ripen`/`golden`, `tide`, `tilt`,
     `conveyors`, `night`, `personalities`, `collect`. See `LevelDef` in `src/core/levels.ts`.
2. In `src/core/levels.ts`, import it and add it to the **end** of `WORLDS`.
3. Tune it: `npm run tune -- 111 120`. Bots play every level and set the moves and stars in
   `src/core/tuning.json`. Check `npm run sim -- 111 120`. If a level stays too easy at 16 moves,
   make it harder (more obstacles, bigger goals) and remove its entry from `tuning.json` before
   tuning again. **`tuning.json` overrides moves, stars and goals in the level files.**
4. Add an album page: one row of 6 names in `NAMES` in `src/meta/stickers.ts`.
   Optionally add an achievement in `src/meta/achievements.ts`.
5. Art: generate `bg-map-12` and `sticker-12-1`…`sticker-12-6` (see `art-src/PROMPTS.md`). Save them to
   `art-src/raw/` and run `npm run art`. Without art, the map is plain and the stickers show a ⭐.
6. Add the new levels to the lock: append `{ "id", "seed", "name" }` rows to `tests/level-lock.json`.
7. Write the "What's new" note: add an entry at the **top** of `UPDATES` in `src/updates.ts` with
   the next `version` number. Returning players see it once, and new players skip it.
8. `npm test && npm run build`, then push to `main`. GitHub Actions tests and deploys.

## How players get the update
The game is an offline PWA. Once a new version is deployed, an open game checks for updates
every hour and whenever it is reopened. It downloads in the background and installs on the
next menu screen, never mid-level. After the reload, the "What's new" note pops up.

If a player reaches the last world, the map shows a "Coming soon" page and the last level says
more islands are on the way.

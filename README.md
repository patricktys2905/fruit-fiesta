# Fruit Fiesta 🍓🍊🍋🥝🍇🫐

A bright, phone-first match-3 game with family & friends play. Offline-first, no accounts.

## Run it
```
npm install
npm run dev        # opens on http://localhost:5173 and on your Wi-Fi network (for testing on a phone)
npm test           # board logic tests
npm run sim        # level balance simulator (win rates, star rates)
npm run build      # production build into dist/
```

## Special fruit
| Match | Special | Power |
|---|---|---|
| 4 in a row | Juice Jet | clears its row (or column) |
| 2x2 square | Busy Bee | flies to a fruit the level still needs and pops it |
| L / T shape | Fruit Burst | explodes everything nearby |
| 5 in a row | Rainbow Smoothie | swap with any fruit to clear all of that kind |

Swap two specials together for a Super Combo.

## Worlds
| World | Levels | New ideas |
|---|---|---|
| 1. Sunny Isle | 1-8 | fruit goals, score goals, a heart-shaped board |
| 2. Coconut Cove | 9-16 | **sand** (match on it to wash it away, deep sand takes 2) and **coconuts** (drop them to the bottom) |
| 3. Berry Mountain | 17-24 | shaped boards with gaps, everything combined |

Levels live in `src/core/levels.ts`. Layout strings: `.` cell, ` ` gap, `s` sand, `S` deep sand, `o` coconut.
Tune with `npm run sim -- <fromId> <toId>`, which prints win rates and a suggested star curve.

## Publishing
Pushing to `main` runs the GitHub Actions workflow: tests, build, then deploy to
https://patricktys2905.github.io/fruit-fiesta/. It's an installable PWA and the whole game is cached for offline play.

## Custom art (Gemini)
Prompts are in `art-src/PROMPTS.md`. Save images to `art-src/raw/` with the listed names and run
`npm run art`, which removes backgrounds, trims and resizes them into `src/art/`. The game uses any art it
finds there and falls back to the built-in drawn versions for the rest.

## Layout
- `src/core/`: pure, deterministic game logic (board, seeded RNG, levels, scoring). No DOM.
- `src/core/engine.ts`: resolves a whole move (specials, combos, cascades) into steps the renderer replays
- `src/renderer.ts`: canvas drawing, animations, particles
- `src/fruitArt.ts`: fruit drawn in code (no image files)
- `src/game.ts`: turn flow (swap → match → cascade → win/lose)
- `src/hud.ts`, `src/main.ts`, `src/style.css`: screens and UI
- `scripts/sim.ts`: plays every level hundreds of times with bots to tune difficulty

## Roadmap
1. ✅ Core prototype: board, matching, cascades, 6 levels, stars, saves
2. Signature mechanics: Flavour Combos, Island Tilt, Ripening
3. Content: 20 levels, Island Café
4. Family & Friends: profiles, Pass & Play, Duel Board, Challenge Codes, gift codes, Family Island
5. Polish + offline PWA launch (public link)

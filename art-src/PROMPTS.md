# Fruit Fiesta: Gemini art prompts

How to use:
1. Paste a prompt into Gemini (image generation).
2. Save the image into `art-src/raw/` with the **exact file name** shown (png or jpg).
3. Run `npm run art`. It removes backgrounds, trims, resizes and installs everything into the game.
4. Refresh the game. Anything you haven't made yet keeps the built-in drawn version.

Tip: generate all the fruit in **one Gemini chat**, so the style stays consistent. After the first one,
say "same style as before" in each later prompt.

---

## Shared style (paste at the start of every sprite prompt)

> Glossy, juicy, vibrant casual mobile-game art. Soft 3D look with smooth shading, a bright rim light,
> a clear white highlight, and a subtle darker outline so it reads clearly at small size. Cheerful, fresh, appetising.
> A single object, centred, filling about 85% of the frame, facing the viewer.
> **Solid pure white background, no shadow on the ground, no text, no border, no other objects.** Square image.

## Fruit (the 6 board pieces)

| File name | Prompt (after the shared style) |
|---|---|
| `fruit-0.png` | A plump ripe red strawberry with tiny golden seeds and a fresh green leafy crown. |
| `fruit-1.png` | A round shiny orange with dimpled peel texture, a small stem and one green leaf. |
| `fruit-2.png` | A bright yellow lemon, tilted slightly, with pointed ends and one small green leaf. |
| `fruit-3.png` | A kiwi cut in half seen face-on: bright green flesh, cream centre, ring of black seeds, fuzzy brown rim. |
| `fruit-4.png` | A compact bunch of glossy purple grapes in a rounded triangle shape, with a short brown stem and a leaf. |
| `fruit-5.png` | One large glossy blueberry, deep blue with a soft dusty bloom and a five-point crown on top. |

Each fruit should have a **different silhouette** as well as colour (it helps colour-blind players).

## Special pieces

| File name | Prompt (after the shared style) |
|---|---|
| `smoothie.png` | A small glass of layered rainbow smoothie (red, orange, yellow, green, blue, purple layers) with whipped cream, a cherry on top and a striped pink straw. Magical sparkles. |
| `bee.png` | A cute round bumblebee mascot flying, side view facing **left**, big friendly eyes, small smile, translucent wings, yellow and dark brown stripes. |

## Logo

| File name | Prompt |
|---|---|
| `logo.png` | Game logo text "Fruit Fiesta!" in big bubbly rounded cartoon letters: "Fruit" in sunny yellow, "Fiesta!" in hot pink, thick dark-magenta outline, glossy highlights, a few small fruits (strawberry, orange slice, lemon) decorating the letters. **Solid pure white background**, no other text. Wide format. |

Check that Gemini spelled the text correctly before saving.

## Backgrounds (portrait 9:16)

| File name | Prompt |
|---|---|
| `bg-title.png` | Vertical 9:16 mobile game title-screen background: a sunny tropical island beach festival, turquoise sea, palm trees, colourful fruit stalls with bunting and paper lanterns, soft clouds, bright cheerful daylight, painterly, soft depth of field. Leave the **centre clear** for a logo and a button. No text, no people. |
| `bg-game.png` | Vertical 9:16 mobile game background: a soft-focus tropical beach with turquoise water at the top and warm sand at the bottom, a few palm leaves framing the edges, bright and calm, **low detail and slightly blurred** so a game board on top stays easy to read. No text, no people, no objects in the centre. |

---

If a background-removal result looks wrong (white bits missing from the fruit), regenerate with
"thick darker outline" added, or give the raw file a transparent background yourself.

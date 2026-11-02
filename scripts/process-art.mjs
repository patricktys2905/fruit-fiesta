/** Cleans raw art (e.g. from Gemini) and installs it into the game.
 *
 *  1. Save images into art-src/raw/ using the names in art-src/PROMPTS.md
 *     (e.g. fruit-0.png, smoothie.jpg, bg-game.png). Any format works.
 *  2. Run `npm run art`.
 *
 *  Sprites (fruit, smoothie, bee, logo): plain/white backgrounds are removed, the
 *  image is trimmed, padded square and resized. Backgrounds: cropped to portrait
 *  and compressed. Output goes to src/art/, which the game loads automatically. */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const RAW = path.resolve('art-src/raw');
const OUT = path.resolve('src/art');
const SPRITE = /^(fruit-[0-5]|smoothie|bee|coconut|logo)$/;
const BACKGROUND = /^bg-(game|title|map(-\d+)?)$/;

fs.mkdirSync(OUT, { recursive: true });
const files = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)) : [];
if (!files.length) {
  console.log(`No images in ${RAW}. See art-src/PROMPTS.md for what to generate.`);
  process.exit(0);
}

/** Flood-fill from the edges, clearing background-coloured pixels. */
function removeBackground(data, w, h) {
  const at = (x, y) => (y * w + x) * 4;
  // Already transparent around the edges? Leave it.
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  if (corners.every((i) => data[i + 3] < 20)) return 0;

  const ref = corners.map((i) => [data[i], data[i + 1], data[i + 2]]);
  const isBg = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    // white / light-grey (incl. fake "transparency" checkerboards)
    if (min > 185 && max - min < 22) return true;
    // close to a corner colour (solid coloured backdrops)
    return ref.some(([R, G, B]) => Math.abs(r - R) + Math.abs(g - G) + Math.abs(b - B) < 60);
  };

  const mark = new Uint8Array(w * h);
  const queue = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (mark[p]) return;
    if (!isBg(p * 4)) return;
    mark[p] = 1;
    queue.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (queue.length) {
    const p = queue.pop();
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  let cleared = 0;
  for (let p = 0; p < w * h; p++) {
    if (mark[p]) { data[p * 4 + 3] = 0; cleared++; continue; }
    // soften the fringe next to removed pixels
    const x = p % w, y = (p / w) | 0;
    const edge = (x > 0 && mark[p - 1]) || (x < w - 1 && mark[p + 1]) || (y > 0 && mark[p - w]) || (y < h - 1 && mark[p + w]);
    if (edge) data[p * 4 + 3] = Math.min(data[p * 4 + 3], 150);
  }
  return cleared / (w * h);
}

function bbox(data, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

for (const file of files) {
  const name = path.basename(file, path.extname(file)).toLowerCase();
  const src = path.join(RAW, file);
  if (BACKGROUND.test(name)) {
    await sharp(src).rotate().resize({ width: 1080, height: 1920, fit: 'cover' }).webp({ quality: 82 }).toFile(path.join(OUT, `${name}.webp`));
    console.log(`OK ${name}.webp (background)`);
    continue;
  }
  if (!SPRITE.test(name)) {
    console.log(`? skipped ${file}: unknown name (see art-src/PROMPTS.md)`);
    continue;
  }
  const { data, info } = await sharp(src).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const removed = removeBackground(data, info.width, info.height);
  const box = bbox(data, info.width, info.height);
  if (!box) {
    console.log(`! ${file}: everything was removed; use a plain white background`);
    continue;
  }
  const raw = { raw: { width: info.width, height: info.height, channels: 4 } };
  let img = sharp(data, raw).extract(box);
  if (name === 'logo') {
    img = img.resize({ width: 1024, height: 640, fit: 'inside' });
  } else {
    // sharp resizes before extending within one pipeline, so pad first, then resize separately.
    const side = Math.max(box.width, box.height);
    const padded = await sharp(await img.png().toBuffer())
      .extend({
        top: Math.floor((side - box.height) / 2), bottom: Math.ceil((side - box.height) / 2),
        left: Math.floor((side - box.width) / 2), right: Math.ceil((side - box.width) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    img = sharp(padded).resize(384, 384, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  for (const ext of ['png', 'webp']) fs.rmSync(path.join(OUT, `${name}.${ext}`), { force: true });
  await img.webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(path.join(OUT, `${name}.webp`));
  const kb = fs.statSync(path.join(OUT, `${name}.webp`)).size / 1024;
  console.log(`OK ${name}.webp ${kb.toFixed(0)} KB (background removed: ${(removed * 100).toFixed(0)}%)`);
}
console.log('\nDone. Restart `npm run dev` (or refresh) to see the new art.');

/** Builds the home-screen app icons from the strawberry art. Run: node scripts/make-icons.mjs */
import sharp from 'sharp';
import fs from 'node:fs';

const OUT = 'public/icons';
fs.mkdirSync(OUT, { recursive: true });
const fruit = fs.existsSync('src/art/fruit-0.webp') ? 'src/art/fruit-0.webp' : 'public/icon.svg';

const bg = (size, radius) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#8fe6ff"/><stop offset="0.6" stop-color="#36c5e0"/><stop offset="1" stop-color="#1f8fb8"/></radialGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <ellipse cx="${size / 2}" cy="${size * 0.86}" rx="${size * 0.3}" ry="${size * 0.05}" fill="rgba(0,40,70,0.25)"/></svg>`);

async function make(name, size, { radius, scale }) {
  const f = await sharp(fruit).resize(Math.round(size * scale), Math.round(size * scale), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const off = Math.round((size - size * scale) / 2);
  await sharp(bg(size, radius)).composite([{ input: f, left: off, top: Math.round(off - size * 0.02) }]).png().toFile(`${OUT}/${name}`);
  console.log('made', name);
}

await make('icon-192.png', 192, { radius: 42, scale: 0.74 });
await make('icon-512.png', 512, { radius: 112, scale: 0.74 });
// Maskable: full-bleed background, fruit inside the 80% safe zone.
await make('maskable-512.png', 512, { radius: 0, scale: 0.58 });
await make('apple-touch-icon.png', 180, { radius: 0, scale: 0.72 });

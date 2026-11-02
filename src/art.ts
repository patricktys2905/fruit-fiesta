/** Optional hand-made / AI-generated art. Any image dropped into src/art/ with a known
 *  name replaces the built-in drawn version automatically (no code changes needed):
 *
 *   fruit-0 … fruit-5   strawberry, orange, lemon, kiwi, grape, blueberry
 *   smoothie, bee       special pieces
 *   bg-game, bg-title   backgrounds (portrait)
 *   logo                title logo
 *
 *  Use `npm run art` to clean raw images (remove backgrounds, trim, resize) first. */
const files = import.meta.glob('./art/*.{png,webp,jpg,jpeg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const urls: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop()!.replace(/\.\w+$/, '');
  urls[name] = url;
}

const images = new Map<string, HTMLImageElement>();

export const artReady: Promise<void> = Promise.all(
  Object.entries(urls).map(
    ([name, url]) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          images.set(name, img);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      }),
  ),
).then(() => undefined);

export function art(name: string): HTMLImageElement | undefined {
  return images.get(name);
}

export function artUrl(name: string): string | undefined {
  return urls[name];
}

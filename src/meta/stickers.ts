/** Sticker Album: 10 pages (one per world) of 6 stickers. Pure functions for testing. */
import { Rng, randInt } from '../core/rng';
import { Reward } from './economy';

export interface StickerDef {
  id: string;
  world: number;
  name: string;
}

const NAMES: string[][] = [
  ['Beach Day', 'Cool Berry', 'Surf Orange', 'Sandcastle', 'Coco Smoothie', 'Palm Isle'],
  ['Coco Drink', 'Pinchy', 'Seashell', 'Starfish', 'Beach Hut', 'Big Wave'],
  ['Berry Hiker', 'Summit', 'Waterfall', 'Log Cabin', 'Raspberries', 'Mountain Goat'],
  ['Shady Lemon', 'Windmill', 'Orange Tree', 'Happy Kiwi', 'Cheeky Grapes', 'Fruit Crate'],
  ['Snowman', 'Penguin', 'Ice Lolly', 'Snowflake', 'Snowy Cabin', 'Ice Skates'],
  ['Piñata', 'Maracas', 'Sombrero', 'Party Popper', 'Fiesta Guitar', 'Papel Picado'],
  ['Firefly', 'Paper Lantern', 'Moon', 'Sleepy Owl', 'Glow Shroom', 'Shooting Star'],
  ['Ferris Wheel', 'Carousel', 'Cotton Candy', 'Balloons', 'Golden Ticket', 'Popcorn'],
  ['Little Volcano', 'Lava Blob', 'Baby Dino', 'Fire Flower', 'Hot Spring', 'Toucan'],
  ['Fireworks', 'Trophy', 'Fruit Crown', 'Party Cake', 'Berry Balloon', 'Fiesta Pineapple'],
];

export const STICKERS: StickerDef[] = NAMES.flatMap((page, w) => page.map((name, i) => ({ id: `${w + 1}-${i + 1}`, world: w + 1, name })));
export const PAGE_SIZE = 6;
export const PAGE_REWARD: Reward = { coins: 300, boosters: { hammer: 1, moves5: 1 } };
export const ALBUM_REWARD: Reward = { coins: 2000, boosters: { hammer: 3, shuffle: 3, moves5: 3, beeStart: 3 }, unlimitedMin: 180 };
/** Coins for a duplicate sticker. */
export const DUPLICATE_COINS = 20;

export interface AlbumState {
  owned: Record<string, number>;
  pagesClaimed: number[];
  albumClaimed: boolean;
}

export const freshAlbum = (): AlbumState => ({ owned: {}, pagesClaimed: [], albumClaimed: false });

export const stickerArt = (s: StickerDef) => `sticker-${s.id}`;

/** Pick a sticker from the pages the player has reached. Favours ones they don't have
 *  yet (from their current world), so pages actually fill up. */
export function dropSticker(album: AlbumState, maxWorld: number, rng: Rng): { sticker: StickerDef; isNew: boolean } {
  const pool = STICKERS.filter((s) => s.world <= maxWorld);
  const missing = pool.filter((s) => !album.owned[s.id]);
  const current = missing.filter((s) => s.world === maxWorld);
  const roll = rng();
  const from = current.length && roll < 0.55 ? current : missing.length && roll < 0.8 ? missing : pool;
  const sticker = from[randInt(rng, from.length)];
  const isNew = !album.owned[sticker.id];
  album.owned[sticker.id] = (album.owned[sticker.id] ?? 0) + 1;
  return { sticker, isNew };
}

export const pageStickers = (world: number) => STICKERS.filter((s) => s.world === world);
export const pageComplete = (album: AlbumState, world: number) => pageStickers(world).every((s) => album.owned[s.id]);
export const ownedCount = (album: AlbumState) => STICKERS.filter((s) => album.owned[s.id]).length;

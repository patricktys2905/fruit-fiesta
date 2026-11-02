import './style.css';
import { LEVELS, LevelDef } from './core/levels';
import { Renderer } from './renderer';
import { Hud } from './hud';
import { Game, LevelResult } from './game';
import { sfx } from './audio';
import { fruitIconUrl, clearIconCache, makeBeeSprite } from './fruitArt';
import { artReady, artUrl } from './art';
import { setupPwa } from './pwa';
import { loadProgress, saveProgress, isUnlocked } from './save';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const screens = { title: $('screen-title'), levels: $('screen-levels'), game: $('app') };
type ScreenName = keyof typeof screens;
function show(name: ScreenName) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
  document.body.dataset.screen = name;
  $('modal').classList.add('hidden');
  $('level-card').classList.add('hidden');
}

const progress = loadProgress();
const renderer = new Renderer($<HTMLCanvasElement>('board'));
const hud = new Hud();
let current: LevelDef = LEVELS[0];
const game = new Game($<HTMLCanvasElement>('board'), renderer, hud, onLevelEnd);

// ---------- title ----------
function renderTitleFruits() {
  $('title-fruits').innerHTML = [0, 1, 2, 3, 4, 5]
    .map((k) => `<img alt="" src="${fruitIconUrl(k)}" style="animation-delay:${k * 0.12}s">`)
    .join('');
}
renderTitleFruits();

// ---------- optional Gemini / custom art ----------
void artReady.then(() => {
  const bgGame = artUrl('bg-game'), bgTitle = artUrl('bg-title'), logo = artUrl('logo'), bgMap = artUrl('bg-map');
  if (bgMap) document.documentElement.style.setProperty('--bg-map', `url("${bgMap}")`);
  if (bgGame) document.documentElement.style.setProperty('--bg-game', `url("${bgGame}")`);
  if (bgTitle) document.documentElement.style.setProperty('--bg-title', `url("${bgTitle}")`);
  document.body.classList.toggle('has-bg-game', !!bgGame);
  document.body.classList.toggle('has-bg-title', !!bgTitle);
  if (logo) $('logo').innerHTML = `<img src="${logo}" alt="Fruit Fiesta">`;
  clearIconCache();
  renderTitleFruits();
  renderer.refreshSprites();
});
$('btn-play').onclick = () => {
  sfx.unlock();
  sfx.select();
  openLevels();
};

// ---------- level select: island map ----------

/** Where each level sits on the island map, as % of the map's width/height (bottom → top). */
const MAP_SPOTS: [number, number][] = [
  [30, 84], [66, 75], [36, 63], [67, 50], [32, 37], [52, 22],
];

/** Picture shown on a level's map stop: its goal fruit, or a themed fruit for score levels. */
function levelFruit(l: LevelDef): number {
  return l.collect[0]?.kind ?? (l.id - 1) % 6;
}

function currentLevelId(): number {
  const open = LEVELS.filter((l) => isUnlocked(progress, l.id));
  const unplayed = open.find((l) => !(progress.stars[l.id] > 0));
  return (unplayed ?? open[open.length - 1]).id;
}

/** Smooth curve through points (Catmull-Rom → cubic Bézier), in SVG viewBox units. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

let beeAtLevel = 0;

function openLevels() {
  const nodes = $('map-nodes');
  nodes.innerHTML = '';
  const cur = currentLevelId();
  const toView = (s: [number, number]): [number, number] => [s[0] * 10, s[1] * 17.9];
  const all = MAP_SPOTS.slice(0, LEVELS.length).map(toView);
  const done = all.slice(0, LEVELS.findIndex((l) => l.id === cur) + 1);
  $('map-path').innerHTML = `
    <path d="${smoothPath(all)}" class="trail-base"/>
    <path d="${smoothPath(all)}" class="trail-dots"/>
    <path d="${smoothPath(done)}" class="trail-done"/>`;

  LEVELS.forEach((lvl, i) => {
    const [x, y] = MAP_SPOTS[i];
    const unlocked = isUnlocked(progress, lvl.id);
    const stars = progress.stars[lvl.id] ?? 0;
    const state = !unlocked ? 'locked' : lvl.id === cur ? 'current' : 'done';
    const btn = document.createElement('button');
    btn.className = `node ${state}`;
    btn.style.left = `${x}%`;
    btn.style.top = `${y}%`;
    btn.style.setProperty('--i', String(i));
    btn.setAttribute('aria-label', `Level ${lvl.id}, ${lvl.name}${unlocked ? `, ${stars} stars` : ', locked'}`);
    btn.innerHTML = `
      <span class="node-stars">${[0, 1, 2].map((s) => `<i class="${s < stars ? 'on' : ''}">★</i>`).join('')}</span>
      <span class="node-disc"><img alt="" src="${fruitIconUrl(levelFruit(lvl))}">${unlocked ? '' : '<span class="node-lock">🔒</span>'}</span>
      <span class="node-num">${lvl.id}</span>`;
    if (unlocked) btn.onclick = () => openLevelCard(lvl);
    nodes.appendChild(btn);
  });

  const total = Object.values(progress.stars).reduce((a, b) => a + b, 0);
  $('total-stars').textContent = `★ ${total}/${LEVELS.length * 3}`;
  show('levels');

  // The bee marks where you are, and flies to the next stop after a win.
  const bee = $<HTMLImageElement>('map-bee');
  bee.src = artUrl('bee') ?? makeBeeSprite(128).toDataURL();
  const place = (id: number) => {
    const [x, y] = MAP_SPOTS[LEVELS.findIndex((l) => l.id === id)];
    bee.style.left = `${x}%`;
    bee.style.top = `${y}%`;
  };
  if (beeAtLevel && beeAtLevel !== cur) {
    bee.classList.add('no-anim');
    place(beeAtLevel);
    void bee.offsetWidth;
    bee.classList.remove('no-anim');
    setTimeout(() => {
      place(cur);
      sfx.buzz();
      setTimeout(() => {
        const node = nodes.children[LEVELS.findIndex((l) => l.id === cur)] as HTMLElement | undefined;
        node?.classList.add('just-unlocked');
        sfx.create();
      }, 1000);
    }, 450);
  } else {
    bee.classList.add('no-anim');
    place(cur);
    void bee.offsetWidth;
    bee.classList.remove('no-anim');
  }
  beeAtLevel = cur;

  // Keep the current stop in view on short screens.
  const node = nodes.children[LEVELS.findIndex((l) => l.id === cur)] as HTMLElement | undefined;
  node?.scrollIntoView({ block: 'center' });
}
$('btn-levels-back').onclick = () => show('title');

// ---------- level preview card ----------
let cardLevel: LevelDef = LEVELS[0];
function openLevelCard(lvl: LevelDef) {
  sfx.select();
  cardLevel = lvl;
  $<HTMLImageElement>('lc-fruit').src = fruitIconUrl(levelFruit(lvl));
  $('lc-level').textContent = `Level ${lvl.id}`;
  $('lc-name').textContent = lvl.name;
  const stars = progress.stars[lvl.id] ?? 0;
  [...$('lc-stars').children].forEach((el, i) => el.classList.toggle('on', i < stars));
  $('lc-goal').innerHTML = lvl.collect.length
    ? lvl.collect.map((g) => `<span class="lc-goal-item"><img alt="" src="${fruitIconUrl(g.kind)}"><b>${g.count}</b></span>`).join('')
    : `<span class="lc-goal-item score"><b>${lvl.stars[0].toLocaleString()}</b> points</span>`;
  $('lc-moves').textContent = String(lvl.moves);
  $('level-card').classList.remove('hidden');
}
const closeCard = () => $('level-card').classList.add('hidden');
$('lc-close').onclick = closeCard;
$('level-card').onclick = (e) => {
  if (e.target === $('level-card')) closeCard();
};
$('lc-play').onclick = () => {
  closeCard();
  startLevel(cardLevel);
};

// ---------- game ----------
function startLevel(level: LevelDef) {
  sfx.unlock();
  current = level;
  show('game');
  requestAnimationFrame(() => void game.start(level));
}

$('btn-back').onclick = () => {
  game.stop();
  openLevels();
};

const soundBtn = $('btn-sound');
const syncSound = () => (soundBtn.textContent = sfx.muted ? '🔇' : '🔊');
syncSound();
soundBtn.onclick = () => {
  sfx.setMuted(!sfx.muted);
  syncSound();
};

// ---------- results ----------
function onLevelEnd(r: LevelResult) {
  const prevStars = progress.stars[r.level.id] ?? 0;
  const prevBest = progress.best[r.level.id] ?? 0;
  if (r.won) {
    progress.stars[r.level.id] = Math.max(prevStars, r.stars);
    progress.best[r.level.id] = Math.max(progress.best[r.level.id] ?? 0, r.score);
    saveProgress(progress);
    sfx.win();
  } else {
    sfx.lose();
  }

  $('modal-title').textContent = r.won ? 'Delicious!' : 'Out of moves!';
  const starEls = [...$('modal-stars').children] as HTMLElement[];
  starEls.forEach((el, i) => {
    el.classList.remove('on');
    if (i < r.stars) {
      el.style.animationDelay = `${0.25 + i * 0.3}s`;
      setTimeout(() => sfx.star(i), 250 + i * 300);
      requestAnimationFrame(() => el.classList.add('on'));
    }
  });
  $('modal-score').textContent = `Score ${r.score.toLocaleString()}`;
  $('modal-note').textContent = r.won
    ? r.score > prevBest ? 'New best score!' : `Best: ${prevBest.toLocaleString()}`
    : 'So close! Have another go.';
  const next = LEVELS.find((l) => l.id === r.level.id + 1);
  $('btn-modal-next').classList.toggle('hidden', !r.won || !next);
  $('modal').classList.remove('hidden');
}

$('btn-modal-retry').onclick = () => startLevel(current);
$('btn-modal-levels').onclick = () => openLevels();
$('btn-modal-next').onclick = () => {
  const next = LEVELS.find((l) => l.id === current.id + 1);
  if (next) startLevel(next);
};

show('title');
setupPwa();

if (import.meta.env.DEV) (window as unknown as { __ff: unknown }).__ff = { game, renderer, LEVELS, startLevel, progress, openLevels };

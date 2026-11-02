import './style.css';
import { LEVELS, LevelDef, WORLDS, WorldDef, hasSand } from './core/levels';
import { COCONUT } from './core/board';
import { goalSpecs } from './goals';
import { Renderer } from './renderer';
import { Hud } from './hud';
import { Game, LevelResult } from './game';
import { sfx } from './audio';
import { fruitIconUrl, clearIconCache, makeBeeSprite, sandIconUrl, goldenIconUrl } from './fruitArt';
import { artReady, artUrl } from './art';
import { setupPwa, toast } from './pwa';
import { Meta } from './metaUi';
import { loadProgress, saveProgress, isUnlocked } from './save';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const screens = { title: $('screen-title'), levels: $('screen-levels'), game: $('app') };
type ScreenName = keyof typeof screens;
function show(name: ScreenName) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
  document.body.dataset.screen = name;
  $('modal').classList.add('hidden');
  $('level-card').classList.add('hidden');
  $('panel').classList.add('hidden');
  $('confirm').classList.add('hidden');
}

const progress = loadProgress();
const meta = new Meta(progress);
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

// ---------- level select: world maps ----------

/** Picture shown on a level's map stop and card: its main goal. */
function levelIcon(l: LevelDef): string {
  if (l.cafe) return fruitIconUrl(-1);
  if (l.golden) return goldenIconUrl();
  if (l.collect[0]) return fruitIconUrl(l.collect[0].kind);
  if (l.coconuts) return fruitIconUrl(COCONUT);
  if (hasSand(l)) return sandIconUrl();
  return fruitIconUrl((l.id - 1) % 6);
}

function currentLevelId(): number {
  const open = LEVELS.filter((l) => isUnlocked(progress, l.id));
  const unplayed = open.find((l) => !(progress.stars[l.id] > 0));
  return (unplayed ?? open[open.length - 1]).id;
}

const worldUnlocked = (w: WorldDef) => isUnlocked(progress, w.levels[0].id);

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

let viewWorld = 0;
let beeAtLevel = 0;

function openLevels(worldIndex?: number) {
  const cur = currentLevelId();
  viewWorld = worldIndex ?? WORLDS.findIndex((w) => w.levels.some((l) => l.id === cur));
  show('levels');
  renderWorld(0);
}

function renderWorld(direction: number) {
  const world = WORLDS[viewWorld];
  const open = worldUnlocked(world);
  const cur = currentLevelId();
  const map = $('map');

  $('world-sub').textContent = `World ${world.id}`;
  $('world-name').textContent = world.name;
  $('map-blurb').textContent = world.blurb;
  const art = artUrl(world.map);
  map.style.backgroundImage = art ? `url("${art}")` : '';
  map.classList.toggle('locked-world', !open);
  $('map-lock-text').textContent = viewWorld > 0 ? `Finish ${WORLDS[viewWorld - 1].name} to unlock` : '';
  $<HTMLButtonElement>('world-prev').disabled = viewWorld === 0;
  $<HTMLButtonElement>('world-next').disabled = viewWorld === WORLDS.length - 1;
  if (direction) {
    map.classList.remove('slide-left', 'slide-right');
    void map.offsetWidth;
    map.classList.add(direction > 0 ? 'slide-left' : 'slide-right');
  }

  const stars = world.levels.reduce((n, l) => n + (progress.stars[l.id] ?? 0), 0);
  $('total-stars').textContent = `★ ${stars}/${world.levels.length * 3}`;

  // trail
  const toView = (s: [number, number]): [number, number] => [s[0] * 10, s[1] * 17.9];
  const pts = world.spots.slice(0, world.levels.length).map(toView);
  const reached = world.levels.filter((l) => isUnlocked(progress, l.id)).length;
  $('map-path').innerHTML = `
    <path d="${smoothPath(pts)}" class="trail-base"/>
    <path d="${smoothPath(pts)}" class="trail-dots"/>
    <path d="${smoothPath(pts.slice(0, reached))}" class="trail-done"/>`;

  // stops
  const nodes = $('map-nodes');
  nodes.innerHTML = '';
  world.levels.forEach((lvl, i) => {
    const [x, y] = world.spots[i];
    const unlocked = isUnlocked(progress, lvl.id);
    const s = progress.stars[lvl.id] ?? 0;
    const state = !unlocked ? 'locked' : lvl.id === cur ? 'current' : 'done';
    const btn = document.createElement('button');
    btn.className = `node ${state}`;
    btn.style.left = `${x}%`;
    btn.style.top = `${y}%`;
    btn.style.setProperty('--i', String(i));
    btn.setAttribute('aria-label', `Level ${lvl.id}, ${lvl.name}${unlocked ? `, ${s} stars` : ', locked'}`);
    btn.innerHTML = `
      <span class="node-stars">${[0, 1, 2].map((k) => `<i class="${k < s ? 'on' : ''}">★</i>`).join('')}</span>
      <span class="node-disc"><img alt="" src="${levelIcon(lvl)}">${unlocked ? '' : '<span class="node-lock">🔒</span>'}</span>
      <span class="node-num">${lvl.id}</span>`;
    if (unlocked) btn.onclick = () => openLevelCard(lvl);
    nodes.appendChild(btn);
  });

  // The bee marks where you are, and flies to the next stop after a win.
  const bee = $<HTMLImageElement>('map-bee');
  const curIndex = world.levels.findIndex((l) => l.id === cur);
  bee.classList.toggle('hidden', curIndex < 0);
  if (curIndex < 0) return;
  bee.src = artUrl('bee') ?? makeBeeSprite(128).toDataURL();
  const place = (id: number) => {
    const [x, y] = world.spots[world.levels.findIndex((l) => l.id === id)];
    bee.style.left = `${x}%`;
    bee.style.top = `${y}%`;
  };
  const prevIndex = world.levels.findIndex((l) => l.id === beeAtLevel);
  const jump = () => {
    bee.classList.add('no-anim');
    void bee.offsetWidth;
    bee.classList.remove('no-anim');
  };
  if (beeAtLevel && beeAtLevel !== cur && prevIndex >= 0) {
    bee.classList.add('no-anim');
    place(beeAtLevel);
    jump();
    setTimeout(() => {
      place(cur);
      sfx.buzz();
      setTimeout(() => {
        (nodes.children[curIndex] as HTMLElement | undefined)?.classList.add('just-unlocked');
        sfx.create();
      }, 1000);
    }, 450);
  } else {
    bee.classList.add('no-anim');
    place(cur);
    jump();
    if (beeAtLevel && beeAtLevel !== cur && curIndex === 0) {
      toast(`🎉 ${world.name} unlocked!`);
      (nodes.children[0] as HTMLElement | undefined)?.classList.add('just-unlocked');
      sfx.win();
    }
  }
  beeAtLevel = cur;
  (nodes.children[curIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'center' });
}

function changeWorld(delta: number) {
  const next = viewWorld + delta;
  if (next < 0 || next >= WORLDS.length) return;
  viewWorld = next;
  sfx.select();
  renderWorld(delta);
}
$('world-prev').onclick = () => changeWorld(-1);
$('world-next').onclick = () => changeWorld(1);
{
  // swipe between worlds
  let sx = 0, sy = 0, tracking = false;
  const area = $('map-scroll');
  area.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; tracking = true; });
  area.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) changeWorld(dx < 0 ? 1 : -1);
  });
}
$('btn-levels-back').onclick = () => show('title');

// ---------- level preview card ----------
let cardLevel: LevelDef = LEVELS[0];
function openLevelCard(lvl: LevelDef) {
  sfx.select();
  cardLevel = lvl;
  $<HTMLImageElement>('lc-fruit').src = levelIcon(lvl);
  $('lc-level').textContent = `Level ${lvl.id}`;
  $('lc-name').textContent = lvl.name;
  const stars = progress.stars[lvl.id] ?? 0;
  [...$('lc-stars').children].forEach((el, i) => el.classList.toggle('on', i < stars));
  const specs = goalSpecs(lvl);
  $('lc-goal').innerHTML = specs.length
    ? specs.map((g) => `<span class="lc-goal-item"><img alt="${g.label}" src="${g.icon}"><b>${g.count}</b></span>`).join('')
    : `<span class="lc-goal-item score"><b>${lvl.stars[0].toLocaleString()}</b> points</span>`;
  const tips: string[] = [];
  if (lvl.cafe) tips.push(`Serve ${lvl.cafe.serve} customers before they lose patience`);
  if (lvl.ripen) tips.push('Green fruit ripens into golden fruit worth double, but spoils if left too long');
  if (lvl.tide) tips.push('The tide rises every few moves: match at the waterline to push it back');
  if (lvl.tilt) tips.push('Use the tilt buttons to change which way fruit falls');
  if (hasSand(lvl)) tips.push('Match fruit on the sand to wash it away');
  if (lvl.coconuts) tips.push('Drop coconuts to the bottom to collect them');
  $('lc-tip').textContent = tips.join(' · ');
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
  if (!meta.canStart()) {
    toast('💔 Out of lives! Check Daily Quests for more');
    if (document.body.dataset.screen !== 'levels') openLevels();
    return;
  }
  current = level;
  $('tilt-bar').classList.toggle('hidden', !level.tilt);
  show('game');
  requestAnimationFrame(() => void game.start(level));
}

$('btn-back').onclick = () => {
  if (game.inProgress && game.movesMade > 0) {
    $('confirm').classList.remove('hidden');
    return;
  }
  game.stop();
  openLevels();
};
$('confirm-stay').onclick = () => $('confirm').classList.add('hidden');
$('confirm-leave').onclick = () => {
  game.stop();
  meta.loseLife();
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

  $('modal-title').textContent = r.won ? 'Delicious!' : r.reason === 'flooded' ? 'Flooded! 🌊' : 'Out of moves!';
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
    : 'So close! You lost a life 💔';
  meta.onLevelEnd(r.report);
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

// ---------- island tilt controls ----------
const tiltBtns = [...document.querySelectorAll<HTMLButtonElement>('.tilt-btn')];
game.onTiltChange = (g) => tiltBtns.forEach((b) => b.classList.toggle('current', b.dataset.dir === g));
tiltBtns.forEach((b) => (b.onclick = () => void game.tilt(b.dataset.dir as 'down' | 'up' | 'left' | 'right')));
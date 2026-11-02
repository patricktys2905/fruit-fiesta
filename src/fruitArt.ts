/** Procedurally drawn fruit sprites. Each fruit has a distinct shape AND colour
 *  so the board stays readable for colour-blind players. */

import { art } from './art';

export interface FruitInfo {
  name: string;
  color: string;
}

export const FRUITS: FruitInfo[] = [
  { name: 'Strawberry', color: '#ff3b5c' },
  { name: 'Orange', color: '#ff9a1f' },
  { name: 'Lemon', color: '#ffd83a' },
  { name: 'Kiwi', color: '#7bd13b' },
  { name: 'Grape', color: '#a456ff' },
  { name: 'Blueberry', color: '#3d7bff' },
];

type Ctx = CanvasRenderingContext2D;

function radial(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function shine(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = -0.6, a = 0.45) {
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function leaf(ctx: Ctx, x: number, y: number, len: number, angle: number, color = '#3fae3a') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.35, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.35, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,60,0,0.35)';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len * 0.85, 0);
  ctx.stroke();
  ctx.restore();
}

function outline(ctx: Ctx, color = 'rgba(60,10,30,0.35)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.025;
  ctx.stroke();
}

function strawberry(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(0.5, 0.93);
  ctx.bezierCurveTo(0.2, 0.78, 0.07, 0.45, 0.2, 0.31);
  ctx.bezierCurveTo(0.31, 0.2, 0.44, 0.25, 0.5, 0.28);
  ctx.bezierCurveTo(0.56, 0.25, 0.69, 0.2, 0.8, 0.31);
  ctx.bezierCurveTo(0.93, 0.45, 0.8, 0.78, 0.5, 0.93);
  ctx.closePath();
  ctx.fillStyle = radial(ctx, 0.4, 0.42, 0.6, [[0, '#ff8a9a'], [0.45, '#f0203f'], [1, '#9e0a2a']]);
  ctx.fill();
  outline(ctx);
  // seeds
  ctx.fillStyle = '#ffe680';
  const seeds = [[0.32, 0.42], [0.5, 0.4], [0.68, 0.42], [0.25, 0.55], [0.42, 0.53], [0.58, 0.53], [0.75, 0.55], [0.34, 0.66], [0.5, 0.66], [0.66, 0.66], [0.42, 0.78], [0.58, 0.78]];
  for (const [x, y] of seeds) {
    ctx.beginPath();
    ctx.ellipse(x, y, 0.017, 0.027, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // leafy crown
  for (let i = 0; i < 5; i++) leaf(ctx, 0.5, 0.27, 0.2, Math.PI + (i / 4) * Math.PI, i % 2 ? '#2f9a33' : '#46b83f');
  ctx.fillStyle = '#2d7a2a';
  ctx.fillRect(0.485, 0.1, 0.03, 0.15);
  shine(ctx, 0.33, 0.45, 0.06, 0.11, 0.5, 0.4);
}

function orange(ctx: Ctx) {
  ctx.beginPath();
  ctx.arc(0.5, 0.54, 0.38, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, 0.38, 0.42, 0.5, [[0, '#ffd27a'], [0.5, '#ff8f0f'], [1, '#c95500']]);
  ctx.fill();
  outline(ctx, 'rgba(120,50,0,0.35)');
  // peel dimples
  ctx.fillStyle = 'rgba(160,70,0,0.18)';
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996, d = 0.06 + 0.29 * Math.sqrt((i + 0.5) / 26);
    ctx.beginPath();
    ctx.arc(0.5 + Math.cos(a) * d, 0.54 + Math.sin(a) * d, 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#5b7a1e';
  ctx.beginPath();
  ctx.arc(0.5, 0.18, 0.035, 0, Math.PI * 2);
  ctx.fill();
  leaf(ctx, 0.51, 0.17, 0.24, -0.45);
  shine(ctx, 0.36, 0.4, 0.09, 0.05, -0.7);
}

function lemon(ctx: Ctx) {
  ctx.save();
  ctx.translate(0.5, 0.53);
  ctx.rotate(-0.45);
  ctx.beginPath();
  ctx.moveTo(-0.44, 0);
  ctx.bezierCurveTo(-0.4, -0.06, -0.36, -0.3, 0, -0.3);
  ctx.bezierCurveTo(0.36, -0.3, 0.4, -0.06, 0.44, 0);
  ctx.bezierCurveTo(0.4, 0.06, 0.36, 0.3, 0, 0.3);
  ctx.bezierCurveTo(-0.36, 0.3, -0.4, 0.06, -0.44, 0);
  ctx.closePath();
  ctx.fillStyle = radial(ctx, -0.1, -0.1, 0.5, [[0, '#fff7a8'], [0.5, '#ffd91a'], [1, '#d9a400']]);
  ctx.fill();
  outline(ctx, 'rgba(120,90,0,0.4)');
  ctx.fillStyle = 'rgba(170,120,0,0.15)';
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996, d = Math.sqrt((i + 0.5) / 18);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d * 0.3, Math.sin(a) * d * 0.2, 0.01, 0, Math.PI * 2);
    ctx.fill();
  }
  shine(ctx, -0.12, -0.13, 0.12, 0.045, 0, 0.5);
  ctx.restore();
  leaf(ctx, 0.73, 0.33, 0.2, -0.9);
}

function kiwi(ctx: Ctx) {
  ctx.beginPath();
  ctx.arc(0.5, 0.52, 0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#7a4e22';
  ctx.fill();
  outline(ctx, 'rgba(50,25,0,0.5)');
  ctx.beginPath();
  ctx.arc(0.5, 0.52, 0.345, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, 0.5, 0.52, 0.35, [[0, '#e4f79a'], [0.35, '#9ee04a'], [1, '#4f9e18']]);
  ctx.fill();
  // radial fibres
  ctx.strokeStyle = 'rgba(240,255,200,0.35)';
  ctx.lineWidth = 0.008;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0.5 + Math.cos(a) * 0.1, 0.52 + Math.sin(a) * 0.1);
    ctx.lineTo(0.5 + Math.cos(a) * 0.32, 0.52 + Math.sin(a) * 0.32);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0.5, 0.52, 0.085, 0.065, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#f7f9d6';
  ctx.fill();
  ctx.fillStyle = '#1d1a10';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.save();
    ctx.translate(0.5 + Math.cos(a) * 0.15, 0.52 + Math.sin(a) * 0.15);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.022, 0.011, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  shine(ctx, 0.36, 0.34, 0.08, 0.035, -0.6, 0.35);
}

function grape(ctx: Ctx) {
  ctx.strokeStyle = '#5a3a14';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(0.5, 0.2);
  ctx.quadraticCurveTo(0.52, 0.1, 0.6, 0.07);
  ctx.stroke();
  leaf(ctx, 0.52, 0.15, 0.24, -0.25, '#4cae3c');
  const balls = [
    [0.3, 0.32], [0.5, 0.3], [0.7, 0.32],
    [0.38, 0.5], [0.62, 0.5],
    [0.28, 0.5], [0.72, 0.5],
    [0.4, 0.68], [0.6, 0.68], [0.5, 0.84],
  ].sort((a, b) => a[1] - b[1]);
  for (const [x, y] of balls) {
    ctx.beginPath();
    ctx.arc(x, y, 0.115, 0, Math.PI * 2);
    ctx.fillStyle = radial(ctx, x - 0.04, y - 0.04, 0.15, [[0, '#d7a6ff'], [0.45, '#8a3ef0'], [1, '#4b158f']]);
    ctx.fill();
    outline(ctx, 'rgba(40,0,70,0.4)');
    shine(ctx, x - 0.04, y - 0.045, 0.03, 0.018, -0.6, 0.6);
  }
}

function blueberry(ctx: Ctx) {
  ctx.beginPath();
  ctx.arc(0.5, 0.54, 0.37, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, 0.38, 0.42, 0.5, [[0, '#8fb6ff'], [0.45, '#3a6cf0'], [1, '#18328c']]);
  ctx.fill();
  outline(ctx, 'rgba(10,20,70,0.45)');
  // dusty bloom
  ctx.fillStyle = 'rgba(220,235,255,0.12)';
  ctx.beginPath();
  ctx.arc(0.55, 0.6, 0.27, 0, Math.PI * 2);
  ctx.fill();
  // crown star
  ctx.save();
  ctx.translate(0.5, 0.33);
  ctx.fillStyle = '#16245e';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.035 : 0.09;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.6);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  shine(ctx, 0.35, 0.47, 0.07, 0.04, -0.7, 0.45);
}

/** Rainbow Smoothie: a glass of layered rainbow juice with a straw and a cherry. */
function smoothie(ctx: Ctx) {
  const cup = () => {
    ctx.beginPath();
    ctx.moveTo(0.22, 0.34);
    ctx.lineTo(0.78, 0.34);
    ctx.lineTo(0.68, 0.92);
    ctx.quadraticCurveTo(0.5, 0.96, 0.32, 0.92);
    ctx.closePath();
  };
  // straw
  ctx.save();
  ctx.translate(0.6, 0.3);
  ctx.rotate(0.35);
  ctx.fillStyle = '#ff5c8a';
  ctx.fillRect(-0.03, -0.26, 0.06, 0.4);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) ctx.fillRect(-0.03, -0.24 + i * 0.1, 0.06, 0.04);
  ctx.restore();
  // rainbow layers
  ctx.save();
  cup();
  ctx.clip();
  const bands = ['#ff4b6e', '#ff9a1f', '#ffe03a', '#62d94a', '#3d9bff', '#a456ff'];
  bands.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    const y = 0.34 + i * 0.1;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 1.01; x += 0.1) ctx.lineTo(x, y + Math.sin(x * 14 + i) * 0.015);
    ctx.lineTo(1, 1);
    ctx.lineTo(0, 1);
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0.28, 0.36, 0.06, 0.5);
  ctx.restore();
  cup();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 0.03;
  ctx.stroke();
  // whipped cream
  ctx.fillStyle = '#fffdf6';
  for (const [x, y, r] of [[0.3, 0.33, 0.09], [0.43, 0.29, 0.11], [0.57, 0.29, 0.11], [0.7, 0.33, 0.09], [0.5, 0.22, 0.09]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(200,160,180,0.5)';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.arc(0.5, 0.26, 0.16, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  // cherry
  ctx.beginPath();
  ctx.arc(0.47, 0.13, 0.07, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, 0.45, 0.11, 0.08, [[0, '#ff8a9a'], [1, '#c80c33']]);
  ctx.fill();
  ctx.strokeStyle = '#2d7a2a';
  ctx.lineWidth = 0.015;
  ctx.beginPath();
  ctx.moveTo(0.48, 0.07);
  ctx.quadraticCurveTo(0.5, 0.0, 0.58, 0.02);
  ctx.stroke();
}

/** Busy Bee. */
export function drawBee(ctx: Ctx) {
  // wings
  ctx.fillStyle = 'rgba(220,245,255,0.85)';
  ctx.strokeStyle = 'rgba(120,170,200,0.7)';
  ctx.lineWidth = 0.02;
  for (const [x, rot] of [[0.4, -0.5], [0.58, 0.3]]) {
    ctx.beginPath();
    ctx.ellipse(x, 0.3, 0.13, 0.2, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // body
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0.5, 0.58, 0.32, 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, 0.42, 0.5, 0.35, [[0, '#fff27a'], [0.6, '#ffc61a'], [1, '#e09400']]);
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#2a1d10';
  for (const x of [0.46, 0.62]) ctx.fillRect(x, 0.3, 0.07, 0.6);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0.5, 0.58, 0.32, 0.24, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(60,30,0,0.6)';
  ctx.lineWidth = 0.025;
  ctx.stroke();
  // stinger
  ctx.fillStyle = '#2a1d10';
  ctx.beginPath();
  ctx.moveTo(0.82, 0.56);
  ctx.lineTo(0.92, 0.6);
  ctx.lineTo(0.82, 0.64);
  ctx.fill();
  // face
  ctx.fillStyle = '#2a1d10';
  ctx.beginPath();
  ctx.arc(0.3, 0.53, 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0.29, 0.52, 0.014, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a1d10';
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  ctx.arc(0.3, 0.62, 0.05, 0.1 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  // antennae
  ctx.beginPath();
  ctx.moveTo(0.3, 0.38);
  ctx.quadraticCurveTo(0.22, 0.24, 0.16, 0.24);
  ctx.moveTo(0.36, 0.37);
  ctx.quadraticCurveTo(0.34, 0.22, 0.28, 0.18);
  ctx.stroke();
  shine(ctx, 0.42, 0.46, 0.07, 0.03, -0.3, 0.6);
}

/** Coconut: hairy brown shell with three "eyes". */
function coconut(ctx: Ctx) {
  ctx.beginPath();
  ctx.ellipse(0.5, 0.53, 0.38, 0.36, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, 0.38, 0.4, 0.5, [[0, '#b07a48'], [0.55, '#7a4a22'], [1, '#4a2a10']]);
  ctx.fill();
  outline(ctx, 'rgba(40,20,5,0.6)');
  ctx.strokeStyle = 'rgba(210,170,120,0.45)';
  ctx.lineWidth = 0.012;
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39996, d = 0.06 + 0.3 * Math.sqrt((i + 0.5) / 40);
    const x = 0.5 + Math.cos(a) * d, y = 0.53 + Math.sin(a) * d * 0.95;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a + 1.2) * 0.04, y + Math.sin(a + 1.2) * 0.04);
    ctx.stroke();
  }
  ctx.fillStyle = '#2a160a';
  for (const [x, y] of [[0.42, 0.32], [0.58, 0.32], [0.5, 0.43]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 0.035, 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  shine(ctx, 0.36, 0.42, 0.08, 0.04, -0.6, 0.3);
}

const DRAW = [strawberry, orange, lemon, kiwi, grape, blueberry];

function blank(px: number) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.max(8, Math.round(px));
  return { cv, ctx: cv.getContext('2d')! };
}

/** Draw an art image "contain"-fitted with a little padding. */
function drawArt(ctx: Ctx, img: HTMLImageElement, size: number, pad = 0.04) {
  const s = size * (1 - pad * 2);
  const k = Math.min(s / img.width, s / img.height);
  const w = img.width * k, h = img.height * k;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
}

/** Sprite for a fruit kind (0..5), the Rainbow Smoothie (-1) or a coconut (-2). Uses Gemini art if present. */
export function makeFruitSprite(kind: number, px: number): HTMLCanvasElement {
  const { cv, ctx } = blank(px);
  const img = art(kind === -2 ? 'coconut' : kind < 0 ? 'smoothie' : `fruit-${kind}`);
  ctx.fillStyle = 'rgba(0,40,60,0.22)';
  ctx.beginPath();
  ctx.ellipse(cv.width * 0.5, cv.height * 0.92, cv.width * 0.3, cv.height * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  if (img) {
    drawArt(ctx, img, cv.width, 0.06);
    return cv;
  }
  ctx.scale(cv.width, cv.height);
  (kind === -2 ? coconut : kind < 0 ? smoothie : DRAW[kind])(ctx);
  return cv;
}

/** Sand patch drawn under fruit: 1 = light sand, 2 = deep sand. */
export function makeSandSprite(layers: number, px: number): HTMLCanvasElement {
  const { cv, ctx } = blank(px);
  const s = cv.width;
  const r = s * 0.2;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(s, 0, s, s, r);
  ctx.arcTo(s, s, 0, s, r);
  ctx.arcTo(0, s, 0, 0, r);
  ctx.arcTo(0, 0, s, 0, r);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, s, s);
  if (layers >= 2) {
    g.addColorStop(0, '#e6b866');
    g.addColorStop(1, '#c48a3c');
  } else {
    g.addColorStop(0, '#fbe3a6');
    g.addColorStop(1, '#efc97a');
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = layers >= 2 ? 'rgba(130,80,20,0.55)' : 'rgba(190,140,60,0.45)';
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.stroke();
  // grains and ripples
  ctx.save();
  ctx.clip();
  let seed = layers * 97 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.45)' : 'rgba(150,100,40,0.3)';
    ctx.beginPath();
    ctx.arc(rnd() * s, rnd() * s, s * (0.012 + rnd() * 0.02), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(160,110,40,0.25)';
  ctx.lineWidth = s * 0.025;
  for (let i = 0; i < (layers >= 2 ? 3 : 2); i++) {
    const y = s * (0.3 + i * 0.22);
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, y);
    ctx.quadraticCurveTo(s * 0.5, y - s * 0.12, s * 1.1, y);
    ctx.stroke();
  }
  ctx.restore();
  return cv;
}

/** Spoiled fruit: a squishy brown blob. */
export function makeMushSprite(px: number): HTMLCanvasElement {
  const { cv, ctx } = blank(px);
  ctx.scale(cv.width, cv.height);
  ctx.fillStyle = 'rgba(0,40,60,0.2)';
  ctx.beginPath();
  ctx.ellipse(0.5, 0.9, 0.32, 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.14, 0.82);
  ctx.bezierCurveTo(0.06, 0.6, 0.2, 0.36, 0.36, 0.4);
  ctx.bezierCurveTo(0.4, 0.2, 0.62, 0.2, 0.66, 0.38);
  ctx.bezierCurveTo(0.84, 0.36, 0.96, 0.62, 0.86, 0.82);
  ctx.quadraticCurveTo(0.5, 0.92, 0.14, 0.82);
  ctx.fillStyle = radial(ctx, 0.42, 0.45, 0.5, [[0, '#a68a5a'], [0.6, '#7a6236'], [1, '#4f3d1e']]);
  ctx.fill();
  outline(ctx, 'rgba(40,30,10,0.6)');
  ctx.fillStyle = 'rgba(60,90,30,0.55)';
  for (const [x, y, r] of [[0.32, 0.62, 0.06], [0.6, 0.55, 0.05], [0.7, 0.72, 0.04], [0.45, 0.76, 0.035]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // droopy face
  ctx.strokeStyle = '#2e2210';
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.moveTo(0.38, 0.5); ctx.lineTo(0.46, 0.53);
  ctx.moveTo(0.62, 0.5); ctx.lineTo(0.54, 0.53);
  ctx.moveTo(0.42, 0.66); ctx.quadraticCurveTo(0.5, 0.6, 0.58, 0.66);
  ctx.stroke();
  shine(ctx, 0.36, 0.44, 0.06, 0.025, -0.5, 0.35);
  return cv;
}

/** Recolour a fruit sprite: unripe (green, dull) or golden (shiny). */
export function tintSprite(src: HTMLCanvasElement, mode: 'unripe' | 'golden'): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const ctx = cv.getContext('2d')!;
  if (mode === 'unripe') {
    ctx.filter = 'saturate(0.35) brightness(0.95)';
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(110,190,60,0.55)';
    ctx.fillRect(0, 0, cv.width, cv.height);
  } else {
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
    g.addColorStop(0, 'rgba(255,240,150,0.55)');
    g.addColorStop(0.5, 'rgba(255,200,40,0.45)');
    g.addColorStop(1, 'rgba(230,150,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  return cv;
}

let goldenIcon = '';
export function goldenIconUrl(): string {
  if (!goldenIcon) {
    const { cv, ctx } = blank(96);
    const g = ctx.createRadialGradient(48, 48, 8, 48, 48, 48);
    g.addColorStop(0, 'rgba(255,240,140,1)');
    g.addColorStop(1, 'rgba(255,200,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    ctx.drawImage(tintSprite(makeFruitSprite(1, 96), 'golden'), 8, 8, 80, 80);
    // sparkle star
    ctx.fillStyle = '#fffbe0';
    ctx.strokeStyle = '#d99a00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 6 : 18, a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(74 + Math.cos(a) * r, 22 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    goldenIcon = cv.toDataURL();
  }
  return goldenIcon;
}

let iceIcon = '';
/** Goal icon: a strawberry frozen in an ice cube. */
export function iceIconUrl(): string {
  if (!iceIcon) {
    const { cv, ctx } = blank(96);
    ctx.drawImage(makeFruitSprite(0, 96), 10, 10, 76, 76);
    ctx.fillStyle = 'rgba(170,225,255,0.6)';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(22, 8); ctx.arcTo(88, 8, 88, 88, 16); ctx.arcTo(88, 88, 8, 88, 16); ctx.arcTo(8, 88, 8, 8, 16); ctx.arcTo(8, 8, 88, 8, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(18, 16, 22, 8);
    iceIcon = cv.toDataURL();
  }
  return iceIcon;
}

let sandIcon = '';
export function sandIconUrl(): string {
  if (!sandIcon) sandIcon = makeSandSprite(2, 96).toDataURL();
  return sandIcon;
}

export function makeBeeSprite(px: number): HTMLCanvasElement {
  const { cv, ctx } = blank(px);
  const img = art('bee');
  if (img) drawArt(ctx, img, cv.width, 0.02);
  else {
    ctx.scale(cv.width, cv.height);
    drawBee(ctx);
  }
  return cv;
}

const iconCache = new Map<number, string>();
export function fruitIconUrl(kind: number): string {
  if (!iconCache.has(kind)) iconCache.set(kind, makeFruitSprite(kind, 96).toDataURL());
  return iconCache.get(kind)!;
}
export function clearIconCache(): void {
  iconCache.clear();
  goldenIcon = '';
}

/** A level's goals in a display-friendly form (shared by the HUD and the level card). */
import { COCONUT, PINATA, LAVA } from './core/board';
import { LevelDef, pinataCount } from './core/levels';
import { fruitIconUrl, sandIconUrl, goldenIconUrl, iceIconUrl } from './fruitArt';

export type GoalKey = 'fruit' | 'sand' | 'coconut' | 'golden' | 'orders' | 'ice' | 'pinata' | 'lava';

export interface GoalSpec {
  key: GoalKey;
  kind?: number;
  count: number;
  icon: string;
  label: string;
}

/** Total sand layers in a level's layout. */
export function sandTotal(level: LevelDef): number {
  return (level.layout ?? []).join('').split('').reduce((n, ch) => n + (ch === 's' ? 1 : ch === 'S' ? 2 : 0), 0);
}

/** Total ice layers in a level's layout. */
export function iceTotal(level: LevelDef): number {
  return (level.layout ?? []).join('').split('').reduce((n, ch) => n + (ch === 'i' ? 1 : ch === 'I' ? 2 : 0), 0);
}

export function goalSpecs(level: LevelDef): GoalSpec[] {
  const out: GoalSpec[] = [];
  if (level.cafe) out.push({ key: 'orders', count: level.cafe.serve, icon: fruitIconUrl(-1), label: 'customers' });
  out.push(...level.collect.map((g) => ({ key: 'fruit' as const, kind: g.kind, count: g.count, icon: fruitIconUrl(g.kind), label: 'fruit' })));
  if (level.golden) out.push({ key: 'golden', count: level.golden, icon: goldenIconUrl(), label: 'golden fruit' });
  const sand = sandTotal(level);
  if (sand) out.push({ key: 'sand', count: sand, icon: sandIconUrl(), label: 'sand' });
  const ice = iceTotal(level);
  if (ice) out.push({ key: 'ice', count: ice, icon: iceIconUrl(), label: 'ice' });
  const pins = pinataCount(level);
  if (pins) out.push({ key: 'pinata', count: pins, icon: fruitIconUrl(PINATA), label: 'piñatas' });
  const lava = (level.layout ?? []).join('').split('v').length - 1;
  if (lava) out.push({ key: 'lava', count: lava, icon: fruitIconUrl(LAVA), label: 'lava' });
  if (level.coconuts) out.push({ key: 'coconut', count: level.coconuts, icon: fruitIconUrl(COCONUT), label: 'coconuts' });
  return out;
}

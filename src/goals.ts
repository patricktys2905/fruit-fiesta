/** A level's goals in a display-friendly form (shared by the HUD and the level card). */
import { COCONUT } from './core/board';
import { LevelDef } from './core/levels';
import { fruitIconUrl, sandIconUrl } from './fruitArt';

export type GoalKey = 'fruit' | 'sand' | 'coconut';

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

export function goalSpecs(level: LevelDef): GoalSpec[] {
  const out: GoalSpec[] = level.collect.map((g) => ({ key: 'fruit' as const, kind: g.kind, count: g.count, icon: fruitIconUrl(g.kind), label: 'fruit' }));
  const sand = sandTotal(level);
  if (sand) out.push({ key: 'sand', count: sand, icon: sandIconUrl(), label: 'sand' });
  if (level.coconuts) out.push({ key: 'coconut', count: level.coconuts, icon: fruitIconUrl(COCONUT), label: 'coconuts' });
  return out;
}

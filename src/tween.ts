export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;
export const easeOutQuad: Ease = (t) => 1 - (1 - t) * (1 - t);
export const easeInBack: Ease = (t) => 2.7 * t * t * t - 1.7 * t * t;
export const easeOutBack: Ease = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
/** Accelerate like gravity, then a small bounce on landing. */
export const fallEase: Ease = (t) => (t < 0.8 ? Math.pow(t / 0.8, 2) : 1 - 0.07 * Math.sin((Math.PI * (t - 0.8)) / 0.2));

interface Tween {
  obj: Record<string, number>;
  to: Record<string, number>;
  from: Record<string, number> | null;
  dur: number;
  t: number;
  delay: number;
  ease: Ease;
  resolve: () => void;
}

export class Tweener {
  private list: Tween[] = [];

  to<T extends object>(obj: T, to: Partial<Record<keyof T, number>>, dur: number, ease: Ease = easeOutQuad, delay = 0): Promise<void> {
    return new Promise((resolve) => {
      this.list.push({ obj: obj as unknown as Record<string, number>, to: to as Record<string, number>, from: null, dur: Math.max(1, dur), t: 0, delay, ease, resolve });
    });
  }

  update(dt: number): void {
    const done: Tween[] = [];
    for (const tw of this.list) {
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) continue;
      }
      if (!tw.from) {
        tw.from = {};
        for (const k in tw.to) tw.from[k] = tw.obj[k];
      }
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      const e = tw.ease(p);
      for (const k in tw.to) tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (p >= 1) done.push(tw);
    }
    if (done.length) {
      this.list = this.list.filter((t) => !done.includes(t));
      done.forEach((t) => t.resolve());
    }
  }

  clear(): void {
    const old = this.list;
    this.list = [];
    old.forEach((t) => t.resolve());
  }
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

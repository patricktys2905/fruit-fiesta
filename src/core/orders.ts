/** Beach Café: customers arrive with smoothie orders; matched fruit fills them.
 *  Pure and seeded, so the game and the simulator behave identically. */
import { Rng, mulberry32, randInt } from './rng';

export interface Recipe {
  name: string;
  kinds: number[];
}

// Fruit kinds: 0 Strawberry, 1 Orange, 2 Lemon, 3 Kiwi, 4 Grape, 5 Blueberry
export const RECIPES: Recipe[] = [
  { name: 'Berry Blast', kinds: [0, 5] },
  { name: 'Citrus Splash', kinds: [1, 2] },
  { name: 'Sunrise Punch', kinds: [1, 0] },
  { name: 'Green Machine', kinds: [3, 2] },
  { name: 'Purple Rain', kinds: [4, 5] },
  { name: 'Kiwi Cooler', kinds: [3, 4] },
  { name: 'Lemonade', kinds: [2] },
  { name: 'Strawberry Shake', kinds: [0] },
  { name: 'Grape Fizz', kinds: [4, 2] },
  { name: 'Tutti Frutti', kinds: [0, 1, 3] },
  { name: 'Jungle Juice', kinds: [3, 1, 4] },
];

export const CUSTOMERS = [
  { name: 'Polly', animal: 'parrot', emoji: '🦜' },
  { name: 'Shelly', animal: 'turtle', emoji: '🐢' },
  { name: 'Momo', animal: 'monkey', emoji: '🐒' },
  { name: 'Pinchy', animal: 'crab', emoji: '🦀' },
  { name: 'Flo', animal: 'flamingo', emoji: '🦩' },
  { name: 'Inky', animal: 'octopus', emoji: '🐙' },
];

export interface CafeDef {
  /** Customers to serve to win. */
  serve: number;
  /** Customers waiting at once (1-3). */
  slots: number;
  /** Moves each customer will wait. */
  patience: number;
  /** Total fruit in an order, min..max. */
  size: [number, number];
}

export interface Need {
  kind: number;
  total: number;
  left: number;
}

export interface Order {
  id: number;
  recipe: number;
  customer: number;
  needs: Need[];
  patience: number;
  maxPatience: number;
}

/** One fruit (or golden double) poured into an order. */
export interface Pour {
  orderId: number;
  kind: number;
  amount: number;
  /** Index into the cleared list it came from. */
  from: number;
}

export const TIP_BASE = 300;
export const TIP_PER_PATIENCE = 60;

export class Cafe {
  active: Order[] = [];
  served = 0;
  walked = 0;
  tips = 0;
  private nextId = 1;
  private rng: Rng;
  private recipes: number[];

  constructor(readonly def: CafeDef, kinds: number, seed: number) {
    this.rng = mulberry32(seed ^ 0x5eed);
    this.recipes = RECIPES.map((_, i) => i).filter((i) => RECIPES[i].kinds.every((k) => k < kinds));
    this.fill();
  }

  get done(): boolean {
    return this.served >= this.def.serve;
  }

  /** Customers still to arrive or waiting. */
  get remaining(): number {
    return Math.max(0, this.def.serve - this.served);
  }

  private fill(): Order[] {
    const added: Order[] = [];
    while (this.active.length < Math.min(this.def.slots, this.remaining)) {
      const recipe = this.recipes[randInt(this.rng, this.recipes.length)];
      const kinds = RECIPES[recipe].kinds;
      const size = this.def.size[0] + randInt(this.rng, this.def.size[1] - this.def.size[0] + 1);
      // Split the order size across the recipe's fruit, roughly evenly.
      const needs: Need[] = kinds.map((kind, i) => {
        const share = Math.floor(size / kinds.length) + (i < size % kinds.length ? 1 : 0);
        return { kind, total: share, left: share };
      });
      const used = new Set(this.active.map((o) => o.customer));
      let customer = randInt(this.rng, CUSTOMERS.length);
      for (let i = 0; i < CUSTOMERS.length && used.has(customer); i++) customer = (customer + 1) % CUSTOMERS.length;
      const o: Order = { id: this.nextId++, recipe, customer, needs, patience: this.def.patience, maxPatience: this.def.patience };
      this.active.push(o);
      added.push(o);
    }
    return added;
  }

  /** Pour cleared fruit into orders (oldest customer first). */
  feed(cleared: { kind: number; golden?: boolean }[]): { pours: Pour[]; served: Order[]; arrived: Order[] } {
    const pours: Pour[] = [];
    cleared.forEach((f, from) => {
      if (f.kind < 0) return;
      let amount = f.golden ? 2 : 1;
      for (const o of this.active) {
        const need = o.needs.find((n) => n.kind === f.kind && n.left > 0);
        if (!need || amount <= 0) continue;
        const used = Math.min(need.left, amount);
        need.left -= used;
        amount -= used;
        pours.push({ orderId: o.id, kind: f.kind, amount: used, from });
      }
    });
    const served = this.active.filter((o) => o.needs.every((n) => n.left <= 0));
    for (const o of served) {
      this.served++;
      this.tips += TIP_BASE + o.patience * TIP_PER_PATIENCE;
    }
    this.active = this.active.filter((o) => !served.includes(o));
    return { pours, served, arrived: this.fill() };
  }

  /** One move passes: customers lose patience; anyone at zero walks out and is replaced. */
  tick(): { left: Order[]; arrived: Order[] } {
    for (const o of this.active) o.patience--;
    const left = this.active.filter((o) => o.patience <= 0);
    this.walked += left.length;
    this.active = this.active.filter((o) => o.patience > 0);
    return { left, arrived: this.fill() };
  }

  /** Fruit kinds the waiting customers still need (for bees and bots). */
  wanted(): number[] {
    return [...new Set(this.active.flatMap((o) => o.needs.filter((n) => n.left > 0).map((n) => n.kind)))];
  }

  tipFor(o: Order): number {
    return TIP_BASE + o.patience * TIP_PER_PATIENCE;
  }
}

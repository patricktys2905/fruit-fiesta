/** The café counter above the board: customer cards, flying fruit, served/walk-out moments. */
import { Cafe, CUSTOMERS, Order, RECIPES } from './core/orders';
import { fruitIconUrl } from './fruitArt';
import { artUrl } from './art';
import { wait } from './tween';

const $ = (id: string) => document.getElementById(id)!;

export class CafeView {
  private el = $('cafe');
  private cards = new Map<number, HTMLElement>();
  private cafe: Cafe | null = null;

  show(cafe: Cafe | null): void {
    this.cafe = cafe;
    this.el.innerHTML = '';
    this.cards.clear();
    this.el.classList.toggle('hidden', !cafe);
    if (cafe) this.sync(false);
  }

  private avatar(o: Order): string {
    const c = CUSTOMERS[o.customer];
    const art = artUrl(`customer-${c.animal}`);
    return art ? `<img class="cust-img" alt="${c.name}" src="${art}">` : `<span class="cust-emoji">${c.emoji}</span>`;
  }

  private card(o: Order): HTMLElement {
    const div = document.createElement('div');
    div.className = 'order';
    div.dataset.id = String(o.id);
    div.innerHTML = `
      <div class="cust">${this.avatar(o)}<span class="cust-name">${CUSTOMERS[o.customer].name}</span></div>
      <div class="order-body">
        <span class="recipe">${RECIPES[o.recipe].name}</span>
        <div class="needs">${o.needs.map((n) => `<span class="need" data-kind="${n.kind}"><img alt="" src="${fruitIconUrl(n.kind)}"><b>${n.left}</b></span>`).join('')}</div>
        <div class="patience"><div></div><span class="patience-n"></span></div>
      </div>
      <div class="order-stamp"></div>`;
    return div;
  }

  /** Bring the cards in line with the café state. */
  sync(animate = true): void {
    if (!this.cafe) return;
    for (const o of this.cafe.active) {
      let card = this.cards.get(o.id);
      if (!card) {
        card = this.card(o);
        if (animate) card.classList.add('arrive');
        this.el.appendChild(card);
        this.cards.set(o.id, card);
      }
      this.update(o);
    }
  }

  private update(o: Order): void {
    const card = this.cards.get(o.id);
    if (!card) return;
    for (const n of o.needs) {
      const el = card.querySelector<HTMLElement>(`.need[data-kind="${n.kind}"]`);
      if (!el) continue;
      el.querySelector('b')!.textContent = n.left > 0 ? String(n.left) : '✓';
      el.classList.toggle('done', n.left <= 0);
    }
    const pct = Math.max(0, o.patience / o.maxPatience);
    const bar = card.querySelector<HTMLElement>('.patience > div')!;
    bar.style.width = `${pct * 100}%`;
    card.classList.toggle('impatient', o.patience <= 3);
    card.querySelector('.patience-n')!.textContent = `${o.patience} ⏳`;
  }

  /** Fly a fruit icon from a board position into an order, then tick its counter. */
  fly(kind: number, from: { x: number; y: number }, order: Order, delay: number): Promise<void> {
    const card = this.cards.get(order.id);
    const need = card?.querySelector<HTMLElement>(`.need[data-kind="${kind}"] img`);
    if (!need) return Promise.resolve();
    const to = need.getBoundingClientRect();
    const img = document.createElement('img');
    img.src = fruitIconUrl(kind);
    img.className = 'flyer';
    img.style.left = `${from.x - 18}px`;
    img.style.top = `${from.y - 18}px`;
    document.body.appendChild(img);
    return wait(delay).then(async () => {
      img.style.transform = `translate(${to.left + to.width / 2 - from.x}px, ${to.top + to.height / 2 - from.y}px) scale(0.6)`;
      img.style.opacity = '0.9';
      await wait(430);
      img.remove();
      const el = need.parentElement!;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
      this.update(order);
    });
  }

  async served(o: Order, tip: number): Promise<void> {
    const card = this.cards.get(o.id);
    if (!card) return;
    this.update(o);
    card.querySelector('.order-stamp')!.textContent = `+${tip}`;
    card.classList.add('served');
    await wait(900);
    card.remove();
    this.cards.delete(o.id);
  }

  async walkedOut(o: Order): Promise<void> {
    const card = this.cards.get(o.id);
    if (!card) return;
    card.querySelector('.order-stamp')!.textContent = '😤';
    card.classList.add('walk');
    await wait(800);
    card.remove();
    this.cards.delete(o.id);
  }

  /** Re-render counts/patience for everyone waiting. */
  refresh(): void {
    if (!this.cafe) return;
    for (const o of this.cafe.active) this.update(o);
  }
}

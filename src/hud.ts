import { LevelDef } from './core/levels';
import { fruitIconUrl } from './fruitArt';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private levelName = $('level-name');
  private moves = $('moves');
  private score = $('score');
  private fill = $('bar-fill');
  private goals = $('goals');
  private starEls = [...document.querySelectorAll<HTMLElement>('#bar .bar-star')];
  private goalCounts: HTMLElement[] = [];
  private level!: LevelDef;
  private shownScore = 0;
  private targetScore = 0;

  constructor() {
    const tick = () => {
      if (this.shownScore !== this.targetScore) {
        const diff = this.targetScore - this.shownScore;
        this.shownScore += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.15));
        this.score.textContent = this.shownScore.toLocaleString();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  setLevel(level: LevelDef): void {
    this.level = level;
    this.levelName.textContent = `Level ${level.id} · ${level.name}`;
    this.shownScore = this.targetScore = 0;
    this.score.textContent = '0';
    const max = level.stars[2];
    this.starEls.forEach((el, i) => {
      el.style.left = `${(level.stars[i] / max) * 100}%`;
      el.classList.remove('lit');
    });
    this.goals.innerHTML = '';
    this.goalCounts = [];
    if (level.collect.length === 0) {
      const div = document.createElement('div');
      div.className = 'goal goal-score';
      div.innerHTML = `<span class="goal-label">Score</span><span class="goal-count">${level.stars[0].toLocaleString()}</span>`;
      this.goals.appendChild(div);
    }
    for (const g of level.collect) {
      const div = document.createElement('div');
      div.className = 'goal';
      div.innerHTML = `<img alt="" src="${fruitIconUrl(g.kind)}"><span class="goal-count">${g.count}</span>`;
      this.goals.appendChild(div);
      this.goalCounts.push(div.querySelector('.goal-count')!);
    }
  }

  update(score: number, moves: number, collected: number[]): void {
    this.targetScore = score;
    this.moves.textContent = String(moves);
    this.moves.classList.toggle('low', moves <= 5);
    const max = this.level.stars[2];
    this.fill.style.width = `${Math.min(100, (score / max) * 100)}%`;
    this.starEls.forEach((el, i) => el.classList.toggle('lit', score >= this.level.stars[i]));
    this.level.collect.forEach((g, i) => {
      const left = Math.max(0, g.count - collected[g.kind]);
      const el = this.goalCounts[i];
      const done = left === 0;
      el.textContent = done ? '✓' : String(left);
      el.parentElement!.classList.toggle('done', done);
    });
  }

  bump(): void {
    this.goals.classList.remove('bump');
    void this.goals.offsetWidth;
    this.goals.classList.add('bump');
  }
}

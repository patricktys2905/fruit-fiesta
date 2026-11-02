/** Lives, daily quests and achievements: saving, rewards and their screens. */
import {
  LivesState, MAX_LIVES, freshLives, refresh, canPlay, loseLife, addLives, addUnlimited,
  timeToNext, hasUnlimited, formatTime,
} from './meta/lives';
import { DailyState, ensureToday, applyReport, questText, questDone, templateOf, dateKey } from './meta/quests';
import { ACHIEVEMENTS, Lifetime, freshLifetime, addReport, newlyEarned, AchieveCtx } from './meta/achievements';
import { LevelReport } from './meta/report';
import { LEVELS, WORLDS } from './core/levels';
import { Progress, isUnlocked } from './save';
import { toast } from './pwa';
import { sfx } from './audio';

interface MetaSave {
  lives: LivesState;
  daily: DailyState | null;
  life: Lifetime;
  achievements: Record<string, number>;
}

const KEY = 'ff-meta-v1';
const CHEST_MS = 60 * 60 * 1000;
const $ = (id: string) => document.getElementById(id)!;

export class Meta {
  private s: MetaSave;
  private toasts: string[] = [];
  private toastBusy = false;

  constructor(private progress: Progress) {
    let loaded: Partial<MetaSave> = {};
    try {
      loaded = JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      /* fresh */
    }
    this.s = {
      lives: loaded.lives ?? freshLives(Date.now()),
      daily: loaded.daily ?? null,
      life: { ...freshLifetime(), ...(loaded.life ?? {}) },
      achievements: loaded.achievements ?? {},
    };
    this.rollDay();
    $('btn-daily').onclick = $('map-daily').onclick = () => this.openDaily();
    $('btn-awards').onclick = $('map-awards').onclick = () => this.openAwards();
    $('panel-close').onclick = () => $('panel').classList.add('hidden');
    $('panel').onclick = (e) => {
      if (e.target === $('panel')) $('panel').classList.add('hidden');
    };
    setInterval(() => this.renderLives(), 1000);
    this.renderAll();
  }

  private save(): void {
    localStorage.setItem(KEY, JSON.stringify(this.s));
  }

  private maxLevel(): number {
    return Math.max(...LEVELS.filter((l) => isUnlocked(this.progress, l.id)).map((l) => l.id));
  }

  private rollDay(): DailyState {
    const today = dateKey(new Date());
    if (this.s.daily?.date !== today) {
      this.s.daily = ensureToday(this.s.daily, today, this.maxLevel());
      this.save();
    }
    return this.s.daily!;
  }

  // ---------- lives ----------

  canStart(): boolean {
    return canPlay(this.s.lives, Date.now());
  }

  /** Called when a level is lost or abandoned. */
  loseLife(): void {
    this.s.lives = loseLife(this.s.lives, Date.now());
    this.save();
    this.renderLives();
  }

  private livesHtml(): string {
    const now = Date.now();
    const l = refresh(this.s.lives, now);
    if (hasUnlimited(l, now)) return `<b class="heart">❤️</b><b>∞</b><span class="lives-timer">${formatTime(l.unlimitedUntil - now)}</span>`;
    const next = timeToNext(l, now);
    return `<b class="heart">❤️</b><b>${l.lives}</b>${next ? `<span class="lives-timer">+1 in ${formatTime(next)}</span>` : l.lives > MAX_LIVES ? '' : '<span class="lives-timer">Full</span>'}`;
  }

  renderLives(): void {
    const html = this.livesHtml();
    $('title-lives').innerHTML = html;
    $('map-lives').innerHTML = html;
    const now = Date.now();
    const ok = this.canStart();
    const play = $('lc-play') as HTMLButtonElement;
    play.disabled = !ok;
    play.textContent = ok ? 'Play' : 'Out of lives';
    $('lc-lives').innerHTML = ok
      ? ''
      : `Next life in <b>${formatTime(timeToNext(this.s.lives, now))}</b> · finish daily quests for more ❤️`;
  }

  // ---------- results ----------

  /** Count a finished attempt. Returns nothing; shows toasts for quests and achievements. */
  onLevelEnd(r: LevelReport): void {
    if (!r.won) this.loseLife();
    addReport(this.s.life, r);
    const daily = this.rollDay();
    for (const q of applyReport(daily, r)) this.queueToast(`📅 Quest done: ${questText(q)}`);
    this.checkAchievements();
    this.save();
    this.renderAll();
  }

  private ctx(): AchieveCtx {
    const stars = Object.values(this.progress.stars);
    return {
      life: this.s.life,
      totalStars: stars.reduce((a, b) => a + b, 0),
      threeStarLevels: stars.filter((n) => n >= 3).length,
      worldsDone: WORLDS.filter((w) => w.levels.every((l) => (this.progress.stars[l.id] ?? 0) > 0)).length,
      streak: this.s.daily?.streak ?? 0,
    };
  }

  private checkAchievements(): void {
    for (const a of newlyEarned(this.ctx(), this.s.achievements)) {
      this.s.achievements[a.id] = Date.now();
      this.queueToast(`🏆 ${a.icon} ${a.name}!`);
    }
  }

  private queueToast(text: string): void {
    this.toasts.push(text);
    if (!this.toastBusy) this.nextToast();
  }

  private nextToast(): void {
    const t = this.toasts.shift();
    if (!t) {
      this.toastBusy = false;
      return;
    }
    this.toastBusy = true;
    toast(t, 2400);
    sfx.create();
    setTimeout(() => this.nextToast(), 2600);
  }

  // ---------- panels ----------

  private renderAll(): void {
    this.renderLives();
    const d = this.rollDay();
    const done = d.quests.filter(questDone).length;
    const claimable = d.quests.filter((q) => questDone(q) && !q.claimed).length + (d.quests.every((q) => q.claimed) && !d.chestClaimed ? 1 : 0);
    $('map-daily-count').textContent = `${done}/3`;
    const badge = $('daily-badge');
    badge.textContent = claimable ? String(claimable) : '';
    badge.classList.toggle('hidden', !claimable);
    $('map-daily').classList.toggle('glow', claimable > 0);
    $('map-awards-count').textContent = `${Object.keys(this.s.achievements).length}/${ACHIEVEMENTS.length}`;
  }

  openDaily(): void {
    sfx.select();
    const d = this.rollDay();
    $('panel-title').textContent = '📅 Daily Quests';
    $('panel-sub').innerHTML = `New quests every day · 🔥 Streak: <b>${d.streak} day${d.streak === 1 ? '' : 's'}</b>`;
    const body = $('panel-body');
    body.innerHTML = '';
    d.quests.forEach((q) => {
      const t = templateOf(q);
      const pct = Math.round((q.progress / q.target) * 100);
      const row = document.createElement('div');
      row.className = 'quest' + (questDone(q) ? ' done' : '');
      row.innerHTML = `
        <span class="quest-icon">${t.icon}</span>
        <div class="quest-main">
          <span class="quest-text">${questText(q)}</span>
          <div class="progress"><div style="width:${pct}%"></div><span>${Math.min(q.progress, q.target).toLocaleString()} / ${q.target.toLocaleString()}</span></div>
        </div>
        ${q.claimed ? '<span class="quest-claimed">✓</span>' : questDone(q) ? '<button class="claim-btn">+1 ❤️</button>' : '<span class="quest-reward">+1 ❤️</span>'}`;
      row.querySelector<HTMLButtonElement>('.claim-btn')?.addEventListener('click', () => {
        q.claimed = true;
        this.s.lives = addLives(this.s.lives, 1, Date.now());
        this.s.life.questsDone++;
        sfx.star(1);
        this.checkAchievements();
        this.save();
        this.renderAll();
        this.openDaily();
      });
      body.appendChild(row);
    });
    const allClaimed = d.quests.every((q) => q.claimed);
    const chest = document.createElement('div');
    chest.className = 'chest' + (allClaimed && !d.chestClaimed ? ' ready' : '') + (d.chestClaimed ? ' opened' : '');
    chest.innerHTML = `
      <span class="chest-icon">${d.chestClaimed ? '🎁' : '🧰'}</span>
      <div class="quest-main"><span class="quest-text">Fiesta Chest</span><small>${d.chestClaimed ? 'Opened today. Come back tomorrow!' : 'Claim all 3 quests: 1 hour of unlimited lives'}</small></div>
      ${allClaimed && !d.chestClaimed ? '<button class="claim-btn">Open!</button>' : ''}`;
    chest.querySelector<HTMLButtonElement>('.claim-btn')?.addEventListener('click', () => {
      d.chestClaimed = true;
      this.s.lives = addUnlimited(this.s.lives, CHEST_MS, Date.now());
      sfx.win();
      toast('🎁 Unlimited lives for 1 hour!');
      this.save();
      this.renderAll();
      this.openDaily();
    });
    body.appendChild(chest);
    $('panel').classList.remove('hidden');
  }

  openAwards(): void {
    sfx.select();
    const ctx = this.ctx();
    const have = this.s.achievements;
    $('panel-title').textContent = '🏆 Awards';
    $('panel-sub').innerHTML = `<b>${Object.keys(have).length}</b> of ${ACHIEVEMENTS.length} earned`;
    const body = $('panel-body');
    body.innerHTML = '';
    const sorted = [...ACHIEVEMENTS].sort((a, b) => Number(!!have[b.id]) - Number(!!have[a.id]));
    for (const a of sorted) {
      const got = !!have[a.id];
      const v = Math.min(a.value(ctx), a.target);
      const row = document.createElement('div');
      row.className = 'award' + (got ? ' got' : '');
      row.innerHTML = `
        <span class="award-icon">${a.icon}</span>
        <div class="quest-main">
          <span class="quest-text">${a.name}</span>
          <small>${a.desc}</small>
          ${got ? '' : `<div class="progress"><div style="width:${Math.round((v / a.target) * 100)}%"></div><span>${v.toLocaleString()} / ${a.target.toLocaleString()}</span></div>`}
        </div>
        ${got ? '<span class="quest-claimed">✓</span>' : ''}`;
      body.appendChild(row);
    }
    $('panel').classList.remove('hidden');
  }
}

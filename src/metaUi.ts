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
import { STICKERS, ALBUM_PAGES, StickerDef, AlbumState, freshAlbum, dropSticker, pageStickers, pageComplete, ownedCount, stickerArt, PAGE_REWARD, ALBUM_REWARD, DUPLICATE_COINS } from './meta/stickers';
import { DailyPuzzleState, freshDailyPuzzle, recordDaily, dailyLevel } from './meta/dailyPuzzle';
import { artUrl } from './art';
import {
  BOOSTERS, BoosterId, Inventory, Reward, emptyInventory, rewardText, winCoins, LIFE_PRICE,
  SPIN_SLICES, spinResult, CALENDAR, CalendarState, freshCalendar, calendarReady, claimCalendar,
  WeeklyState, weekKey, ensureWeek, applyWeekly, WEEKLY_QUEST_REWARD, WEEKLY_CHEST,
} from './meta/economy';
import { sfx } from './audio';

interface MetaSave {
  lives: LivesState;
  daily: DailyState | null;
  life: Lifetime;
  achievements: Record<string, number>;
  coins: number;
  inv: Inventory;
  spinDate: string;
  calendar: CalendarState;
  weekly: WeeklyState | null;
  album: AlbumState;
  dailyPuzzle: DailyPuzzleState;
}

/** What a finished level earned (shown on the result screen). */
export interface EndInfo {
  coins: number;
  stickers: { sticker: StickerDef; isNew: boolean }[];
  dailyFirstWin: boolean;
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
      coins: loaded.coins ?? 100,
      inv: { ...emptyInventory(), ...(loaded.inv ?? {}) },
      spinDate: loaded.spinDate ?? '',
      calendar: loaded.calendar ?? freshCalendar(),
      weekly: loaded.weekly ?? null,
      album: loaded.album ?? freshAlbum(),
      dailyPuzzle: loaded.dailyPuzzle ?? freshDailyPuzzle(),
    };
    this.rollDay();
    $('btn-daily').onclick = $('map-daily').onclick = () => this.openDaily();
    $('btn-awards').onclick = $('map-awards').onclick = () => this.openAwards();
    $('btn-hub').onclick = $('map-hub').onclick = () => this.openHub();
    $('panel-back').onclick = () => this.openHub();
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
  onLevelEnd(r: LevelReport, prevStars = 0, dailyDate?: string): EndInfo {
    const info: EndInfo = { coins: 0, stickers: [], dailyFirstWin: false };
    if (dailyDate) {
      // Daily Puzzle: free to play (no lives), first win of the day pays out.
      info.dailyFirstWin = recordDaily(this.s.dailyPuzzle, dailyDate, r.score, r.stars, r.won);
      if (info.dailyFirstWin) {
        this.s.dailyPuzzle.rewarded = dailyDate;
        this.s.coins += 100;
        info.coins += 100;
        info.stickers.push(this.giveSticker());
      }
    } else if (!r.won) this.loseLife();
    else {
      info.stickers.push(this.giveSticker());
      if (r.stars === 3 && prevStars < 3) info.stickers.push(this.giveSticker());
    }
    for (const st of info.stickers) if (!st.isNew) { this.s.coins += DUPLICATE_COINS; info.coins += DUPLICATE_COINS; }
    addReport(this.s.life, r);
    const daily = this.rollDay();
    for (const q of applyReport(daily, r)) this.queueToast(`📅 Quest done: ${questText(q)}`);
    const week = this.rollWeek();
    for (const q of applyWeekly(week, r)) this.queueToast(`📆 Weekly quest done: ${questText(q)}`);
    const coins = r.won && !dailyDate ? winCoins(r.stars, prevStars) : 0;
    this.s.coins += coins;
    info.coins += coins;
    this.checkAchievements();
    this.save();
    this.renderAll();
    return info;
  }

  private maxWorld(): number {
    const max = this.maxLevel();
    return WORLDS.find((w) => w.levels.some((l) => l.id === max))?.id ?? 1;
  }

  private giveSticker(): { sticker: StickerDef; isNew: boolean } {
    return dropSticker(this.s.album, this.maxWorld(), Math.random);
  }

  // ---------- coins & boosters ----------

  get coins(): number {
    return this.s.coins;
  }

  count(id: BoosterId): number {
    return this.s.inv[id] ?? 0;
  }

  /** Use one booster if you have it. */
  useBooster(id: BoosterId): boolean {
    if ((this.s.inv[id] ?? 0) <= 0) return false;
    this.s.inv[id]--;
    this.save();
    this.renderAll();
    return true;
  }

  /** Pay coins for a booster used straight away (for the +5 moves offer). */
  buyAndUse(id: BoosterId): boolean {
    if (this.s.coins < BOOSTERS[id].price) return false;
    this.s.coins -= BOOSTERS[id].price;
    this.save();
    this.renderAll();
    return true;
  }

  /** Booster counts changed (shop, rewards): listeners refresh their buttons. */
  onInventory?: () => void;

  grant(r: Reward, why: string): void {
    const now = Date.now();
    if (r.coins) this.s.coins += r.coins;
    for (const [k, n] of Object.entries(r.boosters ?? {})) this.s.inv[k as BoosterId] = (this.s.inv[k as BoosterId] ?? 0) + (n ?? 0);
    if (r.lives) this.s.lives = addLives(this.s.lives, r.lives, now);
    if (r.unlimitedMin) this.s.lives = addUnlimited(this.s.lives, r.unlimitedMin * 60_000, now);
    this.queueToast(`${why}: ${rewardText(r)}`);
    sfx.star(2);
    this.checkAchievements();
    this.save();
    this.renderAll();
  }

  private rollWeek(): WeeklyState {
    const wk = weekKey(new Date());
    if (this.s.weekly?.week !== wk) {
      this.s.weekly = ensureWeek(this.s.weekly, wk, this.maxLevel());
      this.save();
    }
    return this.s.weekly!;
  }

  private ctx(): AchieveCtx {
    const stars = Object.values(this.progress.stars);
    return {
      life: this.s.life,
      totalStars: stars.reduce((a, b) => a + b, 0),
      threeStarLevels: stars.filter((n) => n >= 3).length,
      worldsDone: WORLDS.filter((w) => w.levels.every((l) => (this.progress.stars[l.id] ?? 0) > 0)).length,
      streak: this.s.daily?.streak ?? 0,
      stickers: ownedCount(this.s.album),
      dailyStreak: this.s.dailyPuzzle.streak,
      dailyWins: Object.values(this.s.dailyPuzzle.history).filter((h) => h.won).length,
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
    this.renderHub();
    this.onInventory?.();
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
    $('panel-back').classList.remove('hidden');
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
        this.s.coins += 25;
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
      this.s.coins += 100;
      this.s.inv.beeStart++;
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
    $('panel-back').classList.remove('hidden');
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

  // ---------- Fiesta Hub ----------

  private claimables(): { calendar: boolean; spin: boolean; daily: number; weekly: number; puzzle: boolean; album: boolean } {
    const today = dateKey(new Date());
    const d = this.rollDay();
    const w = this.rollWeek();
    return {
      calendar: calendarReady(this.s.calendar, today),
      spin: this.s.spinDate !== today,
      daily: d.quests.filter((q) => questDone(q) && !q.claimed).length + (d.quests.every((q) => q.claimed) && !d.chestClaimed ? 1 : 0),
      weekly: w.quests.filter((q, i) => questDone(q) && !w.claimed[i]).length + (w.claimed.every(Boolean) && !w.chestClaimed ? 1 : 0),
      puzzle: !this.s.dailyPuzzle.history[today]?.won,
      album: this.albumClaimable(),
    };
  }

  private renderHub(): void {
    const c = this.claimables();
    const n = (c.calendar ? 1 : 0) + (c.spin ? 1 : 0) + c.daily + c.weekly + (c.puzzle ? 1 : 0) + (c.album ? 1 : 0);
    for (const id of ['hub-badge', 'map-hub-badge']) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.textContent = n ? String(n) : '';
      b.classList.toggle('hidden', !n);
    }
    document.getElementById('map-hub')?.classList.toggle('glow', n > 0);
    for (const id of ['title-coins', 'map-coins']) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<b class="coin">🪙</b><b>${this.s.coins.toLocaleString()}</b>`;
    }
  }

  private panel(title: string, sub: string): HTMLElement {
    $('panel-title').textContent = title;
    $('panel-sub').innerHTML = sub;
    $('panel-back').classList.toggle('hidden', title.includes('Hub'));
    const body = $('panel-body');
    body.innerHTML = '';
    $('panel').classList.remove('hidden');
    return body;
  }

  openHub(): void {
    sfx.select();
    const c = this.claimables();
    const body = this.panel('🎪 Fiesta Hub', `🪙 <b>${this.s.coins.toLocaleString()}</b> coins`);
    const tiles: { icon: string; name: string; note: string; ready: boolean; open: () => void }[] = [
      { icon: '🎁', name: 'Gift Calendar', note: c.calendar ? "Today's gift is ready!" : `Day ${this.s.calendar.day + 1} of 7 tomorrow`, ready: c.calendar, open: () => this.openCalendar() },
      { icon: '🎡', name: 'Daily Spin', note: c.spin ? 'Free spin ready!' : 'Come back tomorrow', ready: c.spin, open: () => this.openSpin() },
      { icon: '📅', name: 'Daily Quests', note: c.daily ? `${c.daily} reward${c.daily > 1 ? 's' : ''} to claim` : '3 new quests every day', ready: c.daily > 0, open: () => this.openDaily() },
      { icon: '📆', name: 'Fiesta Week', note: c.weekly ? `${c.weekly} reward${c.weekly > 1 ? 's' : ''} to claim` : '5 big quests this week', ready: c.weekly > 0, open: () => this.openWeekly() },
      { icon: '🧩', name: 'Daily Puzzle', note: c.puzzle ? "Today's puzzle is waiting!" : `Solved today · 🔥 ${this.s.dailyPuzzle.streak}`, ready: c.puzzle, open: () => this.openDailyPuzzle() },
      { icon: '📔', name: 'Sticker Album', note: c.album ? 'A page is complete: claim it!' : `${ownedCount(this.s.album)} of ${STICKERS.length} stickers`, ready: c.album, open: () => this.openAlbum() },
      { icon: '🛒', name: 'Shop', note: 'Boosters and lives for coins', ready: false, open: () => this.openShop() },
      { icon: '🏆', name: 'Awards', note: `${Object.keys(this.s.achievements).length} of ${ACHIEVEMENTS.length} earned`, ready: false, open: () => this.openAwards() },
    ];
    const grid = document.createElement('div');
    grid.className = 'hub-grid';
    for (const t of tiles) {
      const b = document.createElement('button');
      b.className = 'hub-tile' + (t.ready ? ' ready' : '');
      b.innerHTML = `<span class="hub-icon">${t.icon}</span><b>${t.name}</b><small>${t.note}</small>`;
      b.onclick = t.open;
      grid.appendChild(b);
    }
    body.appendChild(grid);
    const inv = document.createElement('div');
    inv.className = 'inv-row';
    inv.innerHTML = (Object.keys(BOOSTERS) as BoosterId[]).map((k) => `<span class="inv-item" title="${BOOSTERS[k].name}">${BOOSTERS[k].icon}<b>${this.count(k)}</b></span>`).join('');
    body.appendChild(inv);
  }

  openShop(): void {
    sfx.select();
    const body = this.panel('🛒 Shop', `You have 🪙 <b>${this.s.coins.toLocaleString()}</b>. Earn coins by winning levels and finishing quests.`);
    const items: { icon: string; name: string; desc: string; price: number; have: string; buy: () => void }[] = [
      ...(Object.keys(BOOSTERS) as BoosterId[]).map((k) => ({
        icon: BOOSTERS[k].icon, name: BOOSTERS[k].name, desc: BOOSTERS[k].desc, price: BOOSTERS[k].price, have: `You have ${this.count(k)}`,
        buy: () => { this.s.inv[k]++; },
      })),
      { icon: '❤️', name: '1 Life', desc: 'Jump back in straight away.', price: LIFE_PRICE, have: '', buy: () => { this.s.lives = addLives(this.s.lives, 1, Date.now()); } },
    ];
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'shop-item';
      const can = this.s.coins >= it.price;
      row.innerHTML = `<span class="quest-icon">${it.icon}</span><div class="quest-main"><span class="quest-text">${it.name}</span><small>${it.desc}</small>${it.have ? `<small class="have">${it.have}</small>` : ''}</div><button class="claim-btn buy"${can ? '' : ' disabled'}>🪙 ${it.price}</button>`;
      row.querySelector('button')!.addEventListener('click', () => {
        if (this.s.coins < it.price) return;
        this.s.coins -= it.price;
        it.buy();
        sfx.create();
        this.save();
        this.renderAll();
        this.openShop();
      });
      body.appendChild(row);
    }
  }

  openSpin(): void {
    sfx.select();
    const today = dateKey(new Date());
    const ready = this.s.spinDate !== today;
    const body = this.panel('🎡 Daily Spin', ready ? 'One free spin every day!' : 'You already spun today. Come back tomorrow!');
    const n = SPIN_SLICES.length;
    const stops = SPIN_SLICES.map((s, i) => `${s.color} ${(i * 360) / n}deg ${((i + 1) * 360) / n}deg`).join(', ');
    const wrap = document.createElement('div');
    wrap.className = 'spin-wrap';
    wrap.innerHTML = `<div class="spin-pointer">▼</div><div class="spin-wheel" style="background: conic-gradient(${stops})">${SPIN_SLICES.map((s, i) => `<span class="spin-label" style="transform: rotate(${(i + 0.5) * (360 / n)}deg)">${rewardText(s.reward).replace(/\s+/g, ' ')}</span>`).join('')}<div class="spin-hub">🍓</div></div>`;
    body.appendChild(wrap);
    const btn = document.createElement('button');
    btn.className = 'big-btn spin-btn';
    btn.textContent = ready ? 'Spin!' : 'Spun ✓';
    btn.disabled = !ready;
    btn.onclick = () => {
      if (this.s.spinDate === today) return;
      btn.disabled = true;
      const idx = spinResult(today, this.s.calendar.total);
      const wheel = wrap.querySelector<HTMLElement>('.spin-wheel')!;
      const target = 360 * 5 + (360 - (idx + 0.5) * (360 / n));
      wheel.style.transition = 'transform 3.2s cubic-bezier(0.15, 0.85, 0.2, 1)';
      wheel.style.transform = `rotate(${target}deg)`;
      sfx.buzz();
      setTimeout(() => {
        this.s.spinDate = today;
        this.grant(SPIN_SLICES[idx].reward, '🎡 You won');
        sfx.win();
        btn.textContent = `🎉 ${rewardText(SPIN_SLICES[idx].reward)}`;
      }, 3300);
    };
    body.appendChild(btn);
  }

  openCalendar(): void {
    sfx.select();
    const today = dateKey(new Date());
    const cal = this.s.calendar;
    const ready = calendarReady(cal, today);
    const body = this.panel('🎁 Gift Calendar', 'A gift for every day you play. Missed a day? No problem, you just pick up where you left off.');
    const grid = document.createElement('div');
    grid.className = 'cal-grid';
    CALENDAR.forEach((r, i) => {
      const state = i < cal.day ? 'got' : i === cal.day && ready ? 'today' : 'later';
      const d = document.createElement('div');
      d.className = `cal-day ${i === 6 ? 'big ' : ''}${state}`;
      d.innerHTML = `<small>Day ${i + 1}</small><span>${state === 'got' ? '✅' : i === 6 ? '🧰' : '🎁'}</span><b>${rewardText(r)}</b>`;
      grid.appendChild(d);
    });
    body.appendChild(grid);
    const btn = document.createElement('button');
    btn.className = 'big-btn spin-btn';
    btn.textContent = ready ? `Claim Day ${cal.day + 1}!` : 'Claimed today ✓';
    btn.disabled = !ready;
    btn.onclick = () => {
      const r = claimCalendar(cal, today);
      if (!r) return;
      this.grant(r, '🎁 Daily gift');
      this.openCalendar();
    };
    body.appendChild(btn);
  }

  openWeekly(): void {
    sfx.select();
    const w = this.rollWeek();
    const body = this.panel('📆 Fiesta Week', `5 big quests, all week long · resets Monday`);
    w.quests.forEach((q, i) => {
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
        ${w.claimed[i] ? '<span class="quest-claimed">✓</span>' : questDone(q) ? `<button class="claim-btn">${rewardText(WEEKLY_QUEST_REWARD)}</button>` : `<span class="quest-reward">${rewardText(WEEKLY_QUEST_REWARD)}</span>`}`;
      row.querySelector<HTMLButtonElement>('.claim-btn')?.addEventListener('click', () => {
        w.claimed[i] = true;
        this.s.life.questsDone++;
        this.grant(WEEKLY_QUEST_REWARD, '📆 Weekly reward');
        this.openWeekly();
      });
      body.appendChild(row);
    });
    const all = w.claimed.every(Boolean);
    const chest = document.createElement('div');
    chest.className = 'chest' + (all && !w.chestClaimed ? ' ready' : '') + (w.chestClaimed ? ' opened' : '');
    chest.innerHTML = `<span class="chest-icon">${w.chestClaimed ? '🎁' : '🏆'}</span><div class="quest-main"><span class="quest-text">Grand Weekly Chest</span><small>${w.chestClaimed ? 'Opened! New quests on Monday.' : rewardText(WEEKLY_CHEST)}</small></div>${all && !w.chestClaimed ? '<button class="claim-btn">Open!</button>' : ''}`;
    chest.querySelector<HTMLButtonElement>('.claim-btn')?.addEventListener('click', () => {
      w.chestClaimed = true;
      this.grant(WEEKLY_CHEST, '🏆 Weekly chest');
      sfx.win();
      this.openWeekly();
    });
    body.appendChild(chest);
  }

  // ---------- Sticker Album ----------

  private albumClaimable(): boolean {
    const a = this.s.album;
    for (let w = 1; w <= ALBUM_PAGES; w++) if (pageComplete(a, w) && !a.pagesClaimed.includes(w)) return true;
    return ownedCount(a) === STICKERS.length && !a.albumClaimed;
  }

  openAlbum(page = 0): void {
    sfx.select();
    const a = this.s.album;
    const world = page || Math.min(ALBUM_PAGES, Math.max(1, this.maxWorld()));
    const body = this.panel('📔 Sticker Album', `<b>${ownedCount(a)}</b> of ${STICKERS.length} collected · win levels to find more`);
    const tabs = document.createElement('div');
    tabs.className = 'album-tabs';
    for (let w = 1; w <= ALBUM_PAGES; w++) {
      const t = document.createElement('button');
      const got = pageStickers(w).filter((st) => a.owned[st.id]).length;
      t.className = 'album-tab' + (w === world ? ' on' : '') + (got === 6 ? ' full' : '');
      t.textContent = String(w);
      t.title = `${WORLDS[w - 1].name}: ${got}/6`;
      t.onclick = () => this.openAlbum(w);
      tabs.appendChild(t);
    }
    body.appendChild(tabs);
    const title = document.createElement('p');
    title.className = 'album-page-title';
    title.textContent = `${WORLDS[world - 1].name} · ${pageStickers(world).filter((st) => a.owned[st.id]).length}/6`;
    body.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'album-grid';
    pageStickers(world).forEach((st, i) => {
      const n = a.owned[st.id] ?? 0;
      const art = artUrl(stickerArt(st));
      const d = document.createElement('div');
      d.className = 'sticker' + (n ? ' got' : '');
      d.style.setProperty('--tilt', `${((i * 37) % 11) - 5}deg`);
      d.innerHTML = n
        ? `${art ? `<img alt="" src="${art}">` : '<span class="sticker-ph">⭐</span>'}<b>${st.name}</b>${n > 1 ? `<small>×${n}</small>` : ''}`
        : `<span class="sticker-ph">?</span><b>???</b>`;
      grid.appendChild(d);
    });
    body.appendChild(grid);
    if (pageComplete(a, world)) {
      const claimed = a.pagesClaimed.includes(world);
      const btn = document.createElement('button');
      btn.className = 'big-btn spin-btn';
      btn.textContent = claimed ? 'Page complete ✓' : `Claim page reward: ${rewardText(PAGE_REWARD)}`;
      btn.disabled = claimed;
      btn.onclick = () => {
        a.pagesClaimed.push(world);
        this.grant(PAGE_REWARD, `📔 ${WORLDS[world - 1].name} page complete`);
        sfx.win();
        this.openAlbum(world);
      };
      body.appendChild(btn);
    }
    if (ownedCount(a) === STICKERS.length && !a.albumClaimed) {
      const btn = document.createElement('button');
      btn.className = 'big-btn spin-btn';
      btn.textContent = `🏆 Album complete! ${rewardText(ALBUM_REWARD)}`;
      btn.onclick = () => {
        a.albumClaimed = true;
        this.grant(ALBUM_REWARD, '📔 Whole album complete');
        this.openAlbum(world);
      };
      body.appendChild(btn);
    }
  }

  // ---------- Daily Puzzle ----------

  /** Start a level (set by main.ts). */
  onPlayDaily?: (level: ReturnType<typeof dailyLevel>) => void;

  openDailyPuzzle(): void {
    sfx.select();
    const today = dateKey(new Date());
    const lvl = dailyLevel(today);
    const dp = this.s.dailyPuzzle;
    const h = dp.history[today];
    const body = this.panel('🧩 Daily Puzzle', `A new puzzle every day · the same board for everyone · free to play`);
    const card = document.createElement('div');
    card.className = 'daily-card';
    card.innerHTML = `
      <p class="daily-name">${lvl.name}</p>
      <div class="daily-stats">
        <span><small>Best today</small><b>${h ? h.best.toLocaleString() : '–'}</b></span>
        <span><small>Stars</small><b>${h ? '★'.repeat(h.stars) + '☆'.repeat(3 - h.stars) : '☆☆☆'}</b></span>
        <span><small>Streak</small><b>🔥 ${dp.streak}</b></span>
      </div>
      <p class="daily-reward">${h?.won ? '✅ Solved! Play again to beat your best.' : 'First win today: 🪙 100 + a sticker'}</p>`;
    body.appendChild(card);
    // the last 7 days
    const week = document.createElement('div');
    week.className = 'daily-week';
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = dateKey(d);
      const r = dp.history[k];
      const el = document.createElement('span');
      el.className = 'daily-dot' + (r?.won ? ' won' : r ? ' tried' : '') + (i === 0 ? ' today' : '');
      el.innerHTML = `<small>${['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()]}</small>${r?.won ? '★' : r ? '·' : ''}`;
      week.appendChild(el);
    }
    body.appendChild(week);
    const btn = document.createElement('button');
    btn.className = 'big-btn spin-btn';
    btn.textContent = h ? 'Play again' : 'Play!';
    btn.onclick = () => {
      $('panel').classList.add('hidden');
      this.onPlayDaily?.(lvl);
    };
    body.appendChild(btn);
  }
}

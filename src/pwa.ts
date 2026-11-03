/** Offline support + "Install app" button. */
import { registerSW } from 'virtual:pwa-register';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const $ = (id: string) => document.getElementById(id)!;

export function toast(text: string, ms = 2800): void {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout((el as unknown as { _t?: number })._t);
  (el as unknown as { _t?: number })._t = window.setTimeout(() => el.classList.add('hidden'), ms);
}

/** Offline support and updates. `safeToReload` says whether the player is somewhere a reload
 *  won't lose anything (not mid-level). New versions are fetched in the background and
 *  applied on the menus, so players get new levels without reinstalling. */
export function setupPwa(safeToReload: () => boolean): void {
  if (import.meta.env.DEV) return; // service worker only in the real build

  let waiting = false;
  const updateSW = registerSW({
    immediate: true,
    onOfflineReady() {
      toast('✅ Ready to play offline!');
    },
    onNeedRefresh() {
      waiting = true;
      if (safeToReload()) apply();
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Installed apps can stay open for days: look for updates hourly and when reopened.
      setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    },
  });
  const apply = () => {
    if (!waiting) return;
    waiting = false;
    toast('✨ Updating Fruit Fiesta…');
    setTimeout(() => void updateSW(true), 900);
  };
  // If the update arrived mid-level, apply it the next time the player is on a menu.
  new MutationObserver(() => {
    if (waiting && safeToReload()) apply();
  }).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });

  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  if (standalone) return;

  // Android / desktop Chrome & Edge: real install prompt.
  let deferred: InstallPromptEvent | null = null;
  const btn = $('btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    btn.classList.remove('hidden');
  });
  btn.onclick = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.classList.add('hidden');
  };
  window.addEventListener('appinstalled', () => {
    btn.classList.add('hidden');
    toast('🎉 Fruit Fiesta installed!');
  });

  // iPhone / iPad Safari has no prompt; show how to add it.
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) $('ios-hint').classList.remove('hidden');
}

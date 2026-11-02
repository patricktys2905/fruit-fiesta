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

export function setupPwa(): void {
  if (import.meta.env.DEV) return; // service worker only in the real build

  registerSW({
    immediate: true,
    onOfflineReady() {
      toast('✅ Ready to play offline!');
    },
  });

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

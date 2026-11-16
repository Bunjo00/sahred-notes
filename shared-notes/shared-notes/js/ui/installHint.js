/**
 * One-time tip on iPhone/iPad Safari: how to add the app to the home screen.
 * (Android browsers offer "Install app" / "Add to Home screen" on their own.)
 */
import { safeStorage } from '../lib/utils.js';
import { showBanner } from './status.js';

const KEY = 'shared-notes.install-tip-shown';

export function maybeShowInstallHint() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (!isIOS || standalone || safeStorage.get(KEY)) return;
  safeStorage.set(KEY, '1');
  showBanner('Tip: tap the Share button, then “Add to Home Screen” to use Notes like an app.', 12000);
}

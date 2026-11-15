/** Connection dot + temporary banner messages. */
import { $ } from '../lib/utils.js';

export function setStatus(state, text) {
  $('dot').className = `dot ${state === 'live' ? 'live' : state === 'warn' ? 'warn' : ''}`;
  $('conn').textContent = text;
}

let bannerTimer = null;
/** Show a banner. ms = 0 keeps it until replaced. */
export function showBanner(text, ms = 5000) {
  const b = $('banner');
  clearTimeout(bannerTimer);
  b.textContent = text;
  b.classList.add('show');
  if (ms) bannerTimer = setTimeout(() => b.classList.remove('show'), ms);
}
export function hideBanner() {
  clearTimeout(bannerTimer);
  $('banner').classList.remove('show');
}

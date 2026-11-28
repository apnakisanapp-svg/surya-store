import { BOOT, $, h, startRouter, bus, wish, me, setLang } from './core.js';
import './pages1.js';
import './pages2.js';
import './notif.js';
import './track.js';
import { buildChrome, cookieBanner, loadAnalytics, welcomePopup, exitIntent, intro } from './ui.js';

// animations: owner's choice (Auto / Full / Light) is remembered for the next visit; a ?anim= link on this phone wins
(function anim() {
  try {
    const m = (BOOT.store && BOOT.store.anim_mode) || 'auto'; localStorage.setItem('sy_anim', m);
    if (localStorage.getItem('sy_anim_o')) return;
    if (m === 'light') document.documentElement.classList.add('lite'); else if (m === 'full') document.documentElement.classList.remove('lite');
  } catch { /* */ }
})();

// dark mode: owner choice, then the visitor's own choice
(function theme() {
  let m = null; try { m = localStorage.getItem('sy_dark'); } catch { /* */ }
  const dark = m ? m === '1' : (BOOT.store.dark_toggle && matchMedia('(prefers-color-scheme: dark)').matches && false);
  document.documentElement.classList.toggle('dark', !!dark);
})();
intro();
const root = document.getElementById('root');
const main = h('main', { id: 'main', tabindex: '-1' });
root.append(main);
buildChrome(root);
root.insertBefore(main, root.querySelector('.ftr'));
startRouter(main);
cookieBanner(); loadAnalytics(); welcomePopup(); exitIntent(); wish.sync();
if ('serviceWorker' in navigator && BOOT.store.pwa) navigator.serviceWorker.register('/sw.js').catch(() => {});
bus.on('route', () => { const m = $('#main'); m && m.focus({ preventScroll: true }); });

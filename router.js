import { h, clear, ldSet } from './lib.js';
export const routes = [];
export const reg = (re, fn) => routes.push([re, fn]);
export const go = p => { location.hash = '#' + p; };
export const S = { me: null, counts: {} };
const sl = (w, hgt = 14) => h('div', { class: 'skel', style: { height: hgt + 'px', width: w, margin: '10px 0' } });
const pageSkel = () => h('div', { class: 'pg-skel', 'aria-hidden': 'true' }, sl('30%', 28), h('div', { class: 'card' }, ...Array.from({ length: 6 }, () => h('div', { class: 'skel', style: { height: '44px', margin: '10px 0', borderRadius: '10px' } }))));
export async function renderRoute(view) {
  const path = (location.hash.slice(1) || '/').split('?')[0].replace(/\/+$/, '') || '/';
  for (const [re, fn] of routes) { const m = path.match(re); if (m) { clear(view); const sk = pageSkel(); view.append(sk); const mo = new MutationObserver(() => { if (view.firstChild !== sk || view.children.length > 1) { sk.remove(); mo.disconnect(); } }); mo.observe(view, { childList: true }); ldSet(true); try { await fn(view, m, new URLSearchParams((location.hash.split('?')[1]) || '')); } catch (e) { clear(view).append(h('div', { class: 'note bad' }, e.message || String(e))); } return; } }
  clear(view).append(h('div', { class: 'empty' }, 'Page not found.'));
}

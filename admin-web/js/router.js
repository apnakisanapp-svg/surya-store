import { h, clear } from './lib.js';
export const routes = [];
export const reg = (re, fn) => routes.push([re, fn]);
export const go = p => { location.hash = '#' + p; };
export const S = { me: null, counts: {} };
export async function renderRoute(view) {
  const path = (location.hash.slice(1) || '/').split('?')[0].replace(/\/+$/, '') || '/';
  for (const [re, fn] of routes) { const m = path.match(re); if (m) { clear(view); try { await fn(view, m, new URLSearchParams((location.hash.split('?')[1]) || '')); } catch (e) { clear(view).append(h('div', { class: 'note bad' }, e.message || String(e))); } return; } }
  clear(view).append(h('div', { class: 'empty' }, 'Page not found.'));
}

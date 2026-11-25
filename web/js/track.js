// Anonymous visit counting for the owner's Insights. Runs only if the visitor accepted analytics (or the owner counts everyone).
// Sends: which page, how long it was open, how far it was scrolled. Never sends a name, phone, address or anything typed.
import { BOOT, ls, bus } from './core.js';

const landQ = new URLSearchParams(location.search);
if (landQ.get('notrack') === '1') ls.set('sy_notrack', 1); else if (landQ.get('notrack') === '0') ls.del('sy_notrack'); // owner: ?notrack=1 on your own phone stops counting you
const rnd = n => { const a = new Uint8Array(n); (self.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return [...a].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };
const allowed = () => { try { if (navigator.doNotTrack === '1' || ls.get('sy_notrack')) return false; } catch { /* */ } if (ls.get('sy_cookie') === 'essential') return false; /* Reject is always respected */ return !!(BOOT.store && BOOT.store.track_all) || ls.get('sy_cookie') === 'all'; };
const post = (url, body, beacon) => {
  const s = JSON.stringify(body);
  if (beacon && navigator.sendBeacon) { try { if (navigator.sendBeacon(url, new Blob([s], { type: 'application/json' }))) return Promise.resolve(); } catch { /* fall through */ } }
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sy-csrf': '1' }, body: s, keepalive: true, credentials: 'same-origin' }).then(r => r.json()).catch(() => ({}));
};

let cur = null, vis = document.visibilityState === 'visible', since = Date.now(), maxScroll = 0, firstPv = true;
const vid = () => { let v = ls.get('sy_vid'); if (!v) { v = rnd(16); ls.set('sy_vid', v); } return v; };
function visitKey() { // a new visit starts after 30 quiet minutes
  const o = ls.get('sy_vk2'); const t = Date.now();
  if (o && o.k && t - o.t < 30 * 60000) { ls.set('sy_vk2', { k: o.k, t }); ls.set('sy_vk', o.k); return { k: o.k, fresh: false }; }
  const k = rnd(16); ls.set('sy_vk2', { k, t }); ls.set('sy_vk', k); return { k, fresh: true };
}
function active() { return cur ? cur.ms + (vis ? Date.now() - since : 0) : 0; }
function sendLeave(beacon) { if (cur) post('/api/t/leave', { pk: cur.pk, dur: Math.round(active()), scroll: maxScroll }, beacon); }
function scrollPct() { const d = document.documentElement, h = d.scrollHeight - d.clientHeight; return h <= 0 ? 100 : Math.min(100, Math.round((window.scrollY + d.clientHeight) / d.scrollHeight * 100)); }

function pageview(path) {
  if (!allowed()) return;
  sendLeave(false);
  const { k, fresh } = visitKey();
  cur = { pk: rnd(12), ms: 0, path }; since = Date.now(); maxScroll = 0;
  const body = { vid: vid(), vk: k, pk: cur.pk, path, w: innerWidth };
  if (fresh) { body.ref = document.referrer || ''; body.camp = firstPv ? (landQ.get('src') || landQ.get('utm_campaign') || landQ.get('utm_source') || '') : ''; }
  firstPv = false;
  post('/api/t/pv', body).then(r => { if (r && r.src && r.src !== 'direct') ls.set('sy_attr', { src: r.src, campaign: r.campaign || '', at: Date.now() }); });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { if (cur) { cur.ms = active(); } vis = false; sendLeave(true); } else { vis = true; since = Date.now(); }
});
addEventListener('pagehide', () => { if (cur) { cur.ms = active(); vis = false; } sendLeave(true); });
let tick = 0; addEventListener('scroll', () => { if (tick) return; tick = requestAnimationFrame(() => { tick = 0; maxScroll = Math.max(maxScroll, scrollPct()); }); }, { passive: true });
bus.on('route', path => { setTimeout(() => pageview(path), 0); });

/** What to send with an order: the last reel / Short / platform the person came through in the past 7 days. */
export function attr() { const a = ls.get('sy_attr'); return a && Date.now() - a.at < 7 * 864e5 ? { src: a.src, campaign: a.campaign } : null; }

/** Called when the visitor presses Accept on the cookie banner: count the page they are on right now. */
export function kick() { if (!cur) pageview(location.pathname); }

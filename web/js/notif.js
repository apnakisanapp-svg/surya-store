// Customer phone notifications: a friendly glass card first, Chrome's own prompt only after the customer says yes.
import { h, api, me, bus, ls, icon, toast, BOOT, cart, debounce } from './core.js';

const DAY = 864e5, SNOOZE = 7 * DAY;
export const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };

async function subscribe() {
  const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
  const info = await api('/account/push/info'); if (!info.key) throw new Error('off');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(info.key) });
  await api('/account/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  return info;
}
async function enable() {
  const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (perm !== 'granted') return perm;
  await subscribe(); return 'granted';
}

function sheet({ icn, title, text, yes, no, onYes, onNo }) {
  const el = h('div', { class: 'pn gl', role: 'dialog', 'aria-label': title },
    h('img', { class: 'pn-ic', src: '/img/icon-192.png', alt: '' }),
    h('div', { class: 'pn-tx' }, h('b', null, title), h('span', null, text)),
    h('div', { class: 'pn-btns' }, h('button', { class: 'btn ghost sm', onclick: () => { close(); onNo && onNo(); } }, no), yes ? h('button', { class: 'btn sm', onclick: async e => { e.currentTarget.disabled = true; try { await onYes(); } finally { close(); } } }, yes) : null));
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); };
  document.body.append(el); requestAnimationFrame(() => el.classList.add('on'));
  return close;
}
const COPY = {
  order: ['Get your order updates', 'Confirmed, shipped, delivered. We will tell you right here on your phone.'],
  heart: ['Never miss a price drop', 'We will tell you when the things you saved get cheaper or come back in stock.'],
};
let shown = false;
export async function ask(reason, force, tries = 0) {
  try {
    if (document.querySelector('.cookie') && tries < 8) { setTimeout(() => ask(reason, force, tries + 1), 2500); return; }
    if (!supported() || !me.customer || (shown && !force)) return;
    if (sessionStorage.getItem('sy_pn') && !force) return;
    const perm = Notification.permission;
    if (perm === 'granted') { if (!sessionStorage.getItem('sy_pn_ok')) { sessionStorage.setItem('sy_pn_ok', '1'); subscribe().catch(() => {}); } return; }
    const key = perm === 'denied' ? 'sy_pn_help' : 'sy_pn_snooze';
    if (!force && Date.now() < ls.get(key, 0)) return;
    shown = true; try { sessionStorage.setItem('sy_pn', '1'); } catch { /* */ }
    const later = () => ls.set(key, Date.now() + SNOOZE);
    if (perm === 'denied') {
      sheet({ title: 'Notifications are blocked', text: 'To turn them on: tap the lock icon next to the address bar, then Notifications, then Allow.', no: 'Got it', onNo: later });
      return;
    }
    const [title, text] = COPY[reason] || COPY.order;
    sheet({ title, text, yes: 'Yes, notify me', no: 'Not now', onNo: later, onYes: async () => { try { const r = await enable(); if (r === 'granted') toast('Done! You will hear from us.'); else later(); } catch { toast('Could not turn on notifications. Try again later.', { err: true }); } } });
  } catch { /* optional */ }
}
// the server keeps a copy of a logged-in, notification-enabled customer's cart so it can send one gentle reminder
const syncCart = debounce(() => { try { if (me.customer && supported() && Notification.permission === 'granted') api('/account/push/cart', { method: 'POST', body: { items: cart.payload() } }).catch(() => {}); } catch { /* */ } }, 4000);
bus.on('cart', syncCart); setTimeout(syncCart, 3000);
bus.on('ordered', () => ask('order'));
bus.on('wished', () => ask('heart'));

/* Account page card: order updates stay on; offers have one simple switch */
export function settingsCard() {
  if (!supported()) return null;
  const box = h('div', { class: 'card stack glass-card' }, h('h3', null, 'Phone notifications'));
  (async () => {
    let st = { devices: 0, offers: true }; try { st = await api('/account/push/info'); } catch { /* */ }
    const on = Notification.permission === 'granted' && st.devices > 0;
    if (!on) {
      box.append(h('p', { class: 'muted small' }, Notification.permission === 'denied' ? 'Notifications are blocked in your browser settings. Tap the lock icon next to the address bar, then Notifications, then Allow.' : 'Get order updates and price-drop alerts on this phone.'),
        Notification.permission === 'denied' ? null : h('button', { class: 'btn sm', onclick: async e => { try { const r = await enable(); toast(r === 'granted' ? 'Notifications are on.' : 'Notifications were not allowed.'); const p = box.parentNode; if (p) p.replaceChild(settingsCard(), box); } catch { toast('Could not turn on notifications.', { err: true }); } } }, 'Turn on notifications'));
      return;
    }
    const sw = h('input', { type: 'checkbox', role: 'switch', checked: !!st.offers, onchange: async e => { try { await api('/account/push/offers', { method: 'POST', body: { on: e.target.checked } }); toast(e.target.checked ? 'Offers are on.' : 'Offers are off. Order updates will still reach you.'); } catch { e.target.checked = !e.target.checked; } } });
    box.append(h('p', { class: 'muted small' }, 'Order updates (confirmed, shipped, delivered) always reach this phone.'), h('label', { class: 'check sw' }, sw, h('span', null, 'Offers, price drops and new arrivals')));
  })();
  return box;
}

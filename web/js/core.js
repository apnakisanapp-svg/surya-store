// Core helpers: DOM builder, API, state, language, toast, modal, router
export const BOOT = (() => { try { return JSON.parse(document.getElementById('boot').textContent); } catch { return { brand: { name: 'SURYA' }, store: {}, payments: {}, shipping: {}, menu: { header: [], footer: [] }, categories: [], policies: [], home: {}, ui: {}, popups: {}, returns: {} }; } })();
export const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

/* ---------- tiny DOM builder ---------- */
/* DOM append/prepend: skip null/undefined/false (a ternary that gives null must not print the word "null") */
for (const m of ['append', 'prepend']) { const o = Element.prototype[m]; Element.prototype[m] = function (...a) { return o.apply(this, a.filter(x => x != null && x !== false)); }; }
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) { for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k.nodeType ? k : document.createTextNode(String(k))); } }
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const sid = (() => { let s = ls.get('sy_sid'); if (!s) { s = Math.random().toString(36).slice(2, 12); ls.set('sy_sid', s); } return s; })();

/* ---------- icons (inline, currentColor) ---------- */
const P = {
  bag: 'M6 7h12l1 13H5L6 7zM9 7a3 3 0 016 0', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6', heart: 'M12 21s-8-5.5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.5-8 11-8 11z',
  menu: 'M4 7h16M4 12h16M4 17h16', x: 'M6 6l12 12M18 6L6 18', card: 'M3 6h18v12H3zM3 10h18', refresh: 'M20 12a8 8 0 10-2.3 5.7M20 5v5h-5', chat: 'M4 5h16v11H9l-5 4V5z',
  truck: 'M2 6h11v9H2zM13 9h4l4 3v3h-8zM6 18a2 2 0 100-.1M17 18a2 2 0 100-.1', check: 'M5 12l5 5 9-10', warn: 'M12 4l9 16H3L12 4zM12 10v4M12 17v.5', info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5',
  chev: 'M9 6l6 6-6 6', chevl: 'M15 6l-6 6 6 6', up: 'M6 14l6-6 6 6', share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6', wa: 'M4 20l1.3-4.2A8 8 0 1112 20a8 8 0 01-3.6-.9L4 20zM9 9c0 3 3 6 6 6l1.2-1.5-2-1-1 .6a4 4 0 01-1.8-1.8l.6-1-1-2L9 9z',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4v-9z', grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  box: 'M3 8l9-5 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z', zoom: 'M11 4a7 7 0 100 14 7 7 0 000-14zM8 11h6M11 8v6', leaf: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19c2-5 5-8 9-10',
};
export function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[name] || P.info); s.append(p);
  return s;
}

/* ---------- language ---------- */
const EN = {
  shop: 'Shop', cart: 'Cart', offers: 'Offers', support: 'Support', track: 'Track order', add: 'Add to cart', buy: 'Buy now', search: 'Search products', account: 'Account', login: 'Log in', home: 'Home',
  all: 'All products', sort: 'Sort', trending: 'Trending', newest: 'Newest', price_lh: 'Price: low to high', price_hl: 'Price: high to low', discount: 'Biggest discount', instock: 'In stock only', apply: 'Apply',
  empty_cart: 'Your cart is empty', continue: 'Continue shopping', checkout: 'Checkout', subtotal: 'Subtotal', shipping: 'Shipping', free: 'Free', total: 'Total', coupon: 'Coupon code', remove: 'Remove', undo: 'Undo', removed: 'Removed from cart',
  added: 'Added to cart', oos: 'Out of stock', low: 'Only {n} left', pincode: 'Pincode', check: 'Check', similar: 'You may also like', recent: 'Recently viewed', specs: 'Details', reviews: 'Reviews', write_review: 'Write a review',
  upi: 'Pay by UPI', cod: 'Cash on delivery', place: 'Place order', next: 'Next', back: 'Back', name: 'Full name', phone: 'Mobile number', email: 'Email (optional)', addr1: 'House, street, area', addr2: 'Landmark (optional)', city: 'City', state: 'State',
  contact: 'Contact details', delivery: 'Delivery address', payment: 'Payment', review: 'Review', terms_ok: 'I agree to the Terms, Privacy Policy and Return Policy', marketing_ok: 'Send me offers on WhatsApp and email (optional)', safety_ok: 'I have read the safety instructions',
  notify: 'Notify me', share: 'Share', copied: 'Link copied', mrp: 'MRP', off: 'off', save: 'Save', send: 'Send', msg: 'Message', order_no: 'Order number', find: 'Find order', logout: 'Log out', register: 'Create account', password: 'Password',
  orders: 'My orders', wishlist: 'Wishlist', addresses: 'Addresses', profile: 'Profile', no_results: 'Nothing found', fb_title: 'No exact match for', fb_text: 'These similar and popular products might help.', try_other: 'Try another word or clear the filters.', load_more: 'Show more', gift: 'Gift wrap', delivery_by: 'Delivery by', pay_now: 'Pay now',
  have_paid: 'I have paid', utr: 'UPI transaction ID (UTR)', cancel_order: 'Cancel order', request: 'Replacement or refund', free_ship_left: 'Add {n} more for free shipping', free_ship_got: 'You get free shipping', size: 'Details', grievance: 'Grievance officer',
  cookies_text: 'We use cookies to keep your cart and improve the site.', accept: 'Accept', reject: 'Reject', lang: 'हिं', yes: 'Yes', no: 'No', close: 'Close', retry: 'Try again', offline: 'You are offline. Some things may not work.',
};
const HI = {
  empty_cart: 'Cart khaali hai', continue: 'Shopping jaari rakho', added: 'Cart mein add ho gaya', oos: 'Stock khatam', low: 'Sirf {n} bache hain', free: 'Free', remove: 'Hatao', undo: 'Wapas', removed: 'Cart se hata diya',
  pincode: 'Pincode', cod: 'Cash on delivery', upi: 'UPI se pay karo', place: 'Order karo', name: 'Poora naam', phone: 'Mobile number', addr1: 'Ghar, gali, area', city: 'Sheher', state: 'Rajya', fb_title: 'Bilkul wahi nahi mila:', fb_text: 'Par ye milte-julte aur popular products aapko pasand aa sakte hain.', no_results: 'Kuch nahi mila', try_other: 'Dusra shabd try karo ya filter hatao.',
  free_ship_left: 'Free shipping ke liye {n} aur jodo', free_ship_got: 'Aapko free shipping mil gayi', terms_ok: 'Mujhe Terms, Privacy aur Return Policy manzoor hai', safety_ok: 'Maine safety instructions padh li hain', notify: 'Wapas aane par batao', copied: 'Link copy ho gaya',
  offline: 'Aap offline hain.', total: 'Total', subtotal: 'Subtotal', shipping: 'Shipping', delivery_by: 'Delivery', have_paid: 'Maine pay kar diya', cancel_order: 'Order cancel karo', lang: 'EN', similar: 'Ye bhi pasand aayenge', recent: 'Aapne dekha', reviews: 'Reviews',
};
let LANG = ls.get('sy_lang') || BOOT.store.default_lang || 'en';
export const lang = () => LANG;
export const t = (k, v) => { let s = (LANG === 'hi' && HI[k]) || EN[k] || k; if (v) for (const [a, b] of Object.entries(v)) s = s.replace(`{${a}}`, b); return s; };
export const tr = (o, f) => (LANG === 'hi' && o && o[f + '_hi']) || (o && o[f]) || '';
export function setLang(l) { LANG = l; ls.set('sy_lang', l); document.documentElement.lang = l === 'hi' ? 'hi' : 'en'; bus.emit('lang'); }
document.documentElement.lang = LANG === 'hi' ? 'hi' : 'en';

/* ---------- event bus ---------- */
export const bus = { m: {}, on(e, f) { (this.m[e] ||= []).push(f); }, off(e, f) { this.m[e] = (this.m[e] || []).filter(x => x !== f); }, emit(e, d) { (this.m[e] || []).slice().forEach(f => f(d)); } };

/* ---------- API ---------- */
export async function api(path, { method = 'GET', body, form } = {}) {
  const opt = { method, headers: { 'x-sy-csrf': '1' }, credentials: 'same-origin' };
  if (form) opt.body = form; else if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, opt); } catch { throw Object.assign(new Error(navigator.onLine ? 'Could not reach the server. Please try again.' : t('offline')), { offline: true }); }
  let data = null; try { data = await res.json(); } catch { /* */ }
  if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Something went wrong. Please try again.'), { status: res.status, data });
  return data;
}

/* ---------- cart & wishlist state ---------- */
export const cart = {
  items: ls.get('sy_cart', []),
  save() { ls.set('sy_cart', this.items); bus.emit('cart'); },
  count() { return this.items.reduce((s, i) => s + i.q, 0); },
  add(p, v, q = 1, info) { const it = this.items.find(i => i.p === p && (i.v || 0) === (v || 0)); if (it) it.q = Math.min(99, it.q + q); else this.items.push({ p, v: v || 0, q, info }); if (info && it) it.info = info; this.save(); },
  setQty(p, v, q) { const it = this.items.find(i => i.p === p && (i.v || 0) === (v || 0)); if (!it) return; it.q = Math.max(1, Math.min(99, q)); this.save(); },
  remove(p, v) { const i = this.items.findIndex(x => x.p === p && (x.v || 0) === (v || 0)); if (i < 0) return null; const [g] = this.items.splice(i, 1); this.save(); return { g, i }; },
  restore(r) { if (r) { this.items.splice(r.i, 0, r.g); this.save(); } },
  clear() { this.items = []; this.save(); },
  payload() { return this.items.map(i => ({ product_id: i.p, variant_id: i.v || null, qty: i.q })); },
};
export const me = { customer: BOOT.customer || null };
export const wish = {
  ids: new Set(ls.get('sy_wish', [])),
  has(id) { return this.ids.has(id); },
  async toggle(id) {
    const on = !this.ids.has(id);
    if (on) this.ids.add(id); else this.ids.delete(id);
    ls.set('sy_wish', [...this.ids]); bus.emit('wish');
    if (me.customer) { try { await api(`/account/wishlist/${id}`, { method: on ? 'PUT' : 'DELETE' }); } catch { /* ignore */ } }
    if (on) api('/events', { method: 'POST', body: { type: 'wish', product_id: id, sid } }).catch(() => {});
    return on;
  },
  async sync() { if (!me.customer) return; try { const list = await api('/account/wishlist'); for (const p of list) this.ids.add(p.id); for (const id of [...this.ids]) if (!list.some(p => p.id === id)) await api(`/account/wishlist/${id}`, { method: 'PUT' }).catch(() => {}); ls.set('sy_wish', [...this.ids]); bus.emit('wish'); } catch { /* */ } },
};
export function recentlyViewed(add) { let r = ls.get('sy_rv', []); if (add) { r = [add, ...r.filter(x => x !== add)].slice(0, 12); ls.set('sy_rv', r); } return r; }

/* ---------- toast & modal ---------- */
let toastBox;
export function toast(msg, { err = false, action, onAction, ms = 3200 } = {}) {
  toastBox ||= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: 'toast' + (err ? ' err' : '') }, h('span', null, msg), action && h('button', { onclick: () => { onAction && onAction(); el.remove(); } }, action));
  toastBox.append(el); setTimeout(() => el.remove(), action ? Math.max(ms, 5000) : ms);
}
/* ---------- overlays + phone back button ----------
   Every drawer / modal / search panel / photo viewer adds ONE history entry (same URL). The phone's back button then
   closes the top overlay instead of leaving the page. Closing by X / outside tap / Esc removes its entry again. */
const ovStack = []; let pendingBack = 0, queuedNav = null;
export function pushOverlay(onPop) { const o = { onPop }; ovStack.push(o); try { history.pushState({ ov: 1 }, '', location.href); } catch { /* */ } return o; }
export function releaseOverlay(o) {
  const i = ovStack.indexOf(o); if (i < 0) return;
  ovStack.splice(i, 1);
  if (i === ovStack.length) { pendingBack++; history.back(); }
}
export function overlayPopped(e) {
  if (pendingBack > 0) { pendingBack--; if (!pendingBack && queuedNav) { const f = queuedNav; queuedNav = null; f(); } return true; }
  if (ovStack.length) { ovStack.pop().onPop(); return true; }
  if (e && e.state && e.state.ov) { pendingBack++; history.back(); return true; } // stale entry (forward button / reload): step over it
  return false;
}
try { if (history.state && history.state.ov) history.replaceState({}, '', location.href); } catch { /* */ }
export function modal(content, { onClose } = {}) {
  const scrim = h('div', { class: 'scrim' }), wrap = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
  const box = h('div', { class: 'box' }, content); wrap.append(box);
  let done = false;
  const vis = () => { if (done) return; done = true; scrim.classList.remove('on'); setTimeout(() => { scrim.remove(); wrap.remove(); }, 200); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const ov = pushOverlay(vis);
  const close = () => { vis(); releaseOverlay(ov); };
  const esc = e => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', close); document.addEventListener('keydown', esc);
  document.body.append(scrim, wrap); requestAnimationFrame(() => scrim.classList.add('on'));
  return { close, box };
}
export function drawer(title, body, footer, { side = 'right', cls = '', onClose } = {}) {
  const scrim = h('div', { class: 'scrim' });
  const d = h('aside', { class: 'drawer ' + side + (cls ? ' ' + cls : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const head = h('div', { class: 'drawer-h' }, h('b', null, title), h('button', { class: 'ibtn', 'aria-label': t('close'), onclick: () => api_.close() }, icon('x')));
  const b = h('div', { class: 'drawer-b' }, body), f = footer ? h('div', { class: 'drawer-f' }, footer) : null;
  d.append(head, b); if (f) d.append(f);
  const esc = e => { if (e.key === 'Escape') api_.close(); };
  let done = false;
  const vis = () => { if (done) return; done = true; scrim.classList.remove('on'); d.classList.remove('on'); document.removeEventListener('keydown', esc); document.body.style.overflow = ''; setTimeout(() => { scrim.remove(); d.remove(); }, 320); onClose && onClose(); };
  const ov = pushOverlay(vis);
  const api_ = { el: d, body: b, footer: f, close() { vis(); releaseOverlay(ov); } };
  scrim.addEventListener('click', () => api_.close()); document.addEventListener('keydown', esc);
  document.body.append(scrim, d); document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { scrim.classList.add('on'); d.classList.add('on'); });
  return api_;
}

/* ---------- router ---------- */
const routes = [];
export const route = (re, fn) => routes.push([re, fn]);
export const nav = (url, replace) => {
  if (pendingBack > 0) { queuedNav = () => nav(url, replace); return; } // an overlay is still stepping back: go after it
  let open = 0;
  if (ovStack.length) { const o = ovStack.splice(0); open = o.length; o.reverse().forEach(x => x.onPop()); replace = true; } // reuse the overlay's history entry
  if (url === location.pathname + location.search) { if (open) { pendingBack++; history.go(-open); } window.scrollTo(0, 0); return; }
  history[replace ? 'replaceState' : 'pushState']({}, '', url); render();
};
let mount;
export function startRouter(el) {
  mount = el;
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button || a.target === '_blank' || a.hasAttribute('download')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || /^\/(api|media|sitemap|robots)/.test(u.pathname) || u.hash && u.pathname === location.pathname) return;
    e.preventDefault(); nav(u.pathname + u.search + u.hash);
  });
  window.addEventListener('popstate', e => { if (overlayPopped(e)) return; render(); });
  render();
}
let token = 0;
export async function render() {
  const my = ++token, path = location.pathname.replace(/\/+$/, '') || '/';
  bus.emit('route', path);
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      const view = h('div', { class: 'view' });
      clear(mount).append(view);
      try { await fn(view, m, new URLSearchParams(location.search)); } catch (e) { if (my === token) { clear(view); view.append(errorView(e)); } }
      if (my !== token) return;
      if (!location.hash) window.scrollTo(0, 0);
      else setTimeout(() => { const el = document.getElementById(location.hash.slice(1)); el && el.scrollIntoView({ behavior: 'smooth' }); }, 60);
      reveal(view); return;
    }
  }
  clear(mount).append(notFoundView());
}
/* The server already sends the right <title> for the page that was opened. Keep it there (Google reads the rendered title),
   and only compute a title for pages reached by tapping inside the app. */
const T0 = document.title, P0 = location.pathname + location.search;
const FULL_NAME = /\b(store|shop)\b/i.test(BOOT.brand.name) ? BOOT.brand.name : BOOT.brand.name + ' Store';
export function setTitle(s) { if (T0 && location.pathname + location.search === P0) { document.title = T0; return; } document.title = s ? `${s} | ${FULL_NAME}` : FULL_NAME; }
export function reveal(root) {
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  $$('.rev', root).forEach(el => io ? io.observe(el) : el.classList.add('in'));
}
export const errorView = e => h('div', { class: 'wrap empty' }, icon('warn'), h('h2', null, e.offline ? t('offline') : 'Something went wrong'), h('p', { class: 'muted' }, e.message), h('p', { style: { marginTop: '16px' } }, h('button', { class: 'btn', onclick: () => render() }, t('retry'))));
export const notFoundView = () => h('div', { class: 'wrap empty' }, icon('search'), h('h2', null, 'Page not found'), h('p', { class: 'muted' }, 'The page you opened is not here.'), h('p', { style: { marginTop: '16px' } }, h('a', { class: 'btn', href: '/' }, t('home'))));

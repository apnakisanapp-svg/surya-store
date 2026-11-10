import { h, $, $$, clear, api, toast, money, dt, ago, card, pageHead, table, statusBadge, badge, debounce, busy, kv } from './lib.js';
import { routes, reg, go, S, renderRoute } from './router.js';
import './orders.js';
import './products.js';
import './resources.js';
import './finance.js';

const NAV = [
  ['', [['/', 'Dashboard'], ['/orders', 'Orders', 'orders'], ['/products', 'Products']]],
  ['Sell', [['/categories', 'Categories'], ['/coupons', 'Coupons'], ['/reviews', 'Reviews', 'reviews'], ['/customers', 'Customers'], ['/messages', 'Messages & complaints', 'messages'], ['/outbox', 'Messages to send', 'outbox']]],
  ['Money', [['/profit', 'Profit centre'], ['/purchases', 'Purchases'], ['/suppliers', 'Suppliers & sourcing'], ['/expenses', 'Expenses'], ['/insights', 'Daily insights']]],
  ['Website', [['/content', 'Banners & home page'], ['/testimonials', 'Testimonials'], ['/faqs', 'FAQ'], ['/policies', 'Policies & pages'], ['/settings/theme', 'Look & theme'], ['/settings/seo', 'SEO & redirects']]],
  ['Rules', [['/compliance', 'Compliance centre', 'compliance'], ['/settings/brand', 'Business details'], ['/settings/payments', 'Payments'], ['/settings/shipping', 'Shipping'], ['/settings/returns', 'Returns'], ['/settings/popups', 'Popups'], ['/settings/profit', 'Profit & risk rules'], ['/settings/messages', 'Message templates'], ['/settings/store', 'Store options']]],
  ['System', [['/security', 'Security'], ['/backup', 'Backup'], ['/activity', 'Activity log']]],
];

const app = $('#app');
async function boot() {
  let me;
  try { me = await api('/me'); } catch { return loginView(); }
  S.me = me;
  if (me.must_change) return changePasswordView(true);
  shell();
}
function loginView() {
  clear(app);
  const email = h('input', { class: 'inp', type: 'email', autocomplete: 'username', autofocus: true }), pw = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password' }), code = h('input', { class: 'inp', inputmode: 'numeric', maxlength: 12, placeholder: '6-digit code' }), codeBox = h('label', { class: 'fld hide' }, h('span', null, 'Authenticator code (or recovery code)'), code);
  const msg = h('div', { class: 'note bad hide' });
  const submit = async e => { e && e.preventDefault(); const b = $('button', form); try { const r = await busy(b, () => api('/login', { method: 'POST', body: { email: email.value, password: pw.value, code: code.value } })); if (r.need_code) { codeBox.classList.remove('hide'); code.focus(); return; } location.hash = '#/'; boot(); } catch (x) { msg.textContent = x.message; msg.classList.remove('hide'); } };
  const form = h('form', { class: 'stack', onsubmit: submit }, h('h1', null, 'SURYA Admin'), h('p', { class: 'muted small' }, 'Owner login'), msg, h('label', { class: 'fld' }, h('span', null, 'Email'), email), h('label', { class: 'fld' }, h('span', null, 'Password'), pw), codeBox, h('button', { class: 'btn primary', style: { width: '100%' } }, 'Log in'));
  app.append(h('div', { class: 'login' }, h('div', { class: 'card' }, form)));
}
export function changePasswordView(forced) {
  clear(app); const o = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password' }), n = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' }), n2 = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' });
  app.append(h('div', { class: 'login' }, h('div', { class: 'card stack' }, h('h1', null, 'Choose a new password'), h('p', { class: 'muted small' }, 'Use at least 10 characters with letters and numbers. This password protects your whole business.'), h('label', { class: 'fld' }, h('span', null, 'Current password'), o), h('label', { class: 'fld' }, h('span', null, 'New password'), n), h('label', { class: 'fld' }, h('span', null, 'Repeat new password'), n2),
    h('button', { class: 'btn primary', onclick: async e => { if (n.value !== n2.value) return toast('The two passwords are different.', true); try { await busy(e.currentTarget, () => api('/password', { method: 'POST', body: { old: o.value, password: n.value } })); toast('Password changed'); boot(); } catch (x) { toast(x.message, true); } } }, 'Save password'))));
}

let view, side;
function shell() {
  clear(app);
  side = h('aside', { class: 'side' }, h('div', { class: 'brand' }, h('span', null, '☀'), h('span', null, S.me.brand || 'SURYA')));
  for (const [grp, items] of NAV) { if (grp) side.append(h('div', { class: 'grp' }, grp)); for (const [p, l, k] of items) side.append(h('a', { class: 'nl', href: '#' + p, 'data-p': p, onclick: () => side.classList.remove('open') }, h('span', null, l), k ? h('span', { class: 'n hide', 'data-k': k }) : null)); }
  side.append(h('div', { class: 'grp' }, 'Account'), h('a', { class: 'nl', href: S.me.site_url, target: '_blank', rel: 'noopener' }, 'View website ↗'), h('a', { class: 'nl', href: '#', onclick: async e => { e.preventDefault(); await api('/logout', { method: 'POST' }); location.hash = ''; location.reload(); } }, 'Log out'));
  const res = h('div', { class: 'res hide' }), q = h('input', { class: 'inp', placeholder: 'Search orders, phone, products, customers…', 'aria-label': 'Search' });
  q.addEventListener('input', debounce(async () => { const v = q.value.trim(); if (v.length < 2) return res.classList.add('hide'); const r = await api('/search?q=' + encodeURIComponent(v)).catch(() => []); clear(res); r.forEach(x => res.append(h('a', { href: '#/' + x.go, onclick: () => { res.classList.add('hide'); q.value = ''; } }, h('b', null, x.title), h('div', { class: 'small muted' }, `${x.type} · ${x.sub}`)))); if (!r.length) res.append(h('div', { style: { padding: '10px 12px' }, class: 'muted' }, 'No match')); res.classList.remove('hide'); }));
  document.addEventListener('click', e => { if (!e.target.closest('.sb')) res.classList.add('hide'); });
  const top = h('div', { class: 'top' }, h('button', { class: 'btn burger', 'aria-label': 'Menu', onclick: () => side.classList.toggle('open') }, '☰'), h('div', { class: 'sb' }, q, res), h('div', { class: 'grow' }), S.me.totp_enabled ? null : h('a', { class: 'badge warn', href: '#/security', title: 'Turn on 2-step login' }, '2-step login is off'));
  view = h('div', { id: 'view' }); app.append(h('div', { class: 'shell' }, side, h('main', { class: 'main' }, top, view)));
  window.addEventListener('hashchange', route); route(); counts(); setInterval(counts, 60000);
}
async function counts() {
  try {
    const d = await api('/dashboard?days=1'), t = d.todo;
    S.counts = { orders: t.verify_upi + t.cod_confirm + t.to_pack + t.to_ship, reviews: t.reviews, messages: t.messages + t.grievances, outbox: t.outbox, compliance: t.grievance_overdue };
    $$('.n[data-k]', side).forEach(el => { const n = S.counts[el.dataset.k]; el.textContent = n; el.classList.toggle('hide', !n); });
  } catch { /* ignore */ }
}
function route() {
  const p = location.hash.slice(1).split('?')[0] || '/';
  $$('a.nl', side).forEach(a => { const ap = a.dataset.p; a.classList.toggle('on', ap && (ap === '/' ? p === '/' : p === ap || p.startsWith(ap + '/'))); });
  window.scrollTo(0, 0); renderRoute(view);
}

/* ---------- dashboard ---------- */
reg(/^\/$/, async v => {
  const d = await api('/dashboard?days=14'), t = d.todo;
  v.append(pageHead('Dashboard', h('a', { class: 'btn', href: '#/products/new' }, '+ Add product')));
  if (d.setup.length) v.append(h('div', { class: 'note warn stack', style: { marginBottom: '14px' } }, h('b', null, 'Finish setting up your store'), h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, d.setup.map(s => h('li', null, h('a', { href: '#/' + s.go }, s.text))))));
  const todos = [['Payments to verify', t.verify_upi, '/orders?status=action'], ['COD to confirm by phone', t.cod_confirm, '/orders?status=cod_confirm'], ['Orders to pack', t.to_pack, '/orders?status=confirmed'], ['Packed, to ship', t.to_ship, '/orders?status=packed'], ['Return / replace requests', t.requests, '/orders?status=delivered'], ['Reviews to approve', t.reviews, '/reviews'], ['Complaints overdue', t.grievance_overdue, '/messages'], ['Open complaints', t.grievances, '/messages'], ['Customer messages', t.messages, '/messages'], ['Low stock products', t.low_stock, '/products?low=1'], ['Risky COD orders', t.risky_cod, '/orders?risky=1'], ['Messages to send', t.outbox, '/outbox'], ['Notify-me requests', t.notify, '/outbox']];
  v.append(h('div', { class: 'grid g4', style: { marginBottom: '14px' } },
    card('', h('div', { class: 'stat' }, h('div', { class: 'l' }, 'Today'), h('div', { class: 'v' }, money(d.today.v)), h('div', { class: 'muted small' }, `${d.today.n} orders`))),
    card('', h('div', { class: 'stat' }, h('div', { class: 'l' }, 'Last 14 days (confirmed)'), h('div', { class: 'v' }, money(d.period.v)), h('div', { class: 'muted small' }, `${d.period.n} orders`))),
    card('', h('div', { class: 'stat' }, h('div', { class: 'l' }, 'Gross profit (14 days)'), h('div', { class: 'v' }, money(d.period.profit)), h('div', { class: 'muted small' }, 'Before shipping, ads, expenses'))),
    card('', h('div', { class: 'stat' }, h('div', { class: 'l' }, 'Products live'), h('div', { class: 'v' }, d.products.live || 0), h('div', { class: 'muted small' }, `${d.products.c || 0} total`)))));
  v.append(card('Needs your attention', h('div', { class: 'grid g4' }, todos.map(([l, n, href]) => h('a', { class: 'todo' + (n ? ' hot' : ''), href: '#' + href }, h('span', null, l), h('b', null, n))))));
  const max = Math.max(1, ...d.series.map(s => s.v));
  v.append(h('div', { class: 'grid g21', style: { marginTop: '14px' } }, card('Sales per day', d.series.length ? h('div', { class: 'bars' }, d.series.map(s => h('div', { style: { height: Math.max(2, s.v / max * 100) + '%' }, 'data-t': `${s.d}: ${money(s.v)} (${s.n})` }))) : h('div', { class: 'muted' }, 'No orders in this period yet.')),
    card('Visitor funnel (14 days)', kv('Product views', d.funnel.views || 0), kv('Added to cart', d.funnel.atc || 0), kv('Started checkout', d.funnel.checkout || 0), kv('Orders', d.period.n))));
  v.append(h('div', { class: 'grid g2', style: { marginTop: '14px' } }, card('Top products', d.topProducts.length ? table([{ l: 'Product', k: 'name' }, { l: 'Sold', k: 'q', r: 1 }, { l: 'Revenue', f: r => money(r.v), r: 1 }], d.topProducts) : h('div', { class: 'muted' }, 'Nothing sold yet.')),
    card('Latest orders', table([{ l: 'Order', f: r => h('a', { href: '#/orders/' + r.id }, r.number) }, { l: 'Customer', k: 'name' }, { l: 'Total', f: r => money(r.total), r: 1 }, { l: 'Status', f: r => statusBadge(r.status) }], d.recent, { empty: 'No orders yet.' }))));
});
boot();

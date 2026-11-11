import { BOOT, h, $, $$, clear, icon, t, tr, lang, setLang, bus, api, money, cart, wish, me, ls, toast, drawer, modal, nav, debounce, sid } from './core.js';

/* ---------- logo ---------- */
let LOGO_N = 0;
export function logo(dark) {
  const T = BOOT.theme || {}, src = dark && T.logo_dark ? T.logo_dark : T.logo;
  if (src) return h('a', { class: 'logo', href: '/', 'aria-label': BOOT.brand.name }, h('img', { src, alt: BOOT.brand.name, height: 30 }), T.show_logo_text ? h('span', null, BOOT.brand.name) : null);
  const gid = 'lg' + (++LOGO_N); // one id per logo instance (header + footer must not clash)
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'sunmark');
  s.innerHTML = `<defs><linearGradient id="lg${gid}L" gradientUnits="userSpaceOnUse" x1="10" y1="4" x2="54" y2="60"><stop offset="0" stop-color="#FFF1BF"/><stop offset=".35" stop-color="#FFC84A"/><stop offset=".7" stop-color="#E59A1B"/><stop offset="1" stop-color="#A8670A"/></linearGradient><radialGradient id="lg${gid}D" gradientUnits="userSpaceOnUse" cx="27" cy="26" r="19"><stop offset="0" stop-color="#FFF6CC"/><stop offset=".45" stop-color="#FFCB4F"/><stop offset="1" stop-color="#D98E12"/></radialGradient></defs><g><line class="ray" style="--i:0" x1="32.00" y1="12.50" x2="32.00" y2="2.00" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="3.4" stroke-linecap="round"/><line class="ray" style="--i:1" x1="41.75" y1="15.11" x2="44.75" y2="9.92" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="2.6" stroke-linecap="round"/><line class="ray" style="--i:2" x1="48.89" y1="22.25" x2="57.98" y2="17.00" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="3.4" stroke-linecap="round"/><line class="ray" style="--i:3" x1="51.50" y1="32.00" x2="57.50" y2="32.00" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="2.6" stroke-linecap="round"/><line class="ray" style="--i:4" x1="48.89" y1="41.75" x2="57.98" y2="47.00" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="3.4" stroke-linecap="round"/><line class="ray" style="--i:5" x1="41.75" y1="48.89" x2="44.75" y2="54.08" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="2.6" stroke-linecap="round"/><line class="ray" style="--i:6" x1="32.00" y1="51.50" x2="32.00" y2="62.00" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="3.4" stroke-linecap="round"/><line class="ray" style="--i:7" x1="22.25" y1="48.89" x2="19.25" y2="54.08" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="2.6" stroke-linecap="round"/><line class="ray" style="--i:8" x1="15.11" y1="41.75" x2="6.02" y2="47.00" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="3.4" stroke-linecap="round"/><line class="ray" style="--i:9" x1="12.50" y1="32.00" x2="6.50" y2="32.00" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="2.6" stroke-linecap="round"/><line class="ray" style="--i:10" x1="15.11" y1="22.25" x2="6.02" y2="17.00" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="3.4" stroke-linecap="round"/><line class="ray" style="--i:11" x1="22.25" y1="15.11" x2="19.25" y2="9.92" pathLength="1" stroke="url(#lg${gid}L)" stroke-width="2.6" stroke-linecap="round"/></g><circle class="disc" cx="32" cy="32" r="12.5" fill="url(#lg${gid}D)"/><ellipse class="gloss" cx="27.5" cy="27" rx="6.5" ry="4" transform="rotate(-35 27.5 27)" fill="#fff" opacity=".42"/>`;
  return h('a', { class: 'logo', href: '/', 'aria-label': BOOT.brand.name }, s, h('span', null, BOOT.brand.name));
}

/* ---------- product card ---------- */
export function stars(avg) { const n = Math.round(avg); return h('span', { class: 'stars', 'aria-label': `${avg} out of 5` }, [1, 2, 3, 4, 5].map(i => h('i', { class: i <= n ? 'on' : '' }, '★'))); }
export function tweenNum(el, from, to, text, ms = 600) {
  if (from === to) { el.textContent = text(to); return; }
  const t0 = performance.now(); const step = now => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = text(k < 1 ? Math.round(from + (to - from) * e) : to); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
}
/* Counts up from 0 when it scrolls into view. Plays on every phone, even with "reduce motion" on, because it is short and small. */
export function pctBadge(cls, n, text, tag) {
  const el = h(tag || (cls ? 'span' : 'em'), cls ? { class: cls } : null, text(0));
  const run = () => { el.classList.add('pop'); tweenNum(el, 0, n, text, 700); };
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); run(); } }, { threshold: 0.35 }); io.observe(el); } else el.textContent = text(n);
  return el;
}
/* Price row, played once when it scrolls into view: MRP shows -> a line cuts it -> price falls from MRP to the real price -> "% off" pops. */
export function fillPrice(root, { price, mrp, pct, mrpText }) {
  const b = h('b', null, money(price));
  if (!mrp || mrp <= price || !('IntersectionObserver' in window)) { root.append(b, mrp ? h('s', null, mrpText || money(mrp)) : null, mrp && pct ? h('em', null, `${pct}% ${t('off')}`) : null); return; }
  const s = h('s', null, mrpText || money(mrp)), em = h('em', null, `${pct}% ${t('off')}`);
  root.classList.add('pa-init'); b.textContent = money(mrp); root.append(b, s, em);
  const io = new IntersectionObserver(es => {
    if (!es[0].isIntersecting) return; io.disconnect();
    root.classList.add('pa-strike');
    setTimeout(() => { root.classList.remove('pa-strike'); tweenNum(b, mrp, price, v => money(v), 600); s.classList.add('pa-in'); }, 520);
    setTimeout(() => { root.classList.remove('pa-init'); em.classList.add('pop'); tweenNum(em, 0, pct, v => `${v}% ${t('off')}`, 500); }, 1150);
  }, { threshold: 0.5 });
  io.observe(root);
}
export function productCard(p, { priority = false } = {}) {
  const img = p.images[0], out = p.stock_state === 'out';
  const heart = h('button', { class: 'heart' + (wish.has(p.id) ? ' on' : ''), 'aria-label': 'Wishlist', onclick: async e => { e.preventDefault(); e.stopPropagation(); const on = await wish.toggle(p.id); heart.classList.toggle('on', on); } }, icon('heart'));
  const a = h('a', { class: 'pc' + (out ? ' soldout' : ''), href: `/p/${p.slug}`, 'aria-label': tr(p, 'name') },
    h('div', { class: 'pc-img' },
      img ? h('img', { src: img.card, alt: (lang() === 'hi' && img.alt_hi) || img.alt || tr(p, 'name'), width: 720, height: 720, loading: priority ? 'eager' : 'lazy', decoding: 'async' }) : null,
      p.badge ? h('span', { class: 'badge' }, p.badge) : (p.discount_pct >= 10 ? pctBadge('badge', p.discount_pct, v => `${v}% ${t('off')}`) : null),
      out ? h('span', { class: 'so-tag' }, t('oos')) : null, BOOT.store.wishlist ? heart : null),
    h('div', { class: 'pc-body' },
      h('div', { class: 'pc-name' }, tr(p, 'name')),
      p.rating.count ? h('div', { class: 'row', style: { gap: '6px' } }, stars(p.rating.avg), h('span', { class: 'muted small' }, `(${p.rating.count})`)) : null,
      (() => { const r = h('div', { class: 'price' }); fillPrice(r, { price: p.price, mrp: p.mrp, pct: p.discount_pct }); return r; })(),
      p.stock_state === 'low' && p.stock_left ? h('span', { class: 'small', style: { color: 'var(--warn)' } }, t('low', { n: p.stock_left })) : null));
  if (BOOT.ui.card_hover_tilt && matchMedia('(hover:hover) and (pointer:fine)').matches && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
    a.addEventListener('pointermove', e => { const r = a.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; a.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateY(-3px)`; });
    a.addEventListener('pointerleave', () => { a.style.transform = ''; });
  }
  return a;
}
export const skeletons = n => h('div', { class: 'pgrid' }, Array.from({ length: n }, () => h('div', null, h('div', { class: 'skel', style: { aspectRatio: '1/1' } }), h('div', { class: 'skel', style: { height: '16px', margin: '10px 0 6px', width: '80%' } }), h('div', { class: 'skel', style: { height: '16px', width: '40%' } }))));

/* ---------- header / footer ---------- */
const menuLink = it => h('a', { href: it.url, 'data-url': it.url }, tr(it, 'label'));
export function buildChrome(root) {
  const A = BOOT.announcement || {};
  const annc = A.enabled && A.text && !ls.get('sy_annc_' + btoa(unescape(encodeURIComponent(A.text))).slice(0, 12)) ? h('div', { class: 'annc', style: { background: A.bg || null, color: A.fg || null } }, A.link ? h('a', { href: A.link }, lang() === 'hi' && A.text_hi ? A.text_hi : A.text) : (lang() === 'hi' && A.text_hi ? A.text_hi : A.text), h('button', { 'aria-label': t('close'), onclick: e => { ls.set('sy_annc_' + btoa(unescape(encodeURIComponent(A.text))).slice(0, 12), 1); e.target.closest('.annc').remove(); } }, '×')) : null;
  const count = h('span', { class: 'cnt hide' }), wcount = h('span', { class: 'cnt hide' });
  const refreshCount = () => { const n = cart.count(); count.textContent = n; count.classList.toggle('hide', !n); count.classList.remove('pop'); void count.offsetWidth; if (n) count.classList.add('pop'); };
  bus.on('cart', refreshCount); refreshCount();
  const nv = h('nav', { class: 'nav', 'aria-label': 'Main' }, (BOOT.menu.header || []).map(menuLink));
  const langBtn = h('button', { class: 'ibtn lang hsm', 'aria-label': 'Language', onclick: () => { setLang(lang() === 'hi' ? 'en' : 'hi'); location.reload(); } }, t('lang'));
  const burger = h('button', { class: 'ibtn burger', 'aria-label': 'Menu', onclick: () => { const d = drawer(BOOT.brand.name, h('nav', { class: 'stack mnav' }, (BOOT.menu.header || []).map(it => h('a', { href: it.url, style: { display: 'block', padding: '10px 0', fontSize: '1.15rem', textDecoration: 'none' }, onclick: () => d.close() }, tr(it, 'label'))), h('hr', { style: { border: 0, borderTop: '1px solid var(--line)' } }), h('a', { href: '/orders#track', style: { display: 'block', padding: '10px 0', textDecoration: 'none' }, onclick: () => d.close() }, t('track')), h('a', { href: me.customer ? '/profile' : '/login', style: { display: 'block', padding: '10px 0', textDecoration: 'none' }, onclick: () => d.close() }, t('account')), BOOT.store.wishlist ? h('a', { href: '/wishlist', style: { display: 'block', padding: '10px 0', textDecoration: 'none' }, onclick: () => d.close() }, t('wishlist')) : null, BOOT.store.language_toggle ? h('a', { href: '#', style: { display: 'block', padding: '10px 0', textDecoration: 'none' }, onclick: e => { e.preventDefault(); setLang(lang() === 'hi' ? 'en' : 'hi'); location.reload(); } }, lang() === 'hi' ? 'English' : 'हिंदी') : null), null, { side: 'left', cls: 'menu-glass' }); } }, icon('menu'));
  const backB = h('button', { class: 'ibtn backb', 'aria-label': 'Back', onclick: () => { if (history.length > 1) history.back(); else nav('/shop'); } }, icon('chevl'));
  const hdr = h('header', { class: 'hdr glass' }, h('div', { class: 'wrap hdr-in' }, backB, burger, logo(), nv, h('div', { class: 'grow' }),
    h('button', { class: 'ibtn', 'aria-label': t('search'), onclick: openSearch }, icon('search')),
    BOOT.store.language_toggle ? langBtn : null,
    acctMenu(),
    BOOT.store.wishlist ? h('a', { class: 'ibtn', href: '/wishlist', 'aria-label': t('wishlist') }, icon('heart')) : null,
    null));
  const prog = h('div', { class: 'pbar', 'aria-hidden': 'true' });
  addEventListener('scroll', () => { hdr.classList.toggle('scrolled', scrollY > 8); const m = document.documentElement.scrollHeight - innerHeight; if (BOOT.ui.scroll_progress) prog.style.width = m > 0 ? (scrollY / m * 100) + '%' : '0'; }, { passive: true });
  bus.on('route', p => { $$('.nav a', hdr).forEach(a => a.classList.toggle('on', a.dataset.url.split('?')[0] === p && p !== '/')); });
  root.prepend(...[annc, hdr, prog].filter(Boolean));

  // mobile glass bottom bar (hidden on wide screens by CSS)
  const bcount = h('span', { class: 'cnt hide' });
  const refreshB = () => { const n = cart.count(); bcount.textContent = n; bcount.classList.toggle('hide', !n); }; bus.on('cart', refreshB); refreshB();
  const ordersUrl = () => '/orders';
  const items = [
    { k: 'home', url: '/', label: t('home'), ic: 'home' },
    { k: 'shop', url: '/shop', label: t('shop'), ic: 'grid' },
    { k: 'orders', url: ordersUrl(), label: lang() === 'hi' ? 'Orders' : 'Orders', ic: 'box' },
    { k: 'cart', url: '#cart', label: t('cart'), ic: 'bag', badge: bcount },
    { k: 'account', url: me.customer ? '/profile' : '/login', label: t('account'), ic: 'user' },
  ];
  const bubble = h('span', { class: 'bb-bubble', 'aria-hidden': 'true' });
  const links = items.map(it => it.k === 'cart'
    ? h('button', { class: 'bb-i', 'data-k': it.k, onclick: openCart }, icon(it.ic), it.badge, h('span', null, it.label))
    : h('a', { class: 'bb-i', 'data-k': it.k, href: it.url }, icon(it.ic), h('span', null, it.label)));
  const bar = h('nav', { class: 'bbar', 'aria-label': 'Quick menu' }, bubble, ...links);
  bar.addEventListener('pointerdown', e => { const it = e.target.closest('.bb-i'); if (!it) return; const r = it.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.3, rip = h('i', { class: 'bb-rip', style: { width: d + 'px', height: d + 'px', left: (e.clientX - r.left - d / 2) + 'px', top: (e.clientY - r.top - d / 2) + 'px' } }); it.append(rip); setTimeout(() => rip.remove(), 650); });
  let cur = -1;
  const moveBubble = i => {
    const to = `translateX(${i * 100}%)`;
    if (cur < 0 || cur === i || matchMedia('(prefers-reduced-motion: reduce)').matches || !bubble.animate) { bubble.style.transform = to; cur = i; return; }
    const d = Math.abs(i - cur), mid = `translateX(${(i + cur) / 2 * 100}%)`, from = `translateX(${cur * 100}%)`;
    // liquid: stretch while travelling, squash on arrival, small overshoot, settle
    bubble.animate([
      { transform: `${from} scale(1,1)`, offset: 0 },
      { transform: `${mid} scale(${1 + Math.min(.9, .38 * d)},.86)`, offset: .45, easing: 'cubic-bezier(.2,.7,.3,1)' },
      { transform: `${to} scale(.9,1.1)`, offset: .75 },
      { transform: `${to} scale(1.04,.97)`, offset: .9 },
      { transform: `${to} scale(1,1)`, offset: 1 },
    ], { duration: 560 + d * 40, easing: 'cubic-bezier(.3,.9,.4,1)' });
    bubble.style.transform = to; cur = i;
  };
  const mark = p => {
    let k = '';
    if (p === '/') k = 'home';
    else if (/^\/(shop|product|category|c)(\/|$)/.test(p)) k = 'shop';
    else if (/^\/(track|order|orders|wishlist)(\/|$)/.test(p)) k = 'orders';
    else if (/^\/(account|login|profile)$/.test(p)) k = 'account';
    links.forEach(a => a.classList.toggle('on', a.dataset.k === k));
    const i = items.findIndex(x => x.k === k);
    bar.classList.toggle('none', i < 0);
    if (i >= 0) moveBubble(i);
    const o = links[2]; if (o && o.tagName === 'A') o.setAttribute('href', ordersUrl());
  };
  const onProd = p => document.body.classList.toggle('on-product', /^\/p\/[^/]+/.test(p || location.pathname));
  bus.on('route', p => onProd(p)); onProd(location.pathname);
  bus.on('route', mark); mark(location.pathname);
  root.append(bar);

  // footer
  const B = BOOT.brand, pol = BOOT.policies.filter(p => p.in_footer);
  const cols = (BOOT.menu.footer || []).map(c => h('div', null, h('h4', null, tr(c, 'title')), h('ul', null, c.links.map(l => h('li', null, h('a', { href: l.url }, tr(l, 'label')))))));
  const ftr = h('footer', { class: 'ftr' }, h('div', { class: 'wrap' }, h('div', { class: 'ftr-g' },
    h('div', null, logo(), h('p', { class: 'muted', style: { marginTop: '12px', maxWidth: '28em' } }, B.tagline), h('p', { class: 'small', style: { marginTop: '12px' } }, [B.phone && h('a', { href: 'tel:' + B.phone }, B.phone), B.phone && B.email ? ' · ' : null, B.email && h('a', { href: 'mailto:' + B.email }, B.email)]), B.support_hours ? h('p', { class: 'small muted' }, B.support_hours) : null,
      newsletterBox()),
    ...cols,
    h('div', null, h('h4', null, 'Policies'), h('ul', null, pol.map(p => h('li', null, h('a', { href: `/policy/${p.slug}` }, tr(p, 'title')))), h('li', null, h('a', { href: '/grievance' }, t('grievance'))), h('li', null, h('a', { href: '#', onclick: e => { e.preventDefault(); ls.del('sy_cookie'); cookieBanner(true); } }, 'Cookie settings'))))),
    h('div', { class: 'ftr-b' }, h('span', null, `© ${new Date().getFullYear()} ${B.legal_name || B.name}${B.gstin ? ' · GSTIN ' + B.gstin : ''}`), h('span', null, [B.address, B.city].filter(Boolean).join(', ')))));
  const slim = h('nav', { class: 'slimf hide', 'aria-label': 'Legal' }, ...[['terms', 'Terms'], ['privacy', 'Privacy'], ['returns', 'Refund']].map(([k, l]) => h('a', { href: '/policy/' + k }, l)), h('a', { href: '/contact' }, 'Contact'));
  const fmark = path => { const home = path === '/' || path === ''; ftr.classList.toggle('hide', !home); slim.classList.toggle('hide', home); };
  bus.on('route', fmark); fmark(location.pathname);
  root.append(ftr, slim);
  // floating buttons
  const top = h('button', { class: 'btn alt hide', 'aria-label': 'Back to top', onclick: () => scrollTo({ top: 0, behavior: 'smooth' }) }, icon('up'));
  const waIcon = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<defs><linearGradient id="waG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6BF58A"/><stop offset=".55" stop-color="#25C45A"/><stop offset="1" stop-color="#0E8F3C"/></linearGradient><radialGradient id="waS" cx=".3" cy=".18" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="url(#waG)"/><path d="M32 12c-11 0-20 8.5-20 19 0 4 1.3 7.7 3.5 10.8L13 51l9.6-2.4c2.7 1.4 5.700 2.200 9.400 2.200 11 0 20-8.500 20-19S43 12 32 12z" fill="#fff"/><path d="M25 22.500c-1 0-2 .9-2.300 2-.8 3.200 1.200 8 5.200 12 4 4 8.900 5.900 12 5.200 1.100-.3 2-1.300 2-2.300l-.1-1.900-4.500-2-1.900 2c-2.700-.9-5.500-3.700-6.400-6.500l1.900-1.900-2-4.500-1.900-.1z" fill="#1DAE4E"/><circle cx="32" cy="32" r="30" fill="url(#waS)"/>'; return s; };
  root.append(h('div', { class: 'fab' }, BOOT.ui.back_to_top ? top : null));
  addEventListener('scroll', () => top.classList.toggle('hide', scrollY < 700), { passive: true });
  addEventListener('offline', () => { const o = h('div', { class: 'offline', id: 'offl' }, t('offline')); document.body.append(o); });
  addEventListener('online', () => $('#offl') && $('#offl').remove());
}
function acctMenu() {
  const c = me.customer;
  if (!c) return h('a', { class: 'ibtn hsm', href: '/login', 'aria-label': t('account') }, icon('user'));
  const first = c.first_name || (c.name || '').split(' ')[0] || c.email.split('@')[0];
  let isOpen = false;
  const item = (href, label, ic) => h('a', { class: 'am-i', href, onclick: () => close() }, h('span', { class: 'am-ic' }, icon(ic)), label);
  const hl = h('span', { class: 'am-hl', 'aria-hidden': 'true' });
  const list = h('div', { class: 'am-list' }, hl,
    item('/profile', 'My profile', 'user'), item('/orders', 'My orders', 'box'), item('/orders#track', 'Track order', 'search'), BOOT.store.wishlist ? item('/wishlist', 'Wishlist', 'heart') : null, item('/profile#addresses', 'Addresses', 'home'));
  const out = h('button', { class: 'am-i out', onclick: async () => { try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ } location.href = '/'; } }, 'Log out');
  const menu = h('div', { class: 'am', role: 'menu' }, h('div', { class: 'am-head' }, h('span', { class: 'am-av' }, (first[0] || '?').toUpperCase()), h('div', null, h('b', null, first), h('span', null, c.email))), list, out);
  // sliding glass highlight that follows the pointer / keyboard focus
  const moveHl = el => { hl.style.opacity = '1'; hl.style.height = el.offsetHeight + 'px'; hl.style.transform = `translateY(${el.offsetTop}px)`; };
  list.addEventListener('mouseover', e => { const a = e.target.closest('.am-i'); if (a) moveHl(a); }); list.addEventListener('mouseleave', () => { hl.style.opacity = '0'; });
  list.addEventListener('focusin', e => { const a = e.target.closest('.am-i'); if (a) moveHl(a); });
  const btn = h('button', { class: 'ibtn hsm', 'aria-label': t('account'), 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: e => { e.stopPropagation(); isOpen ? close() : open(); } }, icon('user'));
  // The menu lives on <body> (not inside the glass header) so its blur can see the page behind it.
  const place = () => { const r = btn.getBoundingClientRect(); menu.style.top = (r.bottom + 10) + 'px'; menu.style.right = Math.max(10, window.innerWidth - r.right - 4) + 'px'; };
  function open() { isOpen = true; place(); if (!menu.isConnected) document.body.append(menu); menu.classList.remove('closing'); void menu.offsetWidth; menu.classList.add('show'); btn.setAttribute('aria-expanded', 'true'); }
  function close() { if (!isOpen) return; isOpen = false; menu.classList.remove('show'); menu.classList.add('closing'); btn.setAttribute('aria-expanded', 'false'); setTimeout(() => { if (!isOpen) menu.remove(); }, 220); }
  document.addEventListener('click', e => { if (isOpen && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', () => { if (isOpen) place(); }); window.addEventListener('scroll', () => { if (isOpen) place(); }, { passive: true });
  return btn;
}

function newsletterBox() {
  if (!BOOT.popups.newsletter || BOOT.popups.newsletter.enabled === false) return null;
  const inp = h('input', { class: 'inp', type: 'email', placeholder: 'Email', 'aria-label': 'Email', required: true, autocomplete: 'email' });
  const f = h('form', { class: 'row', style: { marginTop: '16px', flexWrap: 'nowrap' }, onsubmit: async e => { e.preventDefault(); try { const r = await api('/newsletter', { method: 'POST', body: { email: inp.value } }); toast(r.message); inp.value = ''; } catch (x) { toast(x.message, { err: true }); } } }, inp, h('button', { class: 'btn sm' }, t('send')));
  return f;
}

/* ---------- search overlay ---------- */
export function openSearch() {
  const scrim = h('div', { class: 'scrim on' }), list = h('div', { class: 'sug' });
  const inp = h('input', { class: 'inp', type: 'search', placeholder: t('search'), 'aria-label': t('search'), autocomplete: 'off', enterkeyhint: 'search' });
  const close = () => { pan.remove(); scrim.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const go = q => { close(); nav('/shop?q=' + encodeURIComponent(q)); };
  const pan = h('div', { class: 'search-pan', role: 'dialog', 'aria-label': t('search') }, h('div', { class: 'wrap' }, h('form', { class: 'row', style: { flexWrap: 'nowrap' }, onsubmit: e => { e.preventDefault(); if (inp.value.trim()) go(inp.value.trim()); } }, h('div', { class: 'grow' }, inp), h('button', { type: 'button', class: 'ibtn', 'aria-label': t('close'), onclick: close }, icon('x'))), list));
  scrim.addEventListener('click', close); document.addEventListener('keydown', esc); document.body.append(scrim, pan); inp.focus();
  const popular = (BOOT.search && BOOT.search.popular) || [];
  if (popular.length) list.append(h('div', { class: 'row' }, popular.map(q => h('button', { class: 'chip', onclick: () => go(q) }, q))));
  const run = debounce(async () => {
    const q = inp.value.trim(); if (q.length < 2) return;
    try {
      const r = await api('/suggest?q=' + encodeURIComponent(q)); clear(list);
      if (r.fallback) list.append(h('p', { class: 'fb-sug muted small' }, `${t('fb_title')} “${q}” · ${t('fb_text')}`));
      for (const c of r.categories) list.append(h('a', { href: `/shop?category=${c.slug}`, onclick: close }, h('b', null, tr(c, 'name')), h('span', { class: 'muted small' }, 'Category')));
      for (const p of r.products) list.append(h('a', { href: `/p/${p.slug}`, onclick: close }, p.image ? h('img', { src: p.image, alt: '', width: 44, height: 44 }) : h('span', { style: { width: '44px' } }), h('span', { class: 'grow' }, tr(p, 'name')), h('b', null, money(p.price))));
      if (r.products.length || r.categories.length) list.append(h('a', { href: '/shop?q=' + encodeURIComponent(q), onclick: close }, h('span', { class: 'link' }, `${t('all')} → "${q}"`)));
    } catch { /* ignore */ }
  }, 220);
  inp.addEventListener('input', run);
}

/* ---------- cart drawer ---------- */
export async function priceNow(extra = {}) {
  if (!cart.items.length) return null;
  return api('/cart/price', { method: 'POST', body: { items: cart.payload(), ...extra } });
}
export function lineEl(l, onChange) {
  const it = cart.items.find(i => i.p === l.product_id && (i.v || 0) === (l.variant_id || 0));
  return h('div', { class: 'ci' },
    h('a', { href: l.slug ? `/p/${l.slug}` : null }, l.image ? h('img', { src: l.image, alt: '', width: 72, height: 72, loading: 'lazy' }) : h('div', { style: { width: '72px', height: '72px', background: 'var(--bg2)', borderRadius: '14px' } })),
    h('div', { style: { minWidth: 0 } }, h('div', { class: 'nm' }, (lang() === 'hi' && l.name_hi) || l.name), l.variant_name ? h('div', { class: 'muted small' }, l.variant_name) : null,
      l.issue ? h('div', { class: 'small', style: { color: 'var(--err)' } }, l.issue_text || ({ unavailable: 'No longer available', out: t('oos'), stock: `Only ${l.max_qty} available`, variant: 'Choose an option' }[l.issue] || l.issue)) : null,
      h('div', { class: 'row', style: { gap: '10px' } }, h('div', { class: 'qty' }, h('button', { 'aria-label': '-', onclick: () => { if ((it ? it.q : 1) > 1) { cart.setQty(l.product_id, l.variant_id, it.q - 1); onChange(); } } }, '−'), h('span', null, l.qty), h('button', { 'aria-label': '+', onclick: () => { cart.setQty(l.product_id, l.variant_id, (it ? it.q : 1) + 1); onChange(); } }, '+')),
        h('button', { class: 'link', style: { background: 'none', border: 0, cursor: 'pointer', fontSize: '.85rem', marginTop: '8px' }, onclick: () => { const r = cart.remove(l.product_id, l.variant_id); onChange(); toast(t('removed'), { action: t('undo'), onAction: () => { cart.restore(r); onChange(); } }); } }, t('remove')))),
    h('div', { style: { textAlign: 'right', fontWeight: 600 } }, money(l.line_total != null ? l.line_total : l.price * l.qty), l.mrp > l.price ? h('div', { class: 'muted small' }, h('s', null, money(l.mrp * l.qty))) : null));
}
export function shipBar(p) {
  if (!p.free_above) return null;
  const left = p.free_shipping_remaining || 0, pct = Math.min(100, (p.free_above - left) / p.free_above * 100);
  return h('div', null, h('div', { class: 'small' }, left > 0 ? t('free_ship_left', { n: money(left) }) : t('free_ship_got')), h('div', { class: 'ship-bar' }, h('i', { style: { width: pct + '%' } })));
}
let drawerOpen = null;
export async function openCart() {
  if (drawerOpen) return;
  const body = h('div'), foot = h('div');
  const d = drawer(`${t('cart')}`, body, foot, { cls: 'cart-glass' }); drawerOpen = d;
  const orig = d.close; d.close = () => { drawerOpen = null; bus.off('cart', refresh); orig(); };
  async function refresh() {
    clear(body); clear(foot);
    if (!cart.items.length) {
      const sug = h('div', { class: 'cart-sug' });
      body.append(h('div', { class: 'cart-empty' }, h('div', { class: 'ce-art' }, h('i', { class: 'ce-ring' }), h('i', { class: 'ce-ring r2' }), icon('bag')), h('h3', null, 'Your cart is empty'), h('p', { class: 'muted' }, 'Add something you like and it will wait for you here.'), h('a', { class: 'btn ce-btn', href: '/shop', onclick: () => d.close() }, 'Start shopping')), sug);
      api('/products?sort=trending&limit=4').then(r => { const list = (r.items || r || []).slice(0, 4); if (!list.length) return; sug.append(h('div', { class: 'ce-title' }, 'Popular right now'), h('div', { class: 'pgrid ce-grid' }, list.map(p => { const a = productCard(p); a.addEventListener('click', () => d.close()); return a; }))); }).catch(() => { /* suggestions are optional */ });
      return;
    }
    body.append(skeletons(1));
    let p; try { p = await priceNow(); } catch (e) { clear(body).append(h('p', { class: 'muted' }, e.message)); return; }
    syncFromPrice(p); clear(body);
    body.append(shipBar(p), ...p.lines.map(l => lineEl(l, refresh)));
    foot.append(h('div', { class: 'tot', style: { marginBottom: '12px' } }, h('div', null, h('span', null, t('subtotal')), h('span', null, money(p.subtotal))), p.discount ? h('div', { class: 'g' }, h('span', null, t('coupon')), h('span', null, '−' + money(p.discount))) : null), h('p', { class: 'muted small', style: { marginBottom: '12px' } }, 'Shipping and COD fee are shown at checkout.'),
      h('a', { class: 'btn block', href: '/checkout', onclick: () => d.close() }, `${t('checkout')} · ${money(p.subtotal - p.discount)}`), h('a', { class: 'btn ghost block', style: { marginTop: '8px' }, href: '/cart', onclick: () => d.close() }, t('cart')));
  }
  bus.on('cart', refresh); refresh();
}
/** Drop lines the server says are gone and clamp quantities, so the cart never fights the shelf. */
export function syncFromPrice(p) {
  let changed = false;
  for (const l of p.lines) {
    const it = cart.items.find(i => i.p === l.product_id && (i.v || 0) === (l.variant_id || 0));
    if (!it) continue;
    if (l.issue === 'unavailable') { cart.items.splice(cart.items.indexOf(it), 1); changed = true; }
    else if ((l.issue === 'stock' || l.issue === 'max') && l.qty > 0 && it.q !== l.qty) { it.q = l.qty; changed = true; }
  }
  if (changed) ls.set('sy_cart', cart.items);
}
export function addToCart(prod, variantId, qty, btn) {
  const go = () => {
    cart.add(prod.id, variantId, qty, { name: prod.name });
    api('/events', { method: 'POST', body: { type: 'atc', product_id: prod.id, sid } }).catch(() => {});
    toast(t('added'), { action: t('cart'), onAction: openCart });
    if (btn) { btn.classList.add('is-busy'); setTimeout(() => btn.classList.remove('is-busy'), 350); }
  };
  if (prod.has_battery && BOOT.popups.battery_notice && !ls.get('sy_batt_ok')) {
    const m = modal(h('div', { class: 'stack' }, icon('warn'), h('h3', null, 'Battery product'), h('p', null, BOOT.shipping.battery_notice), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { ls.set('sy_batt_ok', 1); m.close(); go(); } }, 'OK, add to cart'), h('button', { class: 'btn ghost', onclick: () => m.close() }, t('close')))));
  } else go();
}

/* ---------- popups: cookie, welcome, exit intent, intro ---------- */
export function cookieBanner(force) {
  if (!force && ls.get('sy_cookie')) return;
  const C = BOOT.popups.cookie || {};
  const el = h('div', { class: 'cookie glass', role: 'dialog', 'aria-label': 'Cookies' }, h('p', { class: 'small' }, (lang() === 'hi' && C.text_hi) || C.text || t('cookies_text'), ' ', h('a', { class: 'link', href: '/policy/cookies' }, 'Read more')),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn sm grow', onclick: () => { ls.set('sy_cookie', 'all'); el.remove(); loadAnalytics(); } }, t('accept')), h('button', { class: 'btn sm ghost grow', onclick: () => { ls.set('sy_cookie', 'essential'); el.remove(); } }, t('reject'))));
  const upd = path => { el.style.display = /^\/(login|checkout|account|profile)/.test(path || location.pathname) ? 'none' : ''; }; upd(); bus.on('route', upd); // never cover the login / checkout forms
  document.body.append(el);
}
export function loadAnalytics() {
  if (ls.get('sy_cookie') !== 'all') return;
  const id = BOOT.seo && BOOT.seo.ga_id; if (!id || !/^G-[A-Z0-9]+$/.test(id) || window.__ga) return; window.__ga = 1;
  const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id; document.head.append(s);
  window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; gtag('js', new Date()); gtag('config', id);
}
export function welcomePopup() {
  const W = BOOT.popups.welcome; if (!W || !W.enabled || ls.get('sy_welcome') || me.customer) return;
  setTimeout(() => {
    if (document.querySelector('.modal') || ls.get('sy_welcome')) return; ls.set('sy_welcome', 1);
    const m = modal(h('div', { class: 'stack center' }, h('h2', null, (lang() === 'hi' && W.title_hi) || W.title), h('p', { class: 'muted' }, (lang() === 'hi' && W.text_hi) || W.text),
      W.code ? h('button', { class: 'copy', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(W.code).catch(() => {}); toast(t('copied')); } }, W.code) : null, h('div', null, h('button', { class: 'btn', onclick: () => { m.close(); nav('/shop'); } }, t('shop')))));
  }, Math.max(3, W.delay_s || 12) * 1000);
}
export function exitIntent() {
  const E = BOOT.popups.exit_intent; if (!E || !E.enabled || ls.get('sy_exit') || !matchMedia('(hover:hover)').matches) return;
  const fn = e => { if (e.clientY > 8 || document.querySelector('.modal')) return; document.removeEventListener('mouseout', fn); ls.set('sy_exit', 1); const m = modal(h('div', { class: 'stack center' }, h('h2', null, (lang() === 'hi' && E.text_hi) || E.text), E.code ? h('button', { class: 'copy', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(E.code).catch(() => {}); toast(t('copied')); } }, E.code) : null, h('button', { class: 'btn', onclick: () => m.close() }, t('continue')))); };
  setTimeout(() => document.addEventListener('mouseout', fn), 15000);
}
export function intro() {
  const I = BOOT.intro; if (!I || !I.enabled || sessionStorage.getItem('sy_intro') || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  try { sessionStorage.setItem('sy_intro', '1'); } catch { /* */ }
  const el = h('div', { class: 'intro', 'aria-hidden': 'true' }, logo(true)); document.body.append(el);
  setTimeout(() => el.classList.add('out'), Math.max(600, I.duration_ms || 1400)); setTimeout(() => el.remove(), (I.duration_ms || 1400) + 900);
}

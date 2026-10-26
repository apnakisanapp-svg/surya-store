import { BOOT, h, $, $$, clear, icon, t, tr, lang, setLang, bus, api, money, cart, wish, me, ls, toast, drawer, modal, nav, debounce, sid } from './core.js';

/* ---------- logo ---------- */
export function logo(dark) {
  const T = BOOT.theme || {}, src = dark && T.logo_dark ? T.logo_dark : T.logo;
  if (src) return h('a', { class: 'logo', href: '/', 'aria-label': BOOT.brand.name }, h('img', { src, alt: BOOT.brand.name, height: 30 }), T.show_logo_text ? h('span', null, BOOT.brand.name) : null);
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 32 32'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<circle cx="16" cy="16" r="6" fill="currentColor"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M16 2v4M16 26v4M2 16h4M26 16h4M6.1 6.1l2.8 2.8M23.1 23.1l2.8 2.8M25.9 6.1l-2.8 2.8M8.9 23.1l-2.8 2.8"/></g>';
  return h('a', { class: 'logo', href: '/', 'aria-label': BOOT.brand.name }, s, h('span', null, BOOT.brand.name));
}

/* ---------- product card ---------- */
export function stars(avg) { const n = Math.round(avg); return h('span', { class: 'stars', 'aria-label': `${avg} out of 5` }, [1, 2, 3, 4, 5].map(i => h('i', { class: i <= n ? 'on' : '' }, '★'))); }
export function productCard(p, { priority = false } = {}) {
  const img = p.images[0], out = p.stock_state === 'out';
  const heart = h('button', { class: 'heart' + (wish.has(p.id) ? ' on' : ''), 'aria-label': 'Wishlist', onclick: async e => { e.preventDefault(); e.stopPropagation(); const on = await wish.toggle(p.id); heart.classList.toggle('on', on); } }, icon('heart'));
  const a = h('a', { class: 'pc' + (out ? ' soldout' : ''), href: `/p/${p.slug}`, 'aria-label': tr(p, 'name') },
    h('div', { class: 'pc-img' },
      img ? h('img', { src: img.card, alt: (lang() === 'hi' && img.alt_hi) || img.alt || tr(p, 'name'), width: 720, height: 720, loading: priority ? 'eager' : 'lazy', decoding: 'async' }) : null,
      p.badge ? h('span', { class: 'badge' }, p.badge) : (p.discount_pct >= 10 ? h('span', { class: 'badge' }, `${p.discount_pct}% ${t('off')}`) : null),
      out ? h('span', { class: 'so-tag' }, t('oos')) : null, BOOT.store.wishlist ? heart : null),
    h('div', { class: 'pc-body' },
      h('div', { class: 'pc-name' }, tr(p, 'name')),
      p.rating.count ? h('div', { class: 'row', style: { gap: '6px' } }, stars(p.rating.avg), h('span', { class: 'muted small' }, `(${p.rating.count})`)) : null,
      h('div', { class: 'price' }, h('b', null, money(p.price)), p.mrp ? h('s', null, money(p.mrp)) : null, p.mrp ? h('em', null, `${p.discount_pct}% ${t('off')}`) : null),
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
  const langBtn = h('button', { class: 'ibtn lang', 'aria-label': 'Language', onclick: () => { setLang(lang() === 'hi' ? 'en' : 'hi'); location.reload(); } }, t('lang'));
  const burger = h('button', { class: 'ibtn burger', 'aria-label': 'Menu', onclick: () => { const d = drawer(BOOT.brand.name, h('nav', { class: 'stack' }, (BOOT.menu.header || []).map(it => h('a', { href: it.url, style: { display: 'block', padding: '10px 0', fontSize: '1.15rem', textDecoration: 'none' }, onclick: () => d.close() }, tr(it, 'label'))), h('hr', { style: { border: 0, borderTop: '1px solid var(--line)' } }), h('a', { href: '/track', style: { display: 'block', padding: '10px 0', textDecoration: 'none' }, onclick: () => d.close() }, t('track')), h('a', { href: '/account', style: { display: 'block', padding: '10px 0', textDecoration: 'none' }, onclick: () => d.close() }, t('account'))), null, { side: 'left' }); } }, icon('menu'));
  const hdr = h('header', { class: 'hdr glass' }, h('div', { class: 'wrap hdr-in' }, burger, logo(), nv, h('div', { class: 'grow' }),
    h('button', { class: 'ibtn', 'aria-label': t('search'), onclick: openSearch }, icon('search')),
    BOOT.store.language_toggle ? langBtn : null,
    h('a', { class: 'ibtn', href: '/account', 'aria-label': t('account') }, icon('user')),
    BOOT.store.wishlist ? h('a', { class: 'ibtn', href: '/account#wishlist', 'aria-label': t('wishlist') }, icon('heart')) : null,
    h('button', { class: 'ibtn', 'aria-label': t('cart'), onclick: openCart }, icon('bag'), count)));
  const prog = h('div', { class: 'pbar', 'aria-hidden': 'true' });
  addEventListener('scroll', () => { hdr.classList.toggle('scrolled', scrollY > 8); const m = document.documentElement.scrollHeight - innerHeight; if (BOOT.ui.scroll_progress) prog.style.width = m > 0 ? (scrollY / m * 100) + '%' : '0'; }, { passive: true });
  bus.on('route', p => { $$('.nav a', hdr).forEach(a => a.classList.toggle('on', a.dataset.url.split('?')[0] === p && p !== '/')); });
  root.prepend(...[annc, hdr, prog].filter(Boolean));

  // footer
  const B = BOOT.brand, pol = BOOT.policies.filter(p => p.in_footer);
  const cols = (BOOT.menu.footer || []).map(c => h('div', null, h('h4', null, tr(c, 'title')), h('ul', null, c.links.map(l => h('li', null, h('a', { href: l.url }, tr(l, 'label')))))));
  const ftr = h('footer', { class: 'ftr' }, h('div', { class: 'wrap' }, h('div', { class: 'ftr-g' },
    h('div', null, logo(), h('p', { class: 'muted', style: { marginTop: '12px', maxWidth: '28em' } }, B.tagline), h('p', { class: 'small', style: { marginTop: '12px' } }, [B.phone && h('a', { href: 'tel:' + B.phone }, B.phone), B.phone && B.email ? ' · ' : null, B.email && h('a', { href: 'mailto:' + B.email }, B.email)]), B.support_hours ? h('p', { class: 'small muted' }, B.support_hours) : null,
      newsletterBox()),
    ...cols,
    h('div', null, h('h4', null, 'Policies'), h('ul', null, pol.map(p => h('li', null, h('a', { href: `/policy/${p.slug}` }, tr(p, 'title')))), h('li', null, h('a', { href: '/grievance' }, t('grievance'))), h('li', null, h('a', { href: '#', onclick: e => { e.preventDefault(); ls.del('sy_cookie'); cookieBanner(true); } }, 'Cookie settings'))))),
    h('div', { class: 'ftr-b' }, h('span', null, `© ${new Date().getFullYear()} ${B.legal_name || B.name}${B.gstin ? ' · GSTIN ' + B.gstin : ''}`), h('span', null, [B.address, B.city].filter(Boolean).join(', ')))));
  root.append(ftr);
  // floating buttons
  const top = h('button', { class: 'btn alt hide', 'aria-label': 'Back to top', onclick: () => scrollTo({ top: 0, behavior: 'smooth' }) }, icon('up'));
  const wa = (B.whatsapp || B.phone) && BOOT.ui.whatsapp_button ? h('a', { class: 'btn', href: `https://wa.me/91${String(B.whatsapp || B.phone).replace(/\D/g, '').slice(-10)}`, target: '_blank', rel: 'noopener', 'aria-label': 'WhatsApp', style: { background: '#25a244', color: '#fff' } }, icon('wa')) : null;
  root.append(h('div', { class: 'fab' }, BOOT.ui.back_to_top ? top : null, wa));
  addEventListener('scroll', () => top.classList.toggle('hide', scrollY < 700), { passive: true });
  addEventListener('offline', () => { const o = h('div', { class: 'offline', id: 'offl' }, t('offline')); document.body.append(o); });
  addEventListener('online', () => $('#offl') && $('#offl').remove());
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
      for (const c of r.categories) list.append(h('a', { href: `/shop?category=${c.slug}`, onclick: close }, h('b', null, tr(c, 'name')), h('span', { class: 'muted small' }, 'Category')));
      for (const p of r.products) list.append(h('a', { href: `/p/${p.slug}`, onclick: close }, p.image ? h('img', { src: p.image, alt: '', width: 44, height: 44 }) : h('span', { style: { width: '44px' } }), h('span', { class: 'grow' }, tr(p, 'name')), h('b', null, money(p.price))));
      if (!r.products.length && !r.categories.length) list.append(h('p', { class: 'muted', style: { padding: '12px 4px' } }, t('no_results')));
      else list.append(h('a', { href: '/shop?q=' + encodeURIComponent(q), onclick: close }, h('span', { class: 'link' }, `${t('all')} → "${q}"`)));
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
  const d = drawer(`${t('cart')}`, body, foot); drawerOpen = d;
  const orig = d.close; d.close = () => { drawerOpen = null; bus.off('cart', refresh); orig(); };
  async function refresh() {
    clear(body); clear(foot);
    if (!cart.items.length) { body.append(h('div', { class: 'empty' }, icon('bag'), h('p', null, t('empty_cart')), h('p', { style: { marginTop: '16px' } }, h('a', { class: 'btn', href: '/shop', onclick: () => d.close() }, t('continue'))))); return; }
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

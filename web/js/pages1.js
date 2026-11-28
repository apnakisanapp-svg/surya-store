import { BOOT, h, $, $$, clear, icon, t, tr, lang, bus, api, money, cart, wish, me, ls, toast, modal, nav, route, setTitle, reveal, recentlyViewed, sid, debounce, pushOverlay, releaseOverlay, buyItem, wasBack, pagesSeen, glassSelect, guardWatch } from './core.js';
import { pctBadge, fillPrice, tweenNum, productCard, skeletons, stars, addToCart, openCart } from './ui.js';

const sec = (title, link, body, cls = '') => h('section', { class: 'section rev ' + cls }, h('div', { class: 'wrap' }, h('div', { class: 'sec-head' }, h('h2', null, title), link), body));

/* ================= HOME ================= */
route(/^\/$/, async view => {
  setTitle('');
  view.append(skeletons(4));
  const data = await api('/home'); clear(view);
  if (data.banners.length) view.append(hero(data.banners)); else view.append(fallbackHero());
  for (const s of data.sections) {
    const title = (lang() === 'hi' && s.title_hi) || s.title;
    if (s.type === 'categories' && BOOT.categories.length) view.append(sec(title, null, h('div', { class: 'cats' }, BOOT.categories.filter(c => !c.parent_id).map(c => h('a', { class: 'cat', href: `/shop?category=${c.slug}` }, tr(c, 'name'))))));
    else if (s.type === 'products' && s.items.length) view.append(sec(title, h('a', { class: 'link', href: s.source === 'new' ? '/shop?sort=new' : s.source === 'offers' ? '/shop?offers=1' : '/shop' }, t('all') + ' →'), h('div', { class: 'pgrid' }, s.items.map((p, i) => productCard(p, { priority: i < 2 })))));
    else if (s.type === 'trust') view.append(sec('', null, h('div', { class: 'trust' }, (BOOT.home.trust || []).map(x => h('div', null, icon(x.icon || 'shield'), h('h3', null, tr(x, 'title')), h('p', { class: 'muted' }, tr(x, 'text'))))), 'trustsec'));
    else if (s.type === 'testimonials' && s.items.length) view.append(sec(title, null, h('div', { class: 'tgrid' }, s.items.map(x => h('div', { class: 'card' }, stars(x.rating), h('p', null, `“${(lang() === 'hi' && x.text_hi) || x.text}”`), h('b', { class: 'small' }, x.name), x.city ? h('span', { class: 'muted small' }, ' · ' + x.city) : null)))));
    else if (s.type === 'faq' && s.items.length) view.append(sec(title, h('a', { class: 'link', href: '/faq' }, t('all') + ' →'), faqList(s.items)));
    else if (s.type === 'newsletter') view.append(sec('', null, newsletterBand(title)));
  }
  const eco = BOOT.home.eco; if (eco && eco.enabled && eco.items && eco.items.length) view.append(sec(tr(eco, 'title'), null, h('div', { class: 'trust' }, eco.items.map(x => h('div', null, icon('leaf'), h('h3', null, tr(x, 'title')), h('p', { class: 'muted' }, tr(x, 'text')))))));
  const rv = recentlyViewed(); if (BOOT.store.recently_viewed && rv.length) { try { const r = await api('/products?ids=' + rv.join(',') + '&limit=12'); if (r.items.length) view.append(sec(t('recent'), null, h('div', { class: 'hscroll' }, r.items.map(p => productCard(p))))); } catch { /* */ } }
});
function fallbackHero() {
  const B = BOOT.brand;
  return h('section', { class: 'hero' }, h('div', { class: 'glow' }), h('div', { class: 'wrap' }, h('div', { class: 'slide', style: { gridTemplateColumns: '1fr' } }, h('div', null, h('h1', null, B.name), B.tagline ? h('p', { class: 'sub' }, B.tagline) : null, h('div', { class: 'ctas row' }, h('a', { class: 'btn', href: '/shop' }, t('shop')), h('a', { class: 'btn ghost', href: '/shop?offers=1' }, t('offers')))))));
}
function hero(banners) {
  let i = 0, timer; const n = banners.length;
  const track = h('div', { class: 'hero-track' }, banners.map(b => {
    const img = b.image || (b.product && b.product.images[0] && b.product.images[0].gal);
    const title = (lang() === 'hi' && b.title_hi) || b.title || BOOT.brand.name, subt = (lang() === 'hi' && b.subtitle_hi) || b.subtitle;
    if (b.image) { // uploaded banner: show the WHOLE picture, with a soft blurred copy filling the rest
      return h('div', { class: 'bslide' }, h('div', { class: 'bn-bg', style: { backgroundImage: `url("${b.image}")` } }),
        h('img', { class: 'bn-img', src: b.image, alt: b.title || '', loading: 'eager', decoding: 'async', onerror: e => { e.target.remove(); } }),
        (b.title || subt || b.cta_url || b.product) ? h('div', { class: 'bn-txt wrap' }, h('div', { class: 'bn-card' }, b.title ? h('h1', null, title) : null, subt ? h('p', { class: 'sub' }, subt) : null,
          b.cta_url || b.product ? h('div', { class: 'ctas row' }, h('a', { class: 'btn', href: b.cta_url || `/p/${b.product.slug}` }, (lang() === 'hi' && b.cta_text_hi) || b.cta_text || t('shop'))) : null)) : null);
    }
    return h('div', { class: 'slide wrap' }, h('div', { style: { minWidth: 0 } }, h('h1', null, (lang() === 'hi' && b.title_hi) || b.title || BOOT.brand.name), (b.subtitle || b.subtitle_hi) ? h('p', { class: 'sub' }, (lang() === 'hi' && b.subtitle_hi) || b.subtitle) : null,
      b.cta_url || b.product ? h('div', { class: 'ctas row' }, h('a', { class: 'btn', href: b.cta_url || `/p/${b.product.slug}` }, (lang() === 'hi' && b.cta_text_hi) || b.cta_text || t('shop'))) : null),
      img ? h('div', { class: 'slide-img' }, h('img', { src: img, alt: b.title || '', loading: 'eager', decoding: 'async', onerror: e => { const w = e.target.closest('.slide-img'); if (w) w.remove(); } })) : null);
  }));
  const dots = h('div', { class: 'dots' }, banners.map((_, k) => h('button', { 'aria-label': 'Slide ' + (k + 1), onclick: () => go(k) })));
  const go = k => { i = (k + n) % n; track.style.transform = `translateX(-${i * 100}%)`; $$('button', dots).forEach((d, j) => d.classList.toggle('on', j === i)); play(); };
  const play = () => { clearInterval(timer); if (n > 1 && !matchMedia('(prefers-reduced-motion:reduce)').matches) timer = setInterval(() => { if (document.hidden) return; go(i + 1); }, 6500); };
  const el = h('section', { class: 'hero' + (banners[0].theme === 'dark' ? ' dark' : ''), 'aria-roledescription': 'carousel' }, h('div', { class: 'glow' }), h('div', { style: { overflow: 'hidden' } }, track), n > 1 ? dots : null);
  let sx = null; track.addEventListener('pointerdown', e => { sx = e.clientX; }); track.addEventListener('pointerup', e => { if (sx != null && Math.abs(e.clientX - sx) > 40) go(i + (e.clientX < sx ? 1 : -1)); sx = null; });
  el.addEventListener('mouseenter', () => clearInterval(timer)); el.addEventListener('mouseleave', play); go(0);
  const obs = new MutationObserver(() => { if (!el.isConnected) { clearInterval(timer); obs.disconnect(); } }); obs.observe(document.body, { childList: true, subtree: true });
  return el;
}
export function faqList(items) { return h('div', { class: 'faq' }, items.map(f => h('details', null, h('summary', null, (lang() === 'hi' && f.q_hi) || f.q), h('p', null, (lang() === 'hi' && f.a_hi) || f.a)))); }
function newsletterBand(title) {
  const inp = h('input', { class: 'inp', type: 'email', placeholder: 'Email', 'aria-label': 'Email', required: true });
  return h('div', { class: 'band' }, h('h2', null, title || 'Get offers first'), h('form', { class: 'row', style: { justifyContent: 'center', marginTop: '18px', flexWrap: 'nowrap', maxWidth: '460px', margin: '18px auto 0' }, onsubmit: async e => { e.preventDefault(); try { toast((await api('/newsletter', { method: 'POST', body: { email: inp.value } })).message); inp.value = ''; } catch (x) { toast(x.message, { err: true }); } } }, h('div', { class: 'grow' }, inp), h('button', { class: 'btn alt' }, t('send'))));
}

/* ================= SHOP ================= */
route(/^\/shop$/, async (view, m, q) => {
  const st = { q: q.get('q') || '', category: q.get('category') || '', sort: q.get('sort') || (q.get('q') ? 'relevance' : 'trending'), min: q.get('min') || '', max: q.get('max') || '', in_stock: q.get('in_stock') === '1', offers: q.get('offers') === '1', page: 1 };
  const cat = BOOT.categories.find(c => c.slug === st.category);
  setTitle(st.q ? `"${st.q}"` : cat ? tr(cat, 'name') : t('shop'));
  const grid = h('div'), more = h('div', { class: 'center', style: { margin: '28px 0' } }), count = h('span', { class: 'muted small' });
  const push = () => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(st)) if (v && k !== 'page' && !(k === 'sort' && v === (st.q ? 'relevance' : 'trending'))) p.set(k, v === true ? '1' : v); history.replaceState({}, '', '/shop' + (p.toString() ? '?' + p : '')); };
  async function load(reset) {
    if (reset) { st.page = 1; clear(grid).append(skeletons(8)); clear(more); push(); }
    const p = new URLSearchParams({ page: st.page, limit: 12 }); for (const [k, v] of Object.entries(st)) if (v && !['page'].includes(k)) p.set(k, v === true ? '1' : v);
    let r; try { r = await api('/products?' + p); } catch (e) { clear(grid).append(h('p', { class: 'muted' }, e.message)); return; }
    if (reset) clear(grid);
    if (r.fallback && reset && st.q) grid.append(h('div', { class: 'fb-note' }, icon('search'), h('div', null, h('b', null, `${t('fb_title')} “${st.q}”`), h('p', { class: 'muted small' }, t('fb_text')))));
    let g = $('.pgrid', grid); if (!g) { g = h('div', { class: 'pgrid' }); grid.append(g); }
    r.items.forEach(x => g.append(productCard(x)));
    count.textContent = r.fallback ? '' : `${r.total} ${r.total === 1 ? 'product' : 'products'}`;
    if (!r.items.length && reset) grid.append(h('div', { class: 'empty' }, icon('search'), h('h3', null, t('no_results')), h('p', { class: 'muted' }, t('try_other')), h('p', { style: { marginTop: '14px' } }, h('button', { class: 'btn', onclick: () => { Object.assign(st, { q: '', category: '', min: '', max: '', in_stock: false, offers: false }); sync(); load(true); } }, 'Clear filters'))));
    clear(more); if (st.page < r.pages) more.append(h('button', { class: 'btn ghost', onclick: () => { st.page++; pagesSeen(st.page); load(false); } }, t('load_more')));
  }
  const sortSel = glassSelect({ label: t('sort'), value: st.sort, options: [['trending', t('trending')], ['new', t('newest')], ['price_asc', t('price_lh')], ['price_desc', t('price_hl')], ['discount', t('discount')], ...(st.q ? [['relevance', 'Best match']] : [])], onchange: v => { st.sort = v; load(true); } });
  const minI = h('input', { class: 'inp', type: 'number', inputmode: 'numeric', min: 0, placeholder: 'Min ₹', value: st.min, 'aria-label': 'Min price', onchange: e => { st.min = e.target.value; load(true); } });
  const maxI = h('input', { class: 'inp', type: 'number', inputmode: 'numeric', min: 0, placeholder: 'Max ₹', value: st.max, 'aria-label': 'Max price', onchange: e => { st.max = e.target.value; load(true); } });
  const stock = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.in_stock, onchange: e => { st.in_stock = e.target.checked; load(true); } }), t('instock'));
  const offers = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.offers, onchange: e => { st.offers = e.target.checked; load(true); } }), t('offers'));
  const chips = h('div', { class: 'chips' });
  const sync = () => { clear(chips).append(h('button', { class: 'chip' + (!st.category ? ' on' : ''), onclick: () => { st.category = ''; sync(); load(true); } }, t('all')), ...BOOT.categories.filter(c => !c.parent_id).map(c => h('button', { class: 'chip' + (st.category === c.slug ? ' on' : ''), onclick: () => { st.category = c.slug; sync(); load(true); } }, tr(c, 'name')))); minI.value = st.min; maxI.value = st.max; };
  sync();
  view.append(h('div', { class: 'wrap', style: { paddingTop: '24px', paddingBottom: '20px' } }, st.q ? h('a', { class: 'srch-pill', href: '/search?q=' + encodeURIComponent(st.q), 'aria-label': 'Change search' }, icon('search'), h('span', null, st.q), h('span', { class: 'srch-pill-x' }, icon('x'))) : null, h('div', { class: 'row between' }, h('h1', { class: 'h1', style: { fontSize: 'clamp(1.8rem,5vw,3rem)' } }, st.q ? `“${st.q}”` : cat ? tr(cat, 'name') : t('shop')), count),
    h('div', { class: 'shop-top' }, BOOT.filters.category ? chips : null),
    h('div', { class: 'filters' }, h('div', null, sortSel), BOOT.filters.price ? h('div', { class: 'row', style: { flexWrap: 'nowrap', gap: '8px' } }, minI, maxI) : null, BOOT.filters.stock ? h('div', { class: 'row' }, stock) : null, h('div', { class: 'row' }, offers)), grid, more));
  const back = wasBack(), want = back ? pagesSeen() : 1;
  if (!back) pagesSeen(1);
  await load(true);
  for (let i = 2; i <= want; i++) { st.page = i; await load(false); } // coming back: bring the earlier 'Load more' pages back too, so the scroll spot exists
});


/* ================= SEARCH PAGE (full page, like a shopping app) ================= */
const recents = {
  get() { const l = ls.get('sy_recent', []); return Array.isArray(l) ? l.filter(x => typeof x === 'string').slice(0, 8) : []; },
  add(q) { ls.set('sy_recent', [q, ...this.get().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8)); },
  del(q) { ls.set('sy_recent', this.get().filter(x => x !== q)); },
  clear() { ls.del('sy_recent'); },
};
route(/^\/search$/, async (view, m, params) => {
  setTitle(t('search'));
  const inp = h('input', { class: 'srch-in', type: 'search', value: params.get('q') || '', placeholder: t('search'), 'aria-label': t('search'), autocomplete: 'off', enterkeyhint: 'search' });
  const clr = h('button', { type: 'button', class: 'srch-x hide', 'aria-label': 'Clear', onclick: () => { inp.value = ''; inp.focus(); onType(); } }, icon('x'));
  const body = h('div', { class: 'srch-body wrap' });
  const go = q => { q = (q || '').trim(); if (!q) return; recents.add(q); nav('/shop?q=' + encodeURIComponent(q)); };
  const back = h('button', { type: 'button', class: 'srch-back', 'aria-label': t('close'), onclick: () => (history.length > 1 ? history.back() : nav('/')) }, icon('chevl'));
  const bar = h('form', { class: 'srch-bar' }, back, h('div', { class: 'srch-field' }, icon('search'), inp, clr), h('button', { class: 'srch-go', type: 'submit' }, 'Search'));
  bar.addEventListener('submit', e => { e.preventDefault(); go(inp.value); });
  view.append(h('div', { class: 'srch' }, bar, body));
  function idle() {
    clear(body);
    const rec = recents.get(), popular = (BOOT.search && BOOT.search.popular) || [];
    if (rec.length) body.append(h('div', { class: 'srch-sec' }, h('div', { class: 'row between' }, h('b', null, 'Recent searches'), h('button', { class: 'link small', onclick: () => { recents.clear(); idle(); } }, 'Clear all')),
      h('div', { class: 'srch-list' }, rec.map(q => h('div', { class: 'srch-row' }, h('button', { class: 'srch-rt', onclick: () => go(q) }, icon('clock'), h('span', null, q)), h('button', { class: 'srch-rm', 'aria-label': 'Remove', onclick: () => { recents.del(q); idle(); } }, icon('x')))))));
    if (popular.length) body.append(h('div', { class: 'srch-sec' }, h('b', null, 'Popular searches'), h('div', { class: 'row', style: { marginTop: '10px' } }, popular.map(q => h('button', { class: 'chip', onclick: () => go(q) }, q)))));
    if (!rec.length && !popular.length) body.append(h('p', { class: 'muted center', style: { marginTop: '40px' } }, 'Type what you are looking for.'));
  }
  let seq = 0;
  const run = debounce(async () => {
    const q = inp.value.trim(), my = ++seq; if (q.length < 2) return;
    try {
      const r = await api('/suggest?q=' + encodeURIComponent(q)); if (my !== seq) return; clear(body);
      const list = h('div', { class: 'srch-sug' });
      if (r.fallback) body.append(h('p', { class: 'fb-sug muted small' }, `${t('fb_title')} “${q}” · ${t('fb_text')}`));
      for (const c of r.categories) list.append(h('a', { href: `/shop?category=${c.slug}` }, h('b', null, tr(c, 'name')), h('span', { class: 'muted small' }, 'Category')));
      for (const p of r.products) list.append(h('a', { href: `/p/${p.slug}`, onclick: () => recents.add(q) }, p.image ? h('img', { src: p.image, alt: '', width: 48, height: 48 }) : h('span', { style: { width: '48px' } }), h('span', { class: 'grow' }, tr(p, 'name')), h('b', null, money(p.price))));
      list.append(h('a', { href: '/shop?q=' + encodeURIComponent(q), onclick: () => recents.add(q) }, h('span', { class: 'link' }, `${t('all')} → "${q}"`)));
      body.append(list);
      if (!r.products.length && !r.categories.length) { clear(body).append(h('div', { class: 'center muted', style: { marginTop: '40px' } }, h('p', null, `Nothing found for “${q}”.`), h('p', { class: 'small' }, 'Check the spelling or try a shorter word.')), ...[]); }
    } catch { /* ignore */ }
  }, 200);
  function onType() { clr.classList.toggle('hide', !inp.value); if (inp.value.trim().length < 2) { seq++; idle(); } else run(); }
  inp.addEventListener('input', onType); onType(); if (!inp.value) idle();
  setTimeout(() => { try { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch { /* */ } }, 60);
});

/* ================= PRODUCT ================= */
route(/^\/p\/([^/]+)$/, async (view, m) => {
  let data;
  try { data = await api('/products/' + encodeURIComponent(m[1])); } catch (e) { if (e.status === 404) { view.append(h('div', { class: 'wrap empty' }, icon('search'), h('h2', null, 'This product is not available'), h('p', { style: { marginTop: '16px' } }, h('a', { class: 'btn', href: '/shop' }, t('continue'))))); setTitle('Not found'); return; } throw e; }
  const p = data.product; setTitle(tr(p, 'name'));
  recentlyViewed(p.id); api('/events', { method: 'POST', body: { type: 'view', product_id: p.id, sid } }).catch(() => {});
  const S = { vid: null, qty: 1, img: 0, mode: 'photo' };
  const ins = p.variants.filter(v => v.active);
  if (ins.length) S.vid = (ins.find(v => v.in_stock) || ins[0]).id;
  { const qv = Number(new URLSearchParams(location.search).get('v')); if (qv && ins.some(v => v.id === qv)) S.vid = qv; }
  const curV = () => ins.find(v => v.id === S.vid) || null;
  const info = h('div', { class: 'pd-info stack-lg' }), galBox = h('div');

  /* gallery */
  function curImgs() { const c = (curV() || {}).colour_name; const own = c ? p.images.filter(i => i.colour === c) : []; const common = p.images.filter(i => !i.colour); return own.length ? [...own, ...common] : (common.length ? common : p.images); }
  function gallery() {
    clear(galBox);
    const imgs = curImgs();
    if (S.mode === 'spin' && p.spin.length) { galBox.append(spinViewer(p.spin), modeBar()); return; }
    if (S.mode === '3d' && p.model_glb) { galBox.append(modelViewer(p.model_glb, p.name), modeBar()); return; }
    const main = h('div', { class: 'gal-main', role: 'group', 'aria-label': 'Photos' });
    const show = i => { S.img = (i + imgs.length) % imgs.length; const im = imgs[S.img]; clear(main); if (im) main.append(h('img', { src: im.gal, alt: (lang() === 'hi' && im.alt_hi) || im.alt || tr(p, 'name'), width: im.w, height: im.h, decoding: 'async' })); else main.append(h('div', { class: 'center muted', style: { paddingTop: '45%' } }, 'No photo')); if (imgs.length > 1) main.append(h('button', { class: 'ibtn glass gal-nav l', 'aria-label': 'Previous', onclick: e => { e.stopPropagation(); show(S.img - 1); } }, icon('chevl')), h('button', { class: 'ibtn glass gal-nav r', 'aria-label': 'Next', onclick: e => { e.stopPropagation(); show(S.img + 1); } }, icon('chev'))); $$('.thumbs button', galBox).forEach((b, j) => b.classList.toggle('on', j === S.img)); };
    let sx = null; main.addEventListener('pointerdown', e => { sx = e.target.closest('.gal-nav') ? null : e.clientX; }); main.addEventListener('pointerup', e => { if (sx == null || e.target.closest('.gal-nav')) { sx = null; return; } const d = e.clientX - sx; sx = null; if (Math.abs(d) > 45 && imgs.length > 1) show(S.img + (d < 0 ? 1 : -1)); else if (Math.abs(d) < 6 && imgs[S.img]) lightbox(imgs, S.img); });
    galBox.append(main);
    if (imgs.length > 1) galBox.append(h('div', { class: 'thumbs' }, imgs.map((im, j) => h('button', { 'aria-label': 'Photo ' + (j + 1), class: j === S.img ? 'on' : '', onclick: () => show(j) }, h('img', { src: im.thumb, alt: '', width: 68, height: 68, loading: 'lazy' })))));
    show(S.img); galBox.append(modeBar());
  }
  const modeBar = () => (p.spin.length >= 4 || p.model_glb) ? h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'chip' + (S.mode === 'photo' ? ' on' : ''), onclick: () => { S.mode = 'photo'; gallery(); } }, 'Photos'), p.spin.length >= 4 ? h('button', { class: 'chip' + (S.mode === 'spin' ? ' on' : ''), onclick: () => { S.mode = 'spin'; gallery(); } }, '360°') : null, p.model_glb ? h('button', { class: 'chip' + (S.mode === '3d' ? ' on' : ''), onclick: () => { S.mode = '3d'; gallery(); } }, '3D') : null) : null;

  /* info */
  const priceEl = h('div', { class: 'price' }), stockEl = h('div'), qtyEl = h('span'), atcRow = h('div', { class: 'stack' }), pinOut = h('div', { class: 'small', style: { marginTop: '8px' } });
  const cur = () => { const v = curV(); return { price: v ? v.price : p.price, mrp: v ? v.mrp : p.mrp, in_stock: v ? v.in_stock : p.stock_state !== 'out', pre: v ? !!v.pre : p.stock_state === 'preorder', left: v ? v.stock_left : p.stock_left }; };
  function paint() {
    const c = cur(), pct = c.mrp ? Math.round((1 - c.price / c.mrp) * 100) : 0;
    const pk = c.price + '|' + c.mrp; if (priceEl.dataset.k !== pk) { priceEl.dataset.k = pk; clear(priceEl); priceEl.classList.remove('pa-init', 'pa-strike'); fillPrice(priceEl, { price: c.price, mrp: c.mrp, pct, mrpText: `${t('mrp')} ${money(c.mrp)}` }); }
    clear(stockEl).append(c.in_stock ? (c.left && c.left <= 5 ? h('span', { class: 'small', style: { color: 'var(--warn)', fontWeight: 600 } }, t('low', { n: c.left })) : h('span', { class: 'small', style: { color: 'var(--ok)', fontWeight: 600 } }, c.pre ? 'Pre-order' : 'In stock')) : h('span', { class: 'small', style: { color: 'var(--err)', fontWeight: 600 } }, t('oos')));
    qtyEl.textContent = S.qty;
    const colNow = (curV() || {}).colour_name || '';
    if (S.lastCol !== colNow) { S.lastCol = colNow; S.img = 0; if (S.mode === 'photo') gallery(); }
    else { const v = curV(), gi = curImgs(); if (v && v.image_id) { const k = gi.findIndex(i => i.id === v.image_id); if (k >= 0 && k !== S.img && S.mode === 'photo') { S.img = k; gallery(); } } }
    clear(atcRow);
    if (!c.in_stock) atcRow.append(notifyForm());
    paintBar(c);
  }
  function notifyForm() {
    const inp = h('input', { class: 'inp', placeholder: 'Email or mobile number', 'aria-label': 'Email or mobile number', value: me.customer ? me.customer.email : '' });
    return h('div', { class: 'box-note' }, icon('info'), h('div', { class: 'grow stack' }, h('b', null, t('oos')), h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('div', { class: 'grow' }, inp), h('button', { class: 'btn sm', onclick: async () => { try { toast((await api('/notify', { method: 'POST', body: { product_id: p.id, variant_id: S.vid, contact: inp.value } })).message); } catch (e) { toast(e.message, { err: true }); } } }, t('notify')))));
  }
  const hasSC = ins.some(v => v.size || v.colour_name);
  const varEl = ins.length ? h('div', { class: 'vopts' }) : null;
  const uniq = k => [...new Set(ins.map(v => v[k]).filter(Boolean))];
  function sizeGuide() {
    const rows = String(p.size_guide || '').split(/\r?\n/).map(l => l.split('|').map(c => c.trim())).filter(r => r.some(Boolean));
    if (!rows.length) return;
    const tb = h('table', { class: 'vg-tbl' }, h('thead', null, h('tr', null, rows[0].map(c => h('th', null, c)))), h('tbody', null, rows.slice(1).map(r => h('tr', null, r.map(c => h('td', null, c))))));
    modal(h('div', { class: 'stack' }, h('h3', null, 'Size guide'), h('div', { class: 'vg-wrap' }, tb), h('p', { class: 'small muted' }, 'Measurements are of the garment, in the unit shown. Pick the size by your own measurements.')));
  }
  let syncSC = () => {};
  function drawOpts() {
    if (!varEl) return; clear(varEl);
    if (!hasSC) {
      varEl.append(h('div', { class: 'vo-lbl' }, 'Choose option'), h('div', { class: 'vo-row' }, ins.map(v => h('button', { type: 'button', class: 'vopt' + (v.id === S.vid ? ' on' : '') + (!v.in_stock ? ' off' : ''), onclick: () => { S.vid = v.id; drawOpts(); paint(); } }, v.color ? h('i', { class: 'vsw', style: { background: v.color } }) : null, h('span', null, (lang() === 'hi' && v.name_hi) || v.name)))));
      return;
    }
    const sizes = uniq('size'), cols = uniq('colour_name');
    const find = (size, col) => ins.find(v => (v.size || null) === (size || null) && (v.colour_name || null) === (col || null));
    const pick = (size, col, changed) => {
      let v = find(size, col);
      if (!v) { const pool = ins.filter(x => changed === 'size' ? x.size === size : x.colour_name === col); v = pool.find(x => x.in_stock) || pool[0]; }
      if (v) { S.vid = v.id; syncSC(true); paint(); }
    };
    const colEls = {}, szEls = {};
    let colRow = null, ring = null, szRow = null, pill = null, colLbl = null, szLbl = null, avail = null;
    if (cols.length) {
      ring = h('i', { class: 'vc-ring' });
      colLbl = h('span', null, 'Colour: ', h('b', null, ''));
      colRow = h('div', { class: 'vc-row' }, ring, cols.map(c => {
        const first = ins.find(v => v.colour_name === c && v.image_id) || ins.find(v => v.colour_name === c), im = p.images.find(x => x.colour === c) || (first && first.image_id ? p.images.find(x => x.id === first.image_id) : null);
        const sw = (ins.find(v => v.colour_name === c && v.color) || {}).color;
        const el = h('button', { type: 'button', class: 'vcard', 'aria-label': c, onclick: () => pick(cur2().size, c, 'col') },
          h('span', { class: 'vc-img' }, im ? h('img', { src: im.thumb, alt: '', loading: 'lazy', draggable: 'false' }) : h('i', { style: { background: sw || '#d9dce1' } })),
          h('span', { class: 'vc-name' }, c));
        colEls[c] = el; return el;
      }));
    }
    if (sizes.length) {
      pill = h('i', { class: 'vs-pill' });
      szLbl = h('span', null, 'Size: ', h('b', null, ''));
      szRow = h('div', { class: 'vs-row' }, pill, sizes.map(z => {
        const el = h('button', { type: 'button', class: 'vsz', onclick: () => pick(z, cur2().colour_name, 'size') }, h('b', null, z), h('small', { class: 'vs-p' }), h('small', { class: 'vs-l' }));
        szEls[z] = el; return el;
      }));
      avail = h('div', { class: 'vo-avail' });
    }
    const cur2 = () => curV() || {};
    const place = (el, box, mark, anim) => {
      if (!el || !mark) return; const x = el.offsetLeft, y = el.offsetTop;
      if (!anim) mark.style.transition = 'none';
      mark.style.width = el.offsetWidth + 'px'; mark.style.height = el.offsetHeight + 'px'; mark.style.transform = `translate(${x}px,${y}px)`;
      if (!anim) { void mark.offsetWidth; mark.style.transition = ''; }
      mark.classList.add('ready');
    };
    syncSC = anim => {
      const cv = cur2(), cc = cv.colour_name || null, cs = cv.size || null;
      if (colRow) { cols.forEach(c => { const v = find(cs, c); colEls[c].classList.toggle('on', c === cc); colEls[c].classList.toggle('off', !!v && !v.in_stock); colEls[c].classList.toggle('na', !v); }); colLbl.lastChild.textContent = cc || ''; place(colEls[cc], colRow, ring, anim); }
      if (szRow) {
        sizes.forEach(z => { const v = find(z, cc), el = szEls[z]; el.classList.toggle('on', z === cs); el.classList.toggle('off', !!v && !v.in_stock); el.classList.toggle('na', !v); el.disabled = false;
          const pr = new Set(ins.filter(x => x.size).map(x => x.price)).size > 1; const pe = $('.vs-p', el), le = $('.vs-l', el);
          pe.textContent = v && pr ? money(v.price) : ''; le.textContent = v && v.in_stock && v.stock_left ? `${v.stock_left} left` : (v && !v.in_stock ? 'Sold out' : ''); });
        szLbl.lastChild.textContent = cs || ''; place(szEls[cs], szRow, pill, anim);
        const ok = sizes.filter(z => { const v = find(z, cc); return v && v.in_stock; });
        avail.textContent = ok.length ? `Available${cc ? ' in ' + cc : ''}: ${ok.join(', ')}` : `All sizes${cc ? ' in ' + cc : ''} are sold out right now.`;
        avail.classList.toggle('bad', !ok.length);
      }
    };
    if (colRow) varEl.append(h('div', { class: 'vo-lbl' }, colLbl), colRow);
    if (szRow) varEl.append(h('div', { class: 'vo-lbl vo-between' }, szLbl, p.size_guide ? h('button', { type: 'button', class: 'vo-link', onclick: sizeGuide }, 'Size guide') : null), szRow, avail);
    syncSC(false);
    requestAnimationFrame(() => syncSC(false));
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (varEl.isConnected) syncSC(false); else ro.disconnect(); }); ro.observe(varEl); }
    $$('img', varEl).forEach(im => im.addEventListener('load', () => syncSC(false)));
  }
  drawOpts();
  const pinInp = h('input', { class: 'inp', inputmode: 'numeric', maxlength: 6, placeholder: t('pincode'), 'aria-label': t('pincode'), value: ls.get('sy_pin', '') });
  const checkPin = async () => { const v = pinInp.value.trim(); if (!/^\d{6}$/.test(v)) { pinOut.textContent = 'Enter a valid 6-digit pincode.'; pinOut.style.color = 'var(--err)'; return; } ls.set('sy_pin', v); try { const r = await api(`/pincode/${v}?product=${p.id}`); pinOut.style.color = r.ok ? 'var(--ok)' : 'var(--err)'; pinOut.textContent = r.ok ? `${r.place ? 'Delivering to ' + r.place + '. ' : ''}${r.estimated ? 'Estimated delivery' : t('delivery_by')} ${r.eta.text}${r.cod ? ' · ' + t('cod') : ''}` : r.message; } catch (e) { pinOut.textContent = e.message; } };
  pinInp.addEventListener('keydown', e => { if (e.key === 'Enter') checkPin(); });
  const heartB = h('button', { class: 'ibtn' + (wish.has(p.id) ? ' on' : ''), style: { border: '1px solid var(--line)' }, 'aria-label': 'Wishlist', onclick: async () => { const on = await wish.toggle(p.id); heartB.style.color = on ? '#d6336c' : ''; toast(on ? 'Saved to wishlist' : 'Removed from wishlist'); } }, icon('heart'));
  if (wish.has(p.id)) heartB.style.color = '#d6336c';
  const shareB = h('button', { class: 'ibtn', style: { border: '1px solid var(--line)' }, 'aria-label': t('share'), onclick: async () => { const url = location.href; if (navigator.share) { try { await navigator.share({ title: tr(p, 'name'), url }); } catch { /* cancelled */ } } else { try { await navigator.clipboard.writeText(url); toast(t('copied')); } catch { /* */ } } } }, icon('share'));
  let stickyBtn, stickyPrice;
  const RU = p.rules || {};
  const retShort = RU.ret_rule === 'none' ? 'No return (damaged items still handled)' : ({ replacement: 'replacement', refund: 'refund', either: 'replacement or refund', exchange: 'exchange' }[RU.ret_rule] ? `${RU.ret_days}-day ${({ replacement: 'replacement', refund: 'refund', either: 'replacement or refund', exchange: 'exchange' })[RU.ret_rule]}` : `Easy ${BOOT.returns.window_days || 7}-day replacement`);
  const svc = [];
  if (RU.cod === 'off') svc.push(['card', 'Online payment', 'Pay safely by UPI']); else if (RU.cod === 'advance') svc.push(['card', 'Cash on delivery', `Pay ₹${RU.adv} now, rest on delivery`]); else if (RU.cod === 'cod') svc.push(['card', 'Cash on delivery', 'Pay when it arrives']);
  if (RU.ship === 'free') svc.push(['truck', 'Free delivery', 'No shipping charge']);
  if (RU.gift_ok) svc.push(['box', 'Gift wrap', 'Available at checkout']);
  const svcRow = svc.length ? h('div', { class: 'svc-cards' }, ...svc.map(([ic, ti, su]) => h('div', { class: 'svc-card' }, h('span', { class: 'svc-ic' }, icon(ic)), h('div', null, h('b', null, ti), h('span', null, su))))) : null;
  info.append(h('div', { class: 'stack' }, h('div', { class: 'row between', style: { alignItems: 'start', flexWrap: 'nowrap' } }, h('h1', null, tr(p, 'name')), h('div', { class: 'row', style: { flexWrap: 'nowrap', gap: '6px' } }, BOOT.store.wishlist ? heartB : null, shareB)),
    p.tagline ? h('p', { class: 'muted' }, tr(p, 'tagline')) : null,
    p.rating.count ? h('a', { href: '#reviews', class: 'row', style: { gap: '8px', textDecoration: 'none' } }, stars(p.rating.avg), h('span', { class: 'small' }, `${p.rating.avg} (${p.rating.count})`)) : null,
    priceEl, stockEl, varEl, atcRow,
    h('div', { class: 'stack' }, h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('div', { class: 'grow' }, pinInp), h('button', { class: 'btn ghost', onclick: checkPin }, t('check'))), pinOut),
    p.has_battery ? h('div', { class: 'box-note warn' }, icon('warn'), h('span', null, BOOT.shipping.battery_notice)) : null,
    h('div', { class: 'ret-chip' }, icon('refresh'), h('span', null, retShort)),
    svcRow));
  view.append(h('div', { class: 'wrap' }, h('div', { class: 'crumbs' }, h('a', { href: '/' }, t('home')), ' / ', h('a', { href: '/shop' }, t('shop')), ' / ', tr(p, 'name')), h('div', { class: 'pd' }, h('div', null, galBox), info)));
  gallery();
  // bottom glass bar (qty, total, delivery, Add to cart, Buy now)
  const SH = BOOT.shipping || {};
  const qtyN = h('span', null, '1');
  const totalEl = h('b', { class: 'pb-total' }), delEl = h('small', { class: 'pb-del' });
  const setQ = d => { S.qty = Math.max(1, Math.min(p.max_per_order || 10, S.qty + d)); paint(); };
  const sticky = h('div', { class: 'buybar on' }, h('div', { class: 'buybar-top' }, h('div', { class: 'qty' }, h('button', { 'aria-label': '-', onclick: () => setQ(-1) }, '−'), qtyN, h('button', { 'aria-label': '+', onclick: () => setQ(1) }, '+')), h('div', { class: 'pb-sum' }, totalEl, delEl)),
    h('div', { class: 'buybar-btns' }, h('button', { class: 'btn alt gl-add', id: 'atc', onclick: e => addToCart(p, S.vid, S.qty, e.currentTarget) }, icon('bag'), t('add')), h('button', { class: 'btn gl-buy', onclick: () => { buyItem.set(p.id, S.vid, S.qty, { name: p.name }); nav('/checkout?buy=1'); } }, t('buy'))));
  function paintBar(c) {
    sticky.classList.toggle('hide', !c.in_stock);
    document.body.classList.toggle('has-buybar', c.in_stock);
    qtyN.textContent = S.qty;
    const total = c.price * S.qty;
    const prevT = +totalEl.dataset.v || 0; totalEl.dataset.v = total; tweenNum(totalEl, prevT && prevT !== total ? prevT : total, total, v => money(v), 350);
    const own = RU.ship === 'own', charge = own ? (RU.ship_value || 0) : SH.flat;
    const free = !charge || RU.ship === 'free' || (!own && SH.free_above && total >= SH.free_above);
    delEl.textContent = free ? 'Free delivery' : `+ ${money(charge)} delivery` + (!own && SH.free_above ? ` · free above ${money(SH.free_above)}` : '');
    delEl.classList.toggle('ok', !!free);
  }
  document.body.append(sticky); paint();
  const gone = new MutationObserver(() => { if (!view.isConnected) { sticky.remove(); document.body.classList.remove('has-buybar'); gone.disconnect(); } }); gone.observe(document.body, { childList: true, subtree: true });

  /* details tabs */
  const tabsData = [];
  if (p.description || p.description_hi) tabsData.push(['About', () => h('div', { class: 'rte', html: (lang() === 'hi' && p.description_hi) || p.description })]);
  const rows = [...(p.specs || []).map(s => [s.k || s.label || s.name, s.v || s.value]), ['Country of origin', p.origin_country], ['Manufacturer', p.manufacturer], ['Imported by', p.importer], ['Warranty', tr(p, 'warranty')], ['Weight', p.weight_g ? p.weight_g + ' g' : ''], ['SKU', p.sku]].filter(r => r[0] && r[1]);
  if (rows.length) tabsData.push([t('specs'), () => h('table', { class: 'specs' }, rows.map(r => h('tr', null, h('td', null, r[0]), h('td', null, r[1]))))]);
  if (p.safety) tabsData.push(['Safety', () => h('div', { class: 'box-note warn' }, icon('warn'), h('div', { class: 'rte', style: { whiteSpace: 'pre-line' } }, tr(p, 'safety')))]);
  tabsData.push(['Returns & replacement', () => h('div', { class: 'ret-box' }, h('b', null, retShort), h('p', { class: 'muted' }, RU.ret_text || ('If something arrives damaged or does not work, tell us within ' + (BOOT.returns.window_days || 7) + ' days of delivery and we will make it right with a replacement or refund.')), h('p', { class: 'muted small' }, 'Tip: a short unboxing video helps us sort it out faster.'))]);
  if (p.faq && p.faq.length) tabsData.push(['FAQ', () => faqList(p.faq.map(f => ({ q: f.q, a: f.a })))]);
  if (tabsData.length) { const body = h('div', { style: { padding: '20px 0' } }); const bar = h('div', { class: 'tabs', role: 'tablist' }); const pick = k => { $$('button', bar).forEach((b, j) => b.classList.toggle('on', j === k)); clear(body).append(tabsData[k][1]()); }; tabsData.forEach((d, k) => bar.append(h('button', { role: 'tab', onclick: () => pick(k) }, d[0]))); pick(0); view.append(h('section', { class: 'section rev', style: { paddingBottom: 0 } }, h('div', { class: 'wrap' }, bar, body))); }
  /* reviews */
  if (BOOT.store.reviews) view.append(reviewsSection(p));
  /* similar loop */
  if (data.similar.length) view.append(sec(t('similar'), h('a', { class: 'link', href: '/shop' }, t('all') + ' →'), h('div', { class: 'hscroll' }, data.similar.map(x => productCard(x)))));
  reveal(view);
});

function reviewsSection(p) {
  const list = h('div'), formBox = h('div');
  let page = 1;
  async function load() {
    const r = await api(`/products/${p.slug}/reviews?page=${page}`).catch(() => ({ items: [], dist: [] }));
    if (page === 1) clear(list);
    if (!r.items.length && page === 1) list.append(h('p', { class: 'muted' }, p.rating && p.rating.count ? 'Rated by ' + p.rating.count + ' customer' + (p.rating.count > 1 ? 's' : '') + '. No written reviews yet.' : 'No reviews yet. Be the first.'));
    r.items.forEach(x => list.append(h('div', { class: 'rv' }, h('div', { class: 'row' }, stars(x.rating), h('b', null, x.title || ''), x.verified ? h('span', { class: 'badge soft' }, 'Verified buyer') : null), h('p', null, x.body), h('p', { class: 'muted small' }, `${x.name} · ${new Date(x.created_at).toLocaleDateString('en-IN')}`), x.reply ? h('p', { class: 'small', style: { background: 'var(--bg2)', padding: '10px 12px', borderRadius: '12px', marginTop: '6px' } }, h('b', null, BOOT.brand.name + ': '), x.reply) : null)));
    if (r.items.length === 8) { list.append(h('button', { class: 'btn ghost sm', onclick: e => { e.target.remove(); page++; load(); } }, t('load_more'))); }
  }
  load();
  const openForm = () => {
    let rating = 5; const star = h('div', { class: 'row', style: { gap: '4px' } }), body = h('textarea', { class: 'inp', placeholder: 'Write a few words (optional, you can send only stars)', maxlength: 1200 }), name = h('input', { class: 'inp', placeholder: t('name'), value: me.customer ? me.customer.name || '' : '' }), ord = h('input', { class: 'inp', placeholder: 'Order number (optional, shows "Verified buyer")' }), ph = h('input', { class: 'inp', inputmode: 'numeric', placeholder: 'Phone used for the order (optional)' });
    const paint = () => { clear(star); [1, 2, 3, 4, 5].forEach(i => star.append(h('button', { type: 'button', class: 'ibtn', style: { fontSize: '1.6rem', color: i <= rating ? '#e8a92b' : 'var(--line)' }, 'aria-label': i + ' star', onclick: () => { rating = i; paint(); } }, '★'))); }; paint();
    let rvTouched = false; guardWatch(formBox, () => rvTouched, true); formBox.oninput = () => { rvTouched = true; };
    clear(formBox).append(h('div', { class: 'card stack' }, h('b', null, t('write_review')), star, name, body, h('div', { class: 'grid2' }, ord, ph), h('button', { class: 'btn', onclick: async e => { try { e.currentTarget.classList.add('is-busy'); rvTouched = false; const r = await api(`/products/${p.slug}/reviews`, { method: 'POST', body: { rating, body: body.value, name: name.value, order: ord.value, phone: ph.value } }); clear(formBox).append(h('p', { class: 'box-note' }, r.message)); } catch (x) { toast(x.message, { err: true }); e.target.classList.remove('is-busy'); } } }, t('send'))));
  };
  return h('section', { class: 'section rev', id: 'reviews' }, h('div', { class: 'wrap' }, h('div', { class: 'sec-head' }, h('h2', null, t('reviews')), h('button', { class: 'btn ghost sm', onclick: openForm }, t('write_review'))), formBox, list));
}

function lightbox(imgs, start) {
  let i = start, sc = 1, tx = 0, ty = 0, pinch0 = null, pan0 = null, lastTap = 0, moved = 0;
  const pts = new Map();
  const im = h('img', { alt: '', draggable: 'false' }), stage = h('div', { class: 'lb-stage' }, im), cnt = h('div', { class: 'lb-count' });
  const mk = (cls, d, ic) => h('button', { class: 'ibtn lb-nav ' + cls, 'aria-label': d < 0 ? 'Previous photo' : 'Next photo', onclick: () => go(d) }, icon(ic));
  const wrap = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Photo viewer' }, h('button', { class: 'ibtn x', 'aria-label': t('close'), onclick: () => close() }, icon('x')), stage, cnt, imgs.length > 1 ? mk('l', -1, 'chevl') : null, imgs.length > 1 ? mk('r', 1, 'chev') : null);
  const apply = anim => { im.style.transition = anim ? 'transform .24s cubic-bezier(.2,.9,.3,1)' : 'none'; im.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`; };
  const clampPan = () => { const r = stage.getBoundingClientRect(), mx = Math.max(0, (im.offsetWidth * sc - r.width) / 2), my = Math.max(0, (im.offsetHeight * sc - r.height) / 2); tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty)); };
  const set = () => { im.src = imgs[i].gal; cnt.textContent = imgs.length > 1 ? `${i + 1} / ${imgs.length}` : ''; sc = 1; tx = 0; ty = 0; apply(); };
  const go = d => { i = (i + d + imgs.length) % imgs.length; set(); };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const vis = () => { wrap.remove(); document.removeEventListener('keydown', key); };
  const ov = pushOverlay(vis); const close = () => { vis(); releaseOverlay(ov); };
  const key = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft' && sc === 1) go(-1); else if (e.key === 'ArrowRight' && sc === 1) go(1); };
  document.addEventListener('keydown', key);
  stage.addEventListener('pointerdown', e => { try { stage.setPointerCapture(e.pointerId); } catch { /* */ } pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (pts.size === 2) { pinch0 = { d: dist(), sc }; pan0 = null; } else if (pts.size === 1) pan0 = { x: e.clientX, y: e.clientY, tx, ty, t: Date.now() }; });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch0) { sc = Math.max(1, Math.min(4, pinch0.sc * dist() / pinch0.d)); moved = 99; clampPan(); apply(); return; }
    if (pts.size !== 1 || !pan0) return;
    const dx = e.clientX - pan0.x, dy = e.clientY - pan0.y; moved = Math.max(moved, Math.hypot(dx, dy));
    if (sc > 1) { tx = pan0.tx + dx; ty = pan0.ty + dy; clampPan(); apply(); }
    else { const h2 = Math.abs(dx) > Math.abs(dy); im.style.transition = 'none'; im.style.transform = h2 ? `translateX(${dx}px)` : `translateY(${Math.max(0, dy)}px)`; wrap.style.setProperty('--lbo', h2 ? 1 : Math.max(.35, 1 - Math.max(0, dy) / 400)); }
  });
  const end = e => {
    if (!pts.has(e.pointerId)) return; const one = pts.size === 1; pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null;
    if (pts.size === 1) { const p = [...pts.values()][0]; pan0 = { x: p.x, y: p.y, tx, ty, t: Date.now() }; return; }
    if (!one || !pan0) return;
    const dx = e.clientX - pan0.x, dy = e.clientY - pan0.y; wrap.style.removeProperty('--lbo'); const p0 = pan0; pan0 = null;
    if (sc > 1) { if (sc < 1.05) { sc = 1; tx = 0; ty = 0; } apply(true); }
    else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2 && imgs.length > 1) go(dx < 0 ? 1 : -1);
    else if (dy > 90 && dy > Math.abs(dx)) { close(); return; }
    else apply(true);
    if (moved < 10 && Date.now() - p0.t < 300) { // tap: a second tap within 0.3 s zooms in or back out
      const now = Date.now(); if (now - lastTap < 320) { sc = sc > 1 ? 1 : 2.6; if (sc === 1) { tx = 0; ty = 0; } else { const r = stage.getBoundingClientRect(); tx = (r.left + r.width / 2 - e.clientX) * (sc - 1); ty = (r.top + r.height / 2 - e.clientY) * (sc - 1); clampPan(); } apply(true); lastTap = 0; } else lastTap = now;
    }
  };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', e => { e.preventDefault(); sc = Math.max(1, Math.min(4, sc * (e.deltaY < 0 ? 1.18 : 1 / 1.18))); if (sc === 1) { tx = 0; ty = 0; } clampPan(); apply(); }, { passive: false });
  set(); document.body.append(wrap);
}
function spinViewer(frames) {
  let f = 0, x0 = null; const im = h('img', { src: frames[0], alt: '360 degree view', draggable: 'false' });
  const box = h('div', { class: 'spin360', 'aria-label': '360 degree view. Drag to rotate.' }, im, h('div', { class: 'small muted', style: { position: 'absolute', bottom: '10px', left: 0, right: 0, textAlign: 'center' } }, 'Drag to rotate'));
  frames.forEach(u => { const i = new Image(); i.src = u; });
  const set = n => { f = (n + frames.length * 100) % frames.length; im.src = frames[f]; };
  box.addEventListener('pointerdown', e => { x0 = e.clientX; box.setPointerCapture(e.pointerId); box.style.cursor = 'grabbing'; }); box.addEventListener('pointerup', () => { x0 = null; box.style.cursor = ''; });
  box.addEventListener('pointermove', e => { if (x0 == null) return; const d = e.clientX - x0; if (Math.abs(d) > 12) { set(f + (d > 0 ? -1 : 1)); x0 = e.clientX; } });
  return box;
}
let mvLoaded;
function modelViewer(src, alt) {
  const box = h('div', { class: 'spin360', style: { cursor: 'default' } }, h('p', { class: 'center muted', style: { paddingTop: '45%' } }, 'Loading 3D…'));
  (mvLoaded ||= new Promise((res, rej) => { const s = document.createElement('script'); s.type = 'module'; s.src = '/vendor/model-viewer.min.js'; s.onload = res; s.onerror = rej; document.head.append(s); })).then(() => { clear(box); const mv = document.createElement('model-viewer'); mv.setAttribute('src', src); mv.setAttribute('alt', alt); mv.setAttribute('camera-controls', ''); mv.setAttribute('auto-rotate', ''); mv.setAttribute('shadow-intensity', '1'); mv.style.cssText = 'width:100%;height:100%;position:absolute;inset:0;--poster-color:transparent'; box.append(mv); }).catch(() => { clear(box).append(h('p', { class: 'center muted', style: { paddingTop: '45%' } }, '3D view could not load.')); });
  return box;
}

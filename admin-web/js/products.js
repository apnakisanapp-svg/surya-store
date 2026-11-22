import { h, $, $$, clear, api, toast, money, dt, card, pageHead, table, statusBadge, badge, busy, kv, tabs, modal, confirmBox, promptBox, buildForm, debounce } from './lib.js';
import { reg, go } from './router.js';

reg(/^\/products$/, async (v, m, q) => {
  const st = { status: '', q: '', page: 1, low: q.get('low') || '', trash: '' };
  const box = h('div'), tabBar = h('div');
  const search = h('input', { class: 'inp', placeholder: 'Search name or SKU…', style: { maxWidth: '300px' }, onkeydown: e => { if (e.key === 'Enter') { st.q = e.target.value; st.page = 1; load(); } } });
  v.append(pageHead('Products', h('a', { class: 'btn', href: 'api/products/export/csv', download: 'products.csv' }, 'Export CSV'), h('button', { class: 'btn', onclick: importModal }, 'Import CSV'), h('a', { class: 'btn primary', href: '#/products/new' }, '+ Add product')), h('div', { class: 'row', style: { marginBottom: '12px' } }, search), tabBar, box);
  async function load() {
    const p = new URLSearchParams({ page: st.page }); if (st.status) p.set('status', st.status); if (st.q) p.set('q', st.q); if (st.low) p.set('low', '1'); if (st.trash) p.set('trash', '1');
    const r = await api('/products?' + p), c = r.counts;
    clear(tabBar).append(tabs([['', 'All', Object.values(c).reduce((a, b) => a + b, 0) || ''], ['published', 'Live', c.published || ''], ['draft', 'Drafts', c.draft || ''], ['scheduled', 'Scheduled', c.scheduled || ''], ['low', 'Low stock'], ['trash', 'Trash']], st.trash ? 'trash' : st.low ? 'low' : st.status, k => { st.status = ['published', 'draft', 'scheduled'].includes(k) ? k : ''; st.low = k === 'low' ? '1' : ''; st.trash = k === 'trash' ? '1' : ''; st.page = 1; load(); }));
    const sel = new Set(), cbs = [], bulk = h('div', { class: 'row hide', style: { marginBottom: '10px' } });
    const allCb = h('input', { type: 'checkbox', style: { width: '20px', height: '20px' }, onchange: e => { cbs.forEach(c => { c.checked = e.target.checked; e.target.checked ? sel.add(c._id) : sel.delete(c._id); }); upd(); } });
    const cnt = h('b', null, ''), clr = h('button', { class: 'btn sm ghost', onclick: () => { cbs.forEach(c => { c.checked = false; }); sel.clear(); upd(); } }, 'Clear');
    const selBar = h('div', { class: 'row', style: { marginBottom: '10px', alignItems: 'center' } }, h('label', { class: 'row', style: { gap: '8px', cursor: 'pointer', alignItems: 'center', padding: '6px 0' } }, allCb, h('span', null, 'Select all on this page')), cnt, clr);
    const upd = () => { bulk.classList.toggle('hide', !sel.size); cnt.textContent = sel.size ? sel.size + ' selected' : ''; clr.classList.toggle('hide', !sel.size); allCb.checked = !!cbs.length && sel.size === cbs.length; };
    upd();
    const doBulk = async (action, value) => { try { const out = await api('/products/bulk', { method: 'POST', body: { ids: [...sel], action, value } }); toast(`${out.done.length} done` + (out.failed.length ? `. Not done: ${out.failed.map(f => f.error).slice(0, 2).join(' | ')}` : ''), !!out.failed.length); load(); } catch (x) { toast(x.message, true); } };
    bulk.append(h('b', null, 'With selected:'), h('button', { class: 'btn sm', onclick: () => doBulk('publish') }, 'Publish'), h('button', { class: 'btn sm', onclick: () => doBulk('unpublish') }, 'Hide'), h('button', { class: 'btn sm', onclick: async () => { const n = await promptBox('Change prices', 'Percent change (e.g. 10 or -5)'); if (n) doBulk('price_pct', n); } }, 'Change price %'), h('button', { class: 'btn sm bad', onclick: async () => { if (await confirmBox('Move selected products to trash?')) doBulk('trash'); } }, 'Trash'));
    clear(box).append(r.items.length ? selBar : '', bulk, table([
      { l: '', f: r => { const cb = h('input', { type: 'checkbox', style: { width: '20px', height: '20px' }, onchange: e => { e.target.checked ? sel.add(r.id) : sel.delete(r.id); upd(); } }); cb._id = r.id; cbs.push(cb); return h('label', { style: { display: 'block', padding: '12px 14px', margin: '-12px -14px', cursor: 'pointer' } }, cb); } },
      { l: '', f: r => r.thumb ? h('img', { src: r.thumb, width: 44, height: 44, alt: '', style: { borderRadius: '8px', objectFit: 'cover' } }) : h('div', { style: { width: '44px', height: '44px', background: 'var(--bg)', borderRadius: '8px' } }) },
      { l: 'Product', f: r => h('div', null, h('a', { href: '#/products/' + r.id }, h('b', null, r.name)), h('div', { class: 'small muted' }, `${r.category_name || 'No category'}${r.sku ? ' · ' + r.sku : ''}`)) },
      { l: 'Price', f: r => money(r.price), r: 1 }, { l: 'Stock', f: r => h('span', { style: { color: r.stock <= 0 ? 'var(--bad)' : '' } }, r.stock), r: 1 }, { l: 'Sold', k: 'sold_count', r: 1 },
      { l: 'Profit', f: r => h('span', { class: 'verdict ' + r.verdict, title: `Margin ${r.margin}%` }, `${r.margin}%`) },
      { l: 'Risk', f: r => badge(r.risk_level === 'green' ? 'OK' : r.risk_level === 'amber' ? 'Check' : 'Blocked', r.risk_level === 'green' ? 'ok' : r.risk_level === 'amber' ? 'warn' : 'bad') },
      { l: 'Status', f: r => statusBadge(r.status) },
      { l: '', f: r => r.deleted_at ? h('div', { class: 'row end' }, h('button', { class: 'btn sm', onclick: async () => { await api(`/products/${r.id}/restore`, { method: 'POST' }); load(); } }, 'Restore'), h('button', { class: 'btn sm bad', onclick: async () => { if (await confirmBox('Delete this product forever? This cannot be undone. Old orders keep their own copy of the details.', 'Delete forever')) { try { await api(`/products/${r.id}`.concat('/forever'), { method: 'DELETE' }); toast('Deleted forever'); load(); } catch (x) { toast(x.message, true); } } } }, 'Delete forever')) : null },
    ], r.items, { onRow: r => go('/products/' + r.id), empty: 'No products here. Press "+ Add product".' }));
    if (r.pages > 1) box.append(h('div', { class: 'row end', style: { marginTop: '12px' } }, h('span', { class: 'muted' }, `Page ${r.page} of ${r.pages}`), h('button', { class: 'btn sm', disabled: r.page <= 1, onclick: () => { st.page--; load(); } }, 'Previous'), h('button', { class: 'btn sm', disabled: r.page >= r.pages, onclick: () => { st.page++; load(); } }, 'Next')));
  }
  await load();
});
function importModal() {
  const t = h('textarea', { class: 'inp', rows: 10, placeholder: 'Paste CSV here. First row = column names: name, price, mrp, stock, category …' }), f = h('input', { type: 'file', accept: '.csv,text/csv', onchange: async e => { if (e.target.files[0]) t.value = await e.target.files[0].text(); } });
  const m = modal('Import products from CSV', h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Columns you can use: sku, name, name_hi, category, price, mrp, cost, stock, tagline, description, origin_country, manufacturer, warranty, tags (separate with |). Imported products stay as drafts until you add photos and publish them.'), f, t, h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async e => { try { const r = await busy(e.currentTarget, () => api('/products/import', { method: 'POST', body: { csv: t.value } })); m.close(); toast(`${r.created} new, ${r.updated} updated` + (r.errors.length ? `. ${r.errors.length} rows had problems: ${r.errors[0]}` : ''), !!r.errors.length); go('/products'); location.reload(); } catch (x) { toast(x.message, true); } } }, 'Import'))), { wide: true });
}

const SPEC = (cats) => [
  { t: 'heading', l: 'Basics' },
  { k: 'name', l: 'Product name', t: 'text', max: 140 }, { k: 'name_hi', l: 'Name in Hindi/Hinglish (optional)', t: 'text' },
  { k: 'tagline', l: 'One-line description', t: 'text', max: 160 }, { k: 'tagline_hi', l: 'One-line (Hindi, optional)', t: 'text' },
  { k: 'category_id', l: 'Category', t: 'select', num: true, opts: [['', '— choose —'], ...cats.map(c => [c.id, c.name])], w: 'half' }, { k: 'badge', l: 'Badge on photo (optional)', t: 'text', ph: 'New, Best seller…', w: 'half' },
  { k: 'description', l: 'Description', t: 'html', h: 'Plain text or simple HTML (<p>, <ul>, <b>). Scripts are removed.' }, { k: 'description_hi', l: 'Description (Hindi, optional)', t: 'html', rows: 4 },
  { k: 'tags', l: 'Search words', t: 'tags', ph: 'diya, diye, deepak, दीया, diwali, led light …', h: 'Extra words customers may type (Hindi, English, Hinglish, spelling mistakes). Leave empty and the site still uses the name and category. Use “Copy prompt for AI” for a long list.', prompt: d => {
    const cat = (cats.find(c => String(c.id) === String(d.category_id)) || {}).name || '';
    const desc = String(d.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    return `Mere online store ke ek product ke liye search keywords likho.\nProduct ka naam: ${d.name || '(naam yahan likho)'}\nCategory: ${cat || '(category)'}\nDetails: ${[d.tagline, desc].filter(Boolean).join('. ') || '(details)'}\n\nNiyam:\n- 40 se 60 keywords do, sab ek hi line me, comma se alag.\n- Wahi shabd do jo customer search me likhega: English, Hindi (Devanagari), Hinglish (Hindi shabd English letters me) aur 5-6 aam galat spellings.\n- Product ke doosre naam, use karne ke tareeke aur milti-julti cheezein bhi likho.\n- Sirf comma wali list do. Koi heading, number, explanation ya extra line mat likho.`;
  } },
  { t: 'heading', l: 'Price & stock' },
  { k: 'price', l: 'Selling price (₹)', t: 'number', w: 'half' }, { k: 'mrp', l: 'MRP (₹) — must not be below price', t: 'number', w: 'half' },
  { k: 'stock', l: 'Stock (pieces)', t: 'number', w: 'half' }, { k: 'low_stock_limit', l: 'Warn me when stock is below', t: 'number', w: 'half' },
  { k: 'max_per_order', l: 'Max per order', t: 'number', w: 'half' }, { k: 'sku', l: 'SKU (your own code)', t: 'text', w: 'half' },
  { k: 'preorder', l: 'Allow pre-order when stock is 0', t: 'check' }, { k: 'sold_out', l: 'Show as sold out (hides Add to cart)', t: 'check' },
  { t: 'heading', l: 'Who made it & warranty', h: 'Required by e-commerce rules. The product cannot be published without these.' },
  { k: 'origin_country', l: 'Country of origin', t: 'text', w: 'half' }, { k: 'manufacturer', l: 'Manufacturer (name & address)', t: 'text', w: 'half' }, { k: 'importer', l: 'Importer (if imported)', t: 'text', w: 'half' },
  { k: 'warranty', l: 'Warranty / guarantee', t: 'text', ph: 'No warranty, or 6 months', w: 'half' }, { k: 'warranty_hi', l: 'Warranty (Hindi, optional)', t: 'text', w: 'half' },
  { k: 'hsn', l: 'HSN code (for GST)', t: 'text', w: 'half' }, { k: 'gst_rate', l: 'GST rate % (if GST is on)', t: 'number', w: 'half' },
  { t: 'heading', l: 'Safety & shipping flags', h: 'Tick what applies. The risk checker uses this.' },
  { k: 'has_battery', l: 'Has a battery (lithium / rechargeable)', t: 'check' }, { k: 'is_electronic', l: 'Electronic / electrical product', t: 'check' }, { k: 'has_blade', l: 'Sharp or bladed', t: 'check' }, { k: 'is_liquid', l: 'Liquid, gel, spray or aerosol', t: 'check' }, { k: 'is_cosmetic_food', l: 'Cosmetic, food or supplement', t: 'check' },
  { k: 'safety', l: 'Safety instructions shown on the product page', t: 'textarea', rows: 4 }, { k: 'safety_hi', l: 'Safety (Hindi, optional)', t: 'textarea' },
  { k: 'safety_ack', l: 'Customer must tick "I read the safety instructions" at checkout', t: 'check' },
  { k: 'brand_used', l: 'Brand name you use (if any)', t: 'text', h: 'Do not use another company\'s brand.' },
  { k: 'weight_g', l: 'Weight (grams)', t: 'number', w: 'half' }, { k: 'dims', l: 'Size (L x W x H cm)', t: 'text', w: 'half' },
  { k: 'size_guide', l: 'Size guide (optional, for clothes)', t: 'textarea', rows: 5, ph: 'Size | Bust (in) | Length (in)\nS | 36 | 25\nM | 38 | 25', h: 'One line per size. First line = column names. Separate columns with |. Customers see it as a table.' },
  { t: 'heading', l: 'Details table & questions' },
  { k: 'specs', l: 'Details table', t: 'list', add: 'Add row', blank: { k: '', v: '' }, sub: [{ k: 'k', l: 'Label', t: 'text', w: 'half' }, { k: 'v', l: 'Value', t: 'text', w: 'half' }] },
  { k: 'faq', l: 'Questions & answers', t: 'list', add: 'Add question', blank: { q: '', a: '' }, sub: [{ k: 'q', l: 'Question', t: 'text' }, { k: 'a', l: 'Answer', t: 'textarea' }] },
  { t: 'heading', l: 'Search engines & extras' },
  { k: 'seo_title', l: 'Google title (optional)', t: 'text' }, { k: 'seo_desc', l: 'Google description (optional)', t: 'textarea', rows: 2 }, { k: 'video_url', l: 'Video link (optional)', t: 'text' },
  { k: 'featured', l: 'Feature on the home page (shown higher in Trending)', t: 'check' },
  { t: 'heading', l: 'Services for this product', h: 'Leave "Same as store" to use Settings > Payments.' },
  { t: 'services' },
];

reg(/^\/products\/(new|\d+)$/, async (v, m) => {
  const isNew = m[1] === 'new';
  const cats = await api('/categories');
  let p = isNew ? { price: 0, mrp: 0, stock: 0, max_per_order: 10, tags: [], specs: [], faq: [], variants: [], images: [], risk: null, economics: null, similar_mode: 'auto', similar_ids: [] } : await api('/products/' + m[1]);
  const id = p.id;
  const formOpts = { onChange: () => { dirty = true; liveRisk(); paintBar(); paintCheck(); } };
  let form = buildForm(SPEC(cats), p, formOpts);
  const secCards = {}, FOLD = ['Search engines & extras', 'Services for this product'];
  const mkCard = t => { const body = h('div', { class: 'form' }); const c = FOLD.includes(t) ? h('details', { class: 'card fold' }, h('summary', null, t === 'Services for this product' ? 'Services for this product (COD, delivery, return)' : t + ' (optional)'), body) : card(t, body); c._body = body; return c; };
  function sectionize() {
    const groups = []; let g = null;
    [...form.el.children].forEach(n => { if (n.classList && n.classList.contains('fh')) { g = { title: n.textContent, nodes: [] }; groups.push(g); } else if (g) g.nodes.push(n); });
    groups.forEach(x => { const c = secCards[x.title] || (secCards[x.title] = mkCard(x.title)); clear(c._body); x.nodes.forEach(n => c._body.append(n)); });
  }
  sectionize();
  let dirty = false, variants = JSON.parse(JSON.stringify(p.variants || []));
  const risk = h('div'), econ = h('div'), imgs = h('div'), vbox = h('div'), simBox = h('div');
  const head = pageHead(isNew ? 'New product' : p.name, h('a', { class: 'btn', href: '#/products' }, '← All products'), !isNew ? h('a', { class: 'btn', href: `${/^4\d{3}$/.test(location.port) ? location.origin.replace(/:\d+$/, '') + ':3000' : ''}/p/${p.slug}`, target: '_blank', id: 'viewlink' }, 'View on website') : null);
  const status = h('div', { class: 'row' });
  const checkEl = h('div'), barState = h('span', { class: 'sb-state' });
  const savebar = h('div', { class: 'savebar' }, barState, h('button', { class: 'btn primary', onclick: save }, 'Save'));
  const sc = t => secCards[t];
  v.append(head, h('div', { class: 'grid g21' }, h('div', { class: 'stack-lg' }, card('Paste from AI', aiBox()), sc('Basics'), card('Photos', isNew ? h('p', { class: 'muted' }, 'Save the product first, then add photos.') : imgs), card('Options (size, colour…)', h('p', { class: 'muted small' }, 'Optional. Add a colour, give it a photo once, then add its sizes with price, cost and stock. Leave empty if the product has no options.'), vbox), sc('Price & stock'), sc('Details table & questions'), sc('Who made it & warranty'), sc('Safety & shipping flags'), sc('Search engines & extras'), sc('Services for this product'), card('Similar products shown at the bottom', simBox), isNew ? null : card('360° spin and 3D model (optional)', advanced())),
    h('div', { class: 'stack-lg' }, card('Save & publish', status, h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', id: 'savebtn', onclick: save }, 'Save'))), card('Ready to publish?', checkEl), card('Risk checker', risk), card('Profit calculator', econ))), savebar);
  function paintBar() { barState.textContent = dirty ? '● Unsaved changes' : '✓ All saved'; barState.className = 'sb-state' + (dirty ? ' dirty' : ''); }
  function paintCheck() {
    const d = form.get(), photos = (p.images || []).length;
    const items = [['Product name', !!(d.name && String(d.name).length > 1)], ['Category', !!d.category_id], ['Price', Number(d.price) > 0 || variants.some(x => Number(x.price) > 0)], ['Stock', Number(d.stock) > 0 || variants.some(x => Number(x.stock) > 0)], ['At least one photo', photos > 0], ['Manufacturer', !!d.manufacturer], ['Country of origin', !!d.origin_country], ['Warranty text', !!d.warranty]];
    const left = items.filter(x => !x[1]).length;
    clear(checkEl).append(h('div', { class: 'note ' + (left ? 'warn' : 'ok') }, left ? `${left} thing${left > 1 ? 's' : ''} left before you can publish` : '✓ Everything needed is filled'), h('ul', { class: 'chk-list' }, items.map(([l, ok]) => h('li', { class: ok ? 'ok' : 'no' }, h('span', null, ok ? '✓' : '○'), l))));
  }
  paintBar(); paintCheck();
  window.onbeforeunload = null;
  const AI_TXT = { NAME: 'name', NAME_HI: 'name_hi', TAGLINE: 'tagline', TAGLINE_HI: 'tagline_hi', DESCRIPTION: 'description', DESCRIPTION_HI: 'description_hi', SAFETY: 'safety', SAFETY_HI: 'safety_hi', SEO_TITLE: 'seo_title', SEO_DESC: 'seo_desc', BADGE: 'badge', SKU: 'sku', SIZE_CM: 'dims', HSN: 'hsn', SIZE_GUIDE: 'size_guide' };
  const AI_NUM = { PRICE: 'price', MRP: 'mrp', STOCK: 'stock', WEIGHT_G: 'weight_g' };
  const AI_FLAG = { BATTERY: 'has_battery', ELECTRONIC: 'is_electronic', SHARP: 'has_blade', LIQUID: 'is_liquid', COSMETIC_FOOD: 'is_cosmetic_food' };
  function aiParse(t) {
    const out = { f: {}, tags: null, category: '', specs: [], faq: [], opts: [] }; let mode = '', cur = '', q = null, a = null;
    const flush = () => { if (q && a != null) out.faq.push({ q: q.trim(), a: a.trim() }); q = null; a = null; };
    for (const raw of String(t || '').split(/\r?\n/)) {
      const ln = raw.trim(); if (!ln) continue;
      let m;
      if (/^(details?|specs?|specifications?)( table)?\s*:?\s*$/i.test(ln)) { flush(); mode = 'd'; cur = ''; continue; }
      if (/^(questions?( (&|and) answers?)?|faqs?|q ?& ?a)\s*:?\s*$/i.test(ln)) { flush(); mode = 'q'; cur = ''; continue; }
      if (/^options?\s*:?\s*$/i.test(ln)) { flush(); mode = 'o'; cur = ''; continue; }
      if (mode === 'o') { const c = ln.split('|').map(x => x.trim()); if (c.length >= 2 && !/^colou?r$/i.test(c[0])) { const nv = x => { const n = parseFloat(String(x || '').replace(/[^\d.]/g, '')); return isNaN(n) ? '' : n; }; out.opts.push({ colour_name: c[0] === '-' ? '' : c[0], size: c[1] === '-' ? '' : c[1], price: nv(c[2]), cost: nv(c[3]), stock: nv(c[4]) || 0 }); } continue; }
      if (!mode && (m = ln.match(/^([A-Za-z_]{2,20})\s*[:=]\s*(.*)$/))) {
        const K = m[1].toUpperCase(), val = m[2].trim();
        if (K in AI_TXT) { out.f[AI_TXT[K]] = val; cur = AI_TXT[K]; continue; }
        if (K in AI_NUM) { const n = parseFloat(val.replace(/[^\d.]/g, '')); if (!isNaN(n)) out.f[AI_NUM[K]] = n; cur = ''; continue; }
        if (K in AI_FLAG) { out.f[AI_FLAG[K]] = /^(yes|y|true|haan|ha|1)\b/i.test(val); cur = ''; continue; }
        if (K === 'SEARCH_WORDS' || K === 'TAGS') { out.tags = val.split(/[,|]/).map(x => x.trim()).filter(Boolean); cur = ''; continue; }
        if (K === 'CATEGORY') { out.category = val; cur = ''; continue; }
      }
      if (!mode && cur) { out.f[cur] = (out.f[cur] ? out.f[cur] + '\n' : '') + ln; continue; }
      if ((m = ln.match(/^q(?:uestion)?\s*\d*\s*[:.)-]\s*(.+)$/i))) { flush(); mode = 'q'; q = m[1]; a = null; continue; }
      if ((m = ln.match(/^a(?:nswer)?\s*\d*\s*[:.)-]\s*(.*)$/i)) && q != null) { a = m[1]; continue; }
      if (mode === 'q' && q != null && a != null) { a += ' ' + ln; continue; }
      if (mode === 'd' && (m = ln.match(/^[-*•\s]*([^:|]{1,60})\s*[:|]\s*(.+)$/))) out.specs.push({ k: m[1].trim(), v: m[2].trim() });
    }
    flush(); return out;
  }
  function aiBox() {
    const ta = h('textarea', { class: 'inp', rows: 8, placeholder: 'NAME: ...\nTAGLINE: ...\nCATEGORY: Kitchen\nDESCRIPTION: ...\nSEARCH_WORDS: a, b, c\nPRICE: 399\nSKU: SU-KIT-002\nDETAILS:\nMaterial: Steel\nQUESTIONS:\nQ: ...\nA: ...' });
    const rep = h('input', { type: 'checkbox' }), note = h('small', { class: 'muted' }, 'Paste the AI answer, then press Fill. Nothing is saved until you press Save.');
    const prompt = () => {
      const d = form.get(), cat = (cats.find(c => String(c.id) === String(d.category_id)) || {}).name || '';
      const known = [d.name && 'Product: ' + d.name, cat && 'Category: ' + cat, d.price && 'Selling price: Rs ' + d.price, d.sku && 'SKU: ' + d.sku].filter(Boolean).join('\n') || 'Product: (write the product name or details here)';
      return `${known}\n\nWrite a professional online-store listing for this product. Simple English, own words, no brand names, no claims that cannot be verified (no "3x", "nano", "best", "100% safe"). Use no fake MRP. Add honest usage cautions.\nReply ONLY in this exact format, one field per line (DESCRIPTION and SAFETY may take several lines):\nNAME: <clear product name>\nNAME_HI: <Hinglish name>\nTAGLINE: <one line, max 120 characters>\nTAGLINE_HI: <Hinglish one line>\nCATEGORY: <choose ONE of: ${cats.map(c => c.name).join(', ')}>\nDESCRIPTION: <3 short paragraphs: what it is, how it helps, care/cautions>\nDESCRIPTION_HI: <same in Hinglish>\nSEARCH_WORDS: <40 keywords, comma separated, Hindi/English/Hinglish/spelling mistakes>\nPRICE: <number>\nMRP: <leave empty>\nSTOCK: <number>\nSKU: <short code like SU-KIT-002>\nWEIGHT_G: <number>\nSIZE_CM: <L x W x H>\nHSN: <code if you are sure, else empty>\nBATTERY: yes or no\nELECTRONIC: yes or no\nSHARP: yes or no\nLIQUID: yes or no\nCOSMETIC_FOOD: yes or no\nSAFETY: <honest safety and use instructions>\nSAFETY_HI: <same in Hinglish>\nSEO_TITLE: <max 60 characters>\nSEO_DESC: <max 150 characters>\nSIZE_GUIDE: <only for clothes; first line column names, then one line per size, columns separated by |, else leave empty>\nOPTIONS: <only if the product has sizes or colours, else skip this part>\n<Colour> | <Size> | <Selling price> | <My cost> | <Stock>   (one line per combination, use - if none)\nDETAILS:\n<Label>: <Value>   (6 to 8 lines, only facts true for this product)\nQUESTIONS:\nQ: <question a buyer would ask>\nA: <honest short answer>\n(5 questions)\nDo NOT write manufacturer, warranty, importer or GST.`;
    };
    const copy = async () => { const t = prompt(); try { await navigator.clipboard.writeText(t); toast('Prompt copied. Paste it in any AI.'); } catch { window.prompt('Copy this prompt:', t); } };
    const fill = () => {
      const r = aiParse(ta.value), n = Object.keys(r.f).length + r.opts.length + (r.tags ? 1 : 0) + (r.category ? 1 : 0);
      if (!n && !r.specs.length && !r.faq.length) return toast('Nothing found. Check the format.', true);
      const cur = form.get(), next = { ...cur, ...r.f }; let catNote = '';
      if (r.tags) next.tags = r.tags;
      if (r.category) { const k = r.category.toLowerCase(), c = cats.find(x => x.name.toLowerCase() === k) || cats.find(x => k.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(k)); if (c) next.category_id = c.id; else catNote = ` Category "${r.category}" not found, choose it yourself.`; }
      if (r.opts.length) {
        for (const o of r.opts) {
          const ex = variants.find(v => (v.size || '') === o.size && (v.colour_name || '') === o.colour_name);
          if (ex) Object.assign(ex, { price: o.price, cost: o.cost, stock: o.stock }); else variants.push({ name: '', size: o.size, colour_name: o.colour_name, price: o.price, cost: o.cost, stock: o.stock, active: true });
        }
        paintVariants();
      }
      if (r.specs.length) next.specs = rep.checked ? r.specs : [...(cur.specs || []).filter(x => x.k || x.v), ...r.specs];
      if (r.faq.length) next.faq = rep.checked ? r.faq : [...(cur.faq || []).filter(x => x.q || x.a), ...r.faq];
      form = buildForm(SPEC(cats), next, formOpts); sectionize(); dirty = true; paintBar(); paintCheck();
      note.textContent = `Filled ${n} fields, ${r.specs.length} detail rows, ${r.faq.length} questions.${catNote} Now add manufacturer and warranty yourself, check everything, then Save.`; toast('Filled. Check and Save.');
    };
    return h('div', { class: 'stack' }, ta, h('label', { class: 'chk' }, rep, h('span', null, 'Replace existing detail rows and questions (otherwise add below them)')), h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary sm', onclick: fill }, 'Fill'), h('button', { type: 'button', class: 'btn sm', onclick: copy }, 'Copy prompt for AI')), note);
  }
  function paintStatus() {
    clear(status);
    if (isNew) { status.append(h('span', { class: 'muted' }, 'Draft. Save, add photos, then publish.')); return; }
    status.append(statusBadge(p.status), p.status === 'published' ? h('button', { class: 'btn sm', onclick: () => act('unpublish') }, 'Hide from website') : h('button', { class: 'btn sm ok', onclick: () => act('publish') }, 'Publish'), p.status !== 'published' ? h('button', { class: 'btn sm', onclick: schedule }, 'Schedule…') : null,
      h('button', { class: 'btn sm', onclick: async () => { const c = await api(`/products/${id}/duplicate`, { method: 'POST' }); toast('Copied as draft'); go('/products/' + c.id); } }, 'Duplicate'), h('button', { class: 'btn sm bad', onclick: async () => { if (await confirmBox('Move this product to trash? It will disappear from the website.')) { await api('/products/' + id, { method: 'DELETE' }); go('/products'); } } }, 'Trash'));
  }
  async function act(a, body) { try { const r = await api(`/products/${id}/${a}`, { method: 'POST', body }); p = r; toast(a === 'publish' ? 'Published. It is live on the website.' : a === 'schedule' ? 'Scheduled' : 'Hidden'); refresh(); } catch (x) { if (x.status === 422 && x.data && x.data.risk) { paintRisk(x.data.risk); toast('Fix or confirm the items in the Risk checker first.', true); $('.flag', risk) && risk.scrollIntoView({ behavior: 'smooth', block: 'center' }); } else toast(x.message, true); } }
  async function schedule() { const d = await promptBox('Schedule publishing', 'Date and time (e.g. 2026-11-01 10:00)'); if (d) { const t = new Date(d.replace(' ', 'T')); if (isNaN(t)) return toast('Date not understood.', true); act('publish', { publish_at: t.toISOString() }); } }
  async function save(e) {
    const btn = e && e.currentTarget;
    try {
      const body = { ...form.get(), variants: variants.filter(x => x.name || x.size || x.colour_name) };
      delete body.risk_ack; // acks are saved by their own tick boxes; never overwrite them with the old copy loaded with the page
      body.similar_ids = p.similar_ids; body.similar_mode = p.similar_mode;
      const r = await busy(btn || $('#savebtn'), () => api(isNew ? '/products' : '/products/' + id, { method: isNew ? 'POST' : 'PUT', body }));
      dirty = false; paintBar();
      if (isNew) { toast('Saved. Now add photos.'); return go('/products/' + r.id); }
      p = r; toast(r.demoted ? 'Saved, but the product was hidden because it needs risk checks.' : 'Saved', !!r.demoted); refresh();
    } catch (x) { toast(x.message, true); }
  }
  function refresh() { paintBar(); paintCheck(); paintStatus(); paintRisk(p.risk); paintEcon(p.economics); paintImgs(); }
  const liveRisk = debounce(async () => { try { const d = form.get(); d.risk_ack = p.risk_ack || {}; const r = await api('/products/risk-check', { method: 'POST', body: d }); if (!isNew) r.flags.forEach(f => { f.acked = !!(p.risk_ack || {})[f.code] || f.acked; }); paintRisk(r); } catch { /* */ } econLive(); }, 500);
  function paintRisk(r) {
    clear(risk); if (!r) { risk.append(h('p', { class: 'muted' }, 'Fill in the product to see checks.')); return; }
    const lvl = r.level; risk.append(h('div', { class: 'note ' + (lvl === 'green' ? 'ok' : lvl === 'amber' ? 'warn' : 'bad') }, lvl === 'green' ? '✓ Ready to publish from a risk point of view.' : lvl === 'amber' ? `${r.open} item(s) need your attention before publishing.` : 'Blocked: this product contains a restricted item.'));
    risk.append(h('div', { class: 'risk', style: { marginTop: '10px' } }, r.flags.map(f => h('div', { class: 'flag ' + f.level + (f.acked ? ' acked' : '') }, h('b', null, f.title), h('div', { class: 'small' }, f.why), f.todo ? h('div', { class: 'small', style: { marginTop: '4px' } }, h('b', null, 'What to do: '), f.todo, f.link ? [' ', h('a', { href: f.link, target: '_blank', rel: 'noopener' }, 'Official site')] : null) : null,
      f.level === 'check' && !isNew ? h('label', { class: 'chk', style: { marginTop: '6px' } }, h('input', { type: 'checkbox', checked: f.acked, onchange: async e => { try { const out = await api(`/products/${id}/ack`, { method: 'POST', body: { codes: { [f.code]: e.target.checked } } }); p = out; paintRisk(out.risk); } catch (x) { toast(x.message, true); } } }), h('span', null, 'I have checked this')) : null))));
    if (!r.flags.length) risk.append(h('p', { class: 'muted small' }, 'No flags.'));
    risk.append(h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'This checker is a helper, not legal advice. When unsure, ask your CA or a lawyer.'));
  }
  const ov = { price: '', cost: '', ad: '', ship: '', packaging: '' };
  const econLive = debounce(async () => { try { const d = form.get(); const r = await api('/economics', { method: 'POST', body: { product_id: id || null, price: ov.price !== '' ? ov.price : d.price, gst_rate: d.gst_rate, cost: ov.cost !== '' ? ov.cost : undefined, ad: ov.ad, ship: ov.ship, packaging: ov.packaging } }); paintEcon(r); } catch { /* */ } }, 400);
  function paintEcon(e) {
    clear(econ); if (!e) { econ.append(h('p', { class: 'muted' }, 'Enter price to see profit.')); return; }
    const inp = (k, l) => h('label', { class: 'fld' }, h('span', null, l), h('input', { class: 'inp', type: 'number', step: 'any', placeholder: 'auto', value: ov[k], oninput: x => { ov[k] = x.target.value; econLive(); } }));
    econ.append(h('div', { class: 'row between' }, h('span', { class: 'verdict ' + e.verdict }, e.verdict === 'green' ? 'Profitable' : e.verdict === 'yellow' ? 'Thin margin' : 'Not profitable'), h('b', null, `${money(e.profit)} per order · ${e.margin}%`)),
      h('div', { style: { marginTop: '8px' } }, e.breakdown.map(b => kv(b.label, h('span', { style: { color: b.value < 0 ? 'var(--bad)' : '' } }, money(b.value))))), e.break_even_price ? h('div', { class: 'note', style: { marginTop: '8px' } }, `Break-even price: ${money(e.break_even_price)}. You can spend up to ${money(e.max_ad_per_order)} on ads per order.`) : null, e.reasons.map(r => h('p', { class: 'small muted' }, '• ' + r)),
      h('p', { class: 'small muted' }, `Cost used: ${money(e.unit_cost)} (${e.cost_source}).`), h('details', null, h('summary', null, 'What if…'), h('div', { class: 'form', style: { marginTop: '8px' } }, h('div', { class: 'fld half' }, inp('price', 'Price'), inp('cost', 'Cost'), inp('ad', 'Ads per order')), h('div', { class: 'fld half' }, inp('ship', 'Your shipping cost'), inp('packaging', 'Packaging')))));
  }
  function paintImgs() {
    if (isNew) return; clear(imgs);
    const file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hide', onchange: async e => { const fd = new FormData(); [...e.target.files].forEach(f => fd.append('images', f)); if (!e.target.files.length) return; try { p = await api(`/products/${id}/images`, { method: 'POST', form: fd }); paintImgs(); paintRisk(p.risk); toast('Photos added'); } catch (x) { toast(x.message, true); } } });
    imgs.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('button', { class: 'btn', onclick: () => file.click() }, '+ Add photos'), h('span', { class: 'muted small' }, 'First photo is the main one. Click a photo to choose which part stays in the square card picture.'), file));
    const g = h('div', { class: 'pimgs' });
    p.images.forEach((im, i) => g.append(h('div', { class: 'pimg' }, i === 0 ? h('span', { class: 'badge ok main' }, 'Main') : null,
      h('img', { src: im.gal, alt: im.alt || '', title: 'Click to set the focus point for the square crop', onclick: async e => { const r = e.target.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height; try { p = await api(`/products/${id}/images/${im.id}`, { method: 'PATCH', body: { focus_x: fx, focus_y: fy } }); toast('Crop updated'); paintImgs(); } catch (x) { toast(x.message, true); } } }),
      h('div', { class: 'bar' }, h('button', { class: 'btn sm', disabled: i === 0, onclick: () => move(i, -1) }, '←'), h('button', { class: 'btn sm', disabled: i === p.images.length - 1, onclick: () => move(i, 1) }, '→'), h('button', { class: 'btn sm bad', onclick: async () => { if (await confirmBox('Delete this photo?')) { p = await api(`/products/${id}/images/${im.id}`, { method: 'DELETE' }); paintImgs(); } } }, '×')))));
    imgs.append(g, p.images.length ? h('p', { class: 'muted small' }, 'Card preview (square, as customers see it): ', h('img', { src: p.images[0].card, width: 72, height: 72, alt: '', style: { verticalAlign: 'middle', borderRadius: '8px' } })) : h('div', { class: 'note warn' }, 'No photos yet. A product needs at least one photo to be published.'));
  }
  async function move(i, d) { const ids = p.images.map(x => x.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; p = await api(`/products/${id}/images/order`, { method: 'PUT', body: { ids } }); paintImgs(); }
  function advanced() {
    const wrapA = h('div', { class: 'stack' });
    const fr = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hide', onchange: async e => { const fd = new FormData(); [...e.target.files].forEach(f => fd.append('frames', f)); try { p = await api(`/products/${id}/spin`, { method: 'POST', form: fd }); toast('Frames added'); paintAdv(); } catch (x) { toast(x.message, true); } } });
    const gl = h('input', { type: 'file', accept: '.glb', class: 'hide', onchange: async e => { const fd = new FormData(); fd.append('model', e.target.files[0]); try { p = await api(`/products/${id}/glb`, { method: 'POST', form: fd }); toast('3D model added'); paintAdv(); } catch (x) { toast(x.message, true); } } });
    const paintAdv = () => { clear(wrapA).append(h('p', { class: 'muted small' }, 'Real 360° and 3D views need your own photos taken around the product, or a .glb model from your supplier/designer. Frames: 24 photos around the product work well (need at least 4).'), h('div', { class: 'row' }, h('span', null, `360° frames: ${p.spin ? p.spin.length : 0}`), h('button', { class: 'btn sm', onclick: () => fr.click() }, 'Add frames'), p.spin && p.spin.length ? h('button', { class: 'btn sm bad', onclick: async () => { p = await api(`/products/${id}/spin`, { method: 'DELETE' }); paintAdv(); } }, 'Remove all') : null, fr), h('div', { class: 'row' }, h('span', null, `3D model: ${p.model_glb ? 'added' : 'none'}`), h('button', { class: 'btn sm', onclick: () => gl.click() }, p.model_glb ? 'Replace .glb' : 'Add .glb'), p.model_glb ? h('button', { class: 'btn sm bad', onclick: async () => { p = await api(`/products/${id}/glb`, { method: 'DELETE' }); paintAdv(); } }, 'Remove') : null, gl)); };
    paintAdv(); return wrapA;
  }
  function paintVariants() {
    clear(vbox);
    const photoOpts = [['', '— none —'], ...(p.images || []).map((im, k) => [im.id, 'Photo ' + (k + 1)])];
    const groups = [], idx = new Map();
    variants.forEach(v => { const k = v.colour_name || ''; if (!idx.has(k)) { idx.set(k, { name: k, list: [] }); groups.push(idx.get(k)); } idx.get(k).list.push(v); });
    const touch = () => { dirty = true; paintBar(); paintCheck(); };
    const cell = (l, el) => h('label', { class: 'vt-c' }, h('span', null, l), el);
    const txt = (v, k, ph) => { const i = h('input', { class: 'inp', type: 'text', placeholder: ph || '', oninput: e => { v[k] = e.target.value; touch(); } }); i.value = v[k] == null ? '' : v[k]; return i; };
    const nm = (v, k, ph) => { const i = h('input', { class: 'inp', type: 'number', step: 'any', placeholder: ph || '', oninput: e => { v[k] = e.target.value === '' ? '' : Number(e.target.value); touch(); } }); i.value = v[k] == null ? '' : v[k]; return i; };
    groups.forEach(g => {
      const first = g.list[0], img0 = (p.images || []).find(i => i.id === first.image_id);
      const thumb = h('img', { class: 'vt-thumb', alt: '', src: img0 ? img0.thumb : '', style: { visibility: img0 ? 'visible' : 'hidden' } });
      const gname = h('input', { class: 'inp', placeholder: 'Colour name (e.g. Black-White)', oninput: e => { g.list.forEach(v => { v.colour_name = e.target.value; }); touch(); } }); gname.value = g.name;
      const sw = h('input', { type: 'color', class: 'vt-sw', title: 'Colour swatch (shown when there is no photo)', value: /^#[0-9a-f]{6}$/i.test(first.color || '') ? first.color : '#cccccc', oninput: e => { g.list.forEach(v => { v.color = e.target.value; }); touch(); } });
      const ph = h('select', { class: 'inp', onchange: e => { const val = e.target.value ? Number(e.target.value) : null; g.list.forEach(v => { v.image_id = val; }); const im = (p.images || []).find(i => i.id === val); thumb.src = im ? im.thumb : ''; thumb.style.visibility = im ? 'visible' : 'hidden'; touch(); } }, photoOpts.map(([val, l]) => h('option', { value: val, selected: String(val) === String(first.image_id || '') }, l)));
      const rows = g.list.map(v => h('div', { class: 'vt-row' },
        cell('Size', txt(v, 'size', 'M')), cell('Price (empty = same)', nm(v, 'price')), cell('Your cost', nm(v, 'cost')), cell('Stock', nm(v, 'stock')),
        h('label', { class: 'chk vt-on' }, h('input', { type: 'checkbox', checked: v.active !== false && v.active !== 0, onchange: e => { v.active = e.target.checked; touch(); } }), h('span', null, 'On')),
        h('button', { class: 'btn sm bad vt-x', title: 'Remove this size', onclick: () => { variants.splice(variants.indexOf(v), 1); paintVariants(); touch(); } }, '×'),
        h('details', { class: 'vt-more' }, h('summary', null, 'More'), h('div', { class: 'vt-morebody' }, cell('MRP', nm(v, 'mrp')), cell('SKU', txt(v, 'sku')), cell('Option name (auto)', txt(v, 'name'))))));
      const addSize = () => { const last = g.list[g.list.length - 1]; variants.splice(variants.indexOf(last) + 1, 0, { name: '', colour_name: g.name, color: first.color, image_id: first.image_id, size: '', stock: 0, active: true }); paintVariants(); touch(); };
      vbox.append(h('div', { class: 'vt-group' }, h('div', { class: 'vt-head' }, thumb, sw, gname, cell('Photo for this colour', ph)), ...rows, h('button', { class: 'btn sm', onclick: addSize }, '+ Add size')));
    });
    const gen = async () => {
      const sz = await promptBox('Sizes', 'Sizes, comma separated (e.g. S, M, L, XL). Leave empty if none.'); if (sz == null) return;
      const cl = await promptBox('Colours', 'Colours, comma separated (e.g. Black-White, Pink-White). Leave empty if none.'); if (cl == null) return;
      const S = String(sz).split(',').map(x => x.trim()).filter(Boolean), C = String(cl).split(',').map(x => x.trim()).filter(Boolean);
      if (!S.length && !C.length) return toast('Write at least one size or colour.', true);
      let added = 0;
      for (const c of (C.length ? C : [''])) for (const z of (S.length ? S : [''])) {
        if (variants.some(v => (v.size || '') === z && (v.colour_name || '') === c)) continue;
        variants.push({ name: '', size: z, colour_name: c, stock: 0, active: true }); added++;
      }
      if (variants.length > 30) { variants.length = 30; toast('Only 30 options are allowed.', true); }
      paintVariants(); touch(); toast(`${added} options added. Give each colour a photo, fill price, cost and stock, then Save.`);
    };
    vbox.append(h('div', { class: 'row', style: { marginTop: '4px' } }, h('button', { class: 'btn sm', onclick: () => { variants.push({ name: '', colour_name: '', size: '', stock: 0, active: true }); paintVariants(); touch(); } }, '+ Add colour or size'), h('button', { class: 'btn sm', onclick: gen }, 'Make Size × Colour options')));
  }
  async function paintSim() {
    clear(simBox); const mode = h('select', { class: 'inp', style: { maxWidth: '300px' }, onchange: e => { p.similar_mode = e.target.value; dirty = true; paintSim(); } }, h('option', { value: 'auto', selected: p.similar_mode !== 'manual' }, 'Automatic (same category, best sellers)'), h('option', { value: 'manual', selected: p.similar_mode === 'manual' }, 'I will choose'));
    simBox.append(mode);
    if (p.similar_mode === 'manual') { const all = (await api('/products?per=100')).items.filter(x => x.id !== id); const chosen = new Set(p.similar_ids || []); simBox.append(h('div', { class: 'grid g2', style: { marginTop: '10px' } }, all.map(x => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: chosen.has(x.id), onchange: e => { e.target.checked ? chosen.add(x.id) : chosen.delete(x.id); p.similar_ids = [...chosen]; dirty = true; } }), x.name)))); }
    simBox.append(h('p', { class: 'muted small' }, 'These products appear in a sliding row under the product, and fill up automatically if you pick fewer than 10.'));
  }
  paintStatus(); paintRisk(p.risk); paintEcon(p.economics); paintImgs(); paintVariants(); paintSim();
  if (isNew) liveRisk();
});

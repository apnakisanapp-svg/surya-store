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
    const sel = new Set(), bulk = h('div', { class: 'row hide', style: { marginBottom: '10px' } });
    const upd = () => { bulk.classList.toggle('hide', !sel.size); };
    const doBulk = async (action, value) => { try { const out = await api('/products/bulk', { method: 'POST', body: { ids: [...sel], action, value } }); toast(`${out.done.length} done` + (out.failed.length ? `. Not done: ${out.failed.map(f => f.error).slice(0, 2).join(' | ')}` : ''), !!out.failed.length); load(); } catch (x) { toast(x.message, true); } };
    bulk.append(h('b', null, 'With selected:'), h('button', { class: 'btn sm', onclick: () => doBulk('publish') }, 'Publish'), h('button', { class: 'btn sm', onclick: () => doBulk('unpublish') }, 'Hide'), h('button', { class: 'btn sm', onclick: async () => { const n = await promptBox('Change prices', 'Percent change (e.g. 10 or -5)'); if (n) doBulk('price_pct', n); } }, 'Change price %'), h('button', { class: 'btn sm bad', onclick: async () => { if (await confirmBox('Move selected products to trash?')) doBulk('trash'); } }, 'Trash'));
    clear(box).append(bulk, table([
      { l: '', f: r => h('input', { type: 'checkbox', onchange: e => { e.target.checked ? sel.add(r.id) : sel.delete(r.id); upd(); } }) },
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
  { t: 'heading', l: 'How can customers pay for this product?', h: 'Use this for risky or high-value items. If a cart has several products, the strictest rule applies.' },
  { k: 'pay_rule', l: 'Payment rule', t: 'select', opts: [['', 'Normal (follow Settings > Payments)'], ['upi_only', 'UPI only (no cash on delivery)'], ['cod_advance', 'Cash on delivery allowed, but advance is compulsory']] },
  { k: 'weight_g', l: 'Weight (grams)', t: 'number', w: 'half' }, { k: 'dims', l: 'Size (L x W x H cm)', t: 'text', w: 'half' },
  { t: 'heading', l: 'Details table & questions' },
  { k: 'specs', l: 'Details table', t: 'list', add: 'Add row', blank: { k: '', v: '' }, sub: [{ k: 'k', l: 'Label', t: 'text', w: 'half' }, { k: 'v', l: 'Value', t: 'text', w: 'half' }] },
  { k: 'faq', l: 'Questions & answers', t: 'list', add: 'Add question', blank: { q: '', a: '' }, sub: [{ k: 'q', l: 'Question', t: 'text' }, { k: 'a', l: 'Answer', t: 'textarea' }] },
  { t: 'heading', l: 'Search engines & extras' },
  { k: 'seo_title', l: 'Google title (optional)', t: 'text' }, { k: 'seo_desc', l: 'Google description (optional)', t: 'textarea', rows: 2 }, { k: 'video_url', l: 'Video link (optional)', t: 'text' },
  { k: 'featured', l: 'Feature on the home page (shown higher in Trending)', t: 'check' },
];

reg(/^\/products\/(new|\d+)$/, async (v, m) => {
  const isNew = m[1] === 'new';
  const cats = await api('/categories');
  let p = isNew ? { price: 0, mrp: 0, stock: 0, max_per_order: 10, tags: [], specs: [], faq: [], variants: [], images: [], risk: null, economics: null, similar_mode: 'auto', similar_ids: [] } : await api('/products/' + m[1]);
  const id = p.id;
  const form = buildForm(SPEC(cats), p, { onChange: () => { dirty = true; liveRisk(); } });
  let dirty = false, variants = JSON.parse(JSON.stringify(p.variants || []));
  const risk = h('div'), econ = h('div'), imgs = h('div'), vbox = h('div'), simBox = h('div');
  const head = pageHead(isNew ? 'New product' : p.name, h('a', { class: 'btn', href: '#/products' }, '← All products'), !isNew ? h('a', { class: 'btn', href: `${location.origin.replace(/:\d+$/, '')}:3000/p/${p.slug}`, target: '_blank', id: 'viewlink' }, 'View on website') : null);
  const status = h('div', { class: 'row' });
  v.append(head, h('div', { class: 'grid g21' }, h('div', { class: 'stack-lg' }, card('', form.el), card('Photos', isNew ? h('p', { class: 'muted' }, 'Save the product first, then add photos.') : imgs), card('Options (size, colour…)', h('p', { class: 'muted small' }, 'Optional. Each option can have its own price and stock. Leave empty if the product has no options.'), vbox), card('Similar products shown at the bottom', simBox), isNew ? null : card('360° spin and 3D model (optional)', advanced())),
    h('div', { class: 'stack-lg' }, card('Save & publish', status, h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', id: 'savebtn', onclick: save }, 'Save'))), card('Risk checker', risk), card('Profit calculator', econ))));
  window.onbeforeunload = null;
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
      const body = { ...form.get(), variants: variants.filter(x => x.name) };
      delete body.risk_ack; // acks are saved by their own tick boxes; never overwrite them with the old copy loaded with the page
      body.similar_ids = p.similar_ids; body.similar_mode = p.similar_mode;
      const r = await busy(btn || $('#savebtn'), () => api(isNew ? '/products' : '/products/' + id, { method: isNew ? 'POST' : 'PUT', body }));
      dirty = false;
      if (isNew) { toast('Saved. Now add photos.'); return go('/products/' + r.id); }
      p = r; toast(r.demoted ? 'Saved, but the product was hidden because it needs risk checks.' : 'Saved', !!r.demoted); refresh();
    } catch (x) { toast(x.message, true); }
  }
  function refresh() { paintStatus(); paintRisk(p.risk); paintEcon(p.economics); paintImgs(); }
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
    const file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hide', onchange: async e => { const fd = new FormData(); [...e.target.files].forEach(f => fd.append('images', f)); if (!e.target.files.length) return; try { toast('Uploading…'); p = await api(`/products/${id}/images`, { method: 'POST', form: fd }); paintImgs(); paintRisk(p.risk); toast('Photos added'); } catch (x) { toast(x.message, true); } } });
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
    variants.forEach((x, i) => { const f = buildForm([{ k: 'name', l: 'Option name', t: 'text', w: 'half', ph: 'Black / Large' }, { k: 'color', l: 'Colour (optional)', t: 'color', w: 'half' }, { k: 'price', l: 'Price (empty = same)', t: 'number', w: 'half' }, { k: 'stock', l: 'Stock', t: 'number', w: 'half' }, { k: 'sku', l: 'SKU', t: 'text', w: 'half' }, { k: 'active', l: 'Active', t: 'check' }], { ...x, active: x.active !== false && x.active !== 0 }, { onChange: d => { variants[i] = { ...variants[i], ...d }; dirty = true; } }); vbox.append(h('div', { class: 'listrow' }, h('div', { class: 'grow' }, f.el), h('button', { class: 'btn sm bad', onclick: () => { variants.splice(i, 1); paintVariants(); } }, '×'))); });
    vbox.append(h('button', { class: 'btn sm', onclick: () => { variants.push({ name: '', stock: 0, active: true }); paintVariants(); } }, '+ Add option'));
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

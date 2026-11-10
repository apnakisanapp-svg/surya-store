import { h, clear, api, toast, money, dt, d0, card, pageHead, table, statusBadge, badge, busy, kv, tabs, modal, confirmBox, promptBox, buildForm, debounce } from './lib.js';
import { reg, go } from './router.js';

const verdictBadge = v => badge(v === 'green' ? 'Good' : v === 'yellow' ? 'Thin' : 'Losing money', v === 'green' ? 'ok' : v === 'yellow' ? 'warn' : 'bad');
const iso = d => d.toISOString().slice(0, 10);

/* ---------- profit centre ---------- */
reg(/^\/profit$/, async v => {
  const to = new Date(), from = new Date(Date.now() - 30 * 864e5);
  const f = h('input', { class: 'inp', type: 'date', value: iso(from) }), t = h('input', { class: 'inp', type: 'date', value: iso(to) });
  const sum = h('div'), prods = h('div');
  v.append(pageHead('Profit centre', h('a', { class: 'btn', href: '#/expenses' }, 'Expenses'), h('a', { class: 'btn', href: '#/purchases' }, 'Purchases')),
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('label', { class: 'fld' }, h('span', null, 'From'), f), h('label', { class: 'fld' }, h('span', null, 'To'), t), h('button', { class: 'btn', onclick: loadSum }, 'Show')), sum,
    h('div', { style: { height: '14px' } }), card('Every product: will I earn or lose?', h('p', { class: 'muted small' }, 'Uses your landed cost (what you really paid including freight, duty and GST), shipping, packaging, ads, COD returns and damage allowance. Change the allowances in Settings → Profit & risk rules.'), prods));
  async function loadSum() {
    const s = await api(`/finance/profit/summary?from=${f.value}&to=${t.value}`);
    clear(sum).append(h('div', { class: 'grid g4' }, [['Orders', s.orders], ['Sales', money(s.revenue)], ['Cost of goods', money(s.cogs)], ['Gross profit', money(s.gross_profit)], ['Shipping', money(s.shipping_cost) + (s.shipping_estimated ? ' (est.)' : '')], ['Refunds', money(s.refunds)], ['Expenses', money(s.expenses)], ['Net profit', money(s.net_profit)]].map(([k, x], i) => h('div', { class: 'stat' + (i === 7 ? (s.net_profit < 0 ? ' bad' : ' ok') : '') }, h('div', { class: 'small muted' }, k), h('div', { class: 'big' }, x)))),
      s.byProduct.length ? card('Best sellers by profit', table([{ l: 'Product', k: 'name' }, { l: 'Units', k: 'units', r: 1 }, { l: 'Sales', f: r => money(r.revenue), r: 1 }, { l: 'Profit', f: r => money(r.gross), r: 1 }], s.byProduct)) : null, h('p', { class: 'muted small' }, s.note));
  }
  async function loadProds() {
    const rows = await api('/finance/profit/products');
    clear(prods).append(table([{ l: 'Product', f: r => h('div', null, h('b', null, r.name), h('div', { class: 'small muted' }, r.reasons && r.reasons[0] || '')) }, { l: 'Price', f: r => money(r.price), r: 1 }, { l: 'Cost', f: r => r.cost ? money(r.cost) + (r.cost_source === 'purchase' ? '' : ' *') : '—', r: 1 }, { l: 'Profit/order', f: r => money(r.profit), r: 1 }, { l: 'Margin', f: r => r.margin + '%', r: 1 }, { l: 'Break-even price', f: r => money(r.break_even_price), r: 1 }, { l: 'Max ad spend/order', f: r => money(r.max_ad_per_order), r: 1 }, { l: '', f: r => verdictBadge(r.verdict) }], rows, { onRow: r => go('/products/' + r.id), empty: 'Add a product first.' }), h('p', { class: 'muted small' }, '* cost typed by hand, not from a purchase entry.'));
  }
  loadSum(); loadProds();
});

/* ---------- purchases ---------- */
reg(/^\/purchases$/, async v => {
  const box = h('div');
  v.append(pageHead('Purchases', h('button', { class: 'btn primary', onclick: add }, '+ I bought stock')), h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Enter every stock purchase. We work out the true cost of one piece (landed cost), add the pieces to your stock and use that cost for profit numbers. Oldest stock is sold first.'), box);
  async function load() { const rows = await api('/finance/purchases'); clear(box).append(table([{ l: 'Date', f: r => d0(r.purchased_at) }, { l: 'Product', k: 'product' }, { l: 'Supplier', k: 'supplier' }, { l: 'Qty', k: 'qty', r: 1 }, { l: 'Rate', f: r => money(r.rate), r: 1 }, { l: 'Real cost / piece', f: r => h('b', null, money(r.unit_landed)), r: 1 }, { l: 'Left', k: 'qty_left', r: 1 }, { l: '', f: r => h('button', { class: 'btn sm bad', onclick: async () => { if (await confirmBox('Delete this purchase? Its pieces will be removed from stock if still unsold.')) { try { await api('/finance/purchases/' + r.id, { method: 'DELETE' }); load(); } catch (x) { toast(x.message, true); } } } }, '×') }], rows, { empty: 'No purchases yet.' })); }
  async function add() {
    const [prods, sups] = await Promise.all([api('/products?limit=500'), api('/finance/suppliers')]);
    const list = prods.items || prods;
    const f = buildForm([{ k: 'product_id', l: 'Product', t: 'select', num: true, opts: [['', 'Choose…'], ...list.map(p => [p.id, p.name])] }, { k: 'supplier_id', l: 'Supplier (optional)', t: 'select', num: true, opts: [['', '—'], ...sups.map(s => [s.id, s.name])], w: 'half' }, { k: 'purchased_at', l: 'Date', t: 'date', w: 'half' }, { k: 'qty', l: 'Pieces bought', t: 'number', w: 'half' }, { k: 'rate', l: 'Rate per piece ₹', t: 'number', w: 'half' }, { k: 'gst_pct', l: 'GST % on the bill', t: 'number', w: 'half' }, { k: 'gst_credit', l: 'I can claim this GST back (only if registered)', t: 'check' }, { k: 'freight', l: 'Freight / transport total ₹', t: 'number', w: 'half' }, { k: 'duty', l: 'Import duty total ₹', t: 'number', w: 'half' }, { k: 'other', l: 'Other cost total ₹', t: 'number', w: 'half' }, { k: 'bad_qty', l: 'Pieces found broken or not working', t: 'number', w: 'half' }, { k: 'invoice_no', l: 'Bill / invoice number', t: 'text' }, { k: 'notes', l: 'Note', t: 'text' }], { qty: 1, gst_pct: 0 });
    const out = h('div', { class: 'note' }, 'Fill the numbers to see the real cost of one piece.');
    const upd = debounce(async () => { try { const b = f.get(); const r = await api('/finance/landed-preview', { method: 'POST', body: b }); clear(out).append(h('b', null, 'Real cost of one good piece: ' + money(r.unit_landed))); } catch { } }, 250);
    f.el.addEventListener('input', upd); f.el.addEventListener('change', upd);
    const m = modal('I bought stock', h('div', null, f.el, out, h('div', { class: 'row end', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: async e => { try { await busy(e.currentTarget, () => api('/finance/purchases', { method: 'POST', body: f.get() })); m.close(); toast('Saved. Stock and cost updated.'); load(); } catch (x) { toast(x.message, true); } } }, 'Save'))), { wide: true });
  }
  load();
});

/* ---------- suppliers + sourcing ---------- */
reg(/^\/suppliers$/, async v => {
  let tab = 'list'; const box = h('div'), bar = h('div');
  v.append(pageHead('Suppliers & prices'), bar, box);
  const supSpec = [{ k: 'name', l: 'Supplier name', t: 'text', w: 'half' }, { k: 'phone', l: 'Phone / WhatsApp', t: 'text', w: 'half' }, { k: 'city', l: 'City', t: 'text', w: 'half' }, { k: 'url', l: 'Website or listing link', t: 'text', w: 'half' }, { k: 'rating', l: 'Your rating (1-5)', t: 'number', w: 'half' }, { k: 'bad_pieces', l: 'Broken pieces found so far', t: 'number', w: 'half' }, { k: 'payment_terms', l: 'Payment terms', t: 'text', w: 'half' }, { k: 'min_order', l: 'Minimum order', t: 'text', w: 'half' }, { k: 'notes', l: 'Notes', t: 'textarea', rows: 2 }];
  async function load() {
    clear(bar).append(tabs([['list', 'Suppliers'], ['quotes', 'Price quotes'], ['best', 'Cheapest source']], tab, k => { tab = k; load(); }));
    clear(box);
    if (tab === 'list') {
      const rows = await api('/finance/suppliers');
      box.append(h('div', { class: 'row end', style: { marginBottom: '10px' } }, h('button', { class: 'btn primary', onclick: () => edit() }, '+ Add supplier')), table([{ l: 'Name', f: r => h('b', null, r.name) }, { l: 'City', k: 'city' }, { l: 'Phone', f: r => r.phone ? h('a', { href: 'https://wa.me/91' + String(r.phone).replace(/\D/g, '').slice(-10), target: '_blank', rel: 'noopener' }, r.phone) : '' }, { l: 'Rating', k: 'rating' }, { l: 'Broken pieces', k: 'bad_pieces', r: 1 }, { l: '', f: r => h('div', { class: 'row end' }, h('button', { class: 'btn sm', onclick: () => edit(r) }, 'Edit'), h('button', { class: 'btn sm bad', onclick: async () => { if (await confirmBox('Delete supplier?')) { await api('/finance/suppliers/' + r.id, { method: 'DELETE' }); load(); } } }, '×')) }], rows, { empty: 'No suppliers yet. Add the sellers you found (IndiaMART, Alibaba, local market).' }));
    } else if (tab === 'quotes') {
      const rows = await api('/finance/quotes');
      box.append(h('div', { class: 'row end', style: { marginBottom: '10px' } }, h('button', { class: 'btn primary', onclick: addQuote }, '+ Add price quote')), table([{ l: 'Date', f: r => d0(r.quoted_at) }, { l: 'Supplier', k: 'supplier' }, { l: 'Product', f: r => r.product || r.item || '' }, { l: 'Rate', f: r => money(r.rate), r: 1 }, { l: 'Min qty', k: 'qty_min', r: 1 }, { l: 'Landed / piece', f: r => h('b', null, money(r.landed)), r: 1 }, { l: 'Days', k: 'delivery_days' }, { l: '', f: r => h('button', { class: 'btn sm bad', onclick: async () => { await api('/finance/quotes/' + r.id, { method: 'DELETE' }); load(); } }, '×') }], rows, { empty: 'No quotes yet. Ask 3 suppliers for a price and note them here.' }));
    } else {
      const rows = await api('/finance/sourcing');
      box.append(rows.length ? table([{ l: 'Product', k: 'name' }, { l: 'Last paid', f: r => r.last_landed ? money(r.last_landed) : '—', r: 1 }, { l: 'Cheapest quote', f: r => r.best ? money(r.best.landed) : '—', r: 1 }, { l: 'Supplier', f: r => r.best ? r.best.supplier : '' }, { l: 'Saving', f: r => r.saving_pct == null ? '' : badge((r.saving_pct > 0 ? '-' : '+') + Math.abs(r.saving_pct) + '%', r.saving_pct > 0 ? 'ok' : 'warn'), r: 1 }], rows) : h('div', { class: 'empty' }, 'Add price quotes linked to a product to compare suppliers.'));
    }
  }
  function edit(r) { const f = buildForm(supSpec, r || { rating: 3 }); const m = modal(r ? 'Edit supplier' : 'Add supplier', h('div', null, f.el, h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => { try { await api(r ? '/finance/suppliers/' + r.id : '/finance/suppliers', { method: r ? 'PUT' : 'POST', body: f.get() }); m.close(); load(); } catch (x) { toast(x.message, true); } } }, 'Save'))), { wide: true }); }
  async function addQuote() {
    const [prods, sups] = await Promise.all([api('/products?limit=500'), api('/finance/suppliers')]); const list = prods.items || prods;
    if (!sups.length) return toast('Add a supplier first', true);
    const f = buildForm([{ k: 'supplier_id', l: 'Supplier', t: 'select', num: true, opts: sups.map(s => [s.id, s.name]), w: 'half' }, { k: 'product_id', l: 'Product', t: 'select', num: true, opts: [['', 'Other item'], ...list.map(p => [p.id, p.name])], w: 'half' }, { k: 'item', l: 'Item name (if not in list)', t: 'text' }, { k: 'rate', l: 'Rate per piece ₹', t: 'number', w: 'half' }, { k: 'qty_min', l: 'Minimum order pieces', t: 'number', w: 'half' }, { k: 'freight_unit', l: 'Freight per piece ₹', t: 'number', w: 'half' }, { k: 'duty_pct', l: 'Duty %', t: 'number', w: 'half' }, { k: 'other_unit', l: 'Other cost per piece ₹', t: 'number', w: 'half' }, { k: 'delivery_days', l: 'Delivery days', t: 'number', w: 'half' }, { k: 'quoted_at', l: 'Date', t: 'date', w: 'half' }, { k: 'notes', l: 'Note', t: 'text' }], { qty_min: 1 });
    const m = modal('Add price quote', h('div', null, f.el, h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => { try { await api('/finance/quotes', { method: 'POST', body: f.get() }); m.close(); load(); } catch (x) { toast(x.message, true); } } }, 'Save'))), { wide: true });
  }
  load();
});

/* ---------- insights ---------- */
reg(/^\/insights$/, async v => {
  const r = await api('/finance/insights');
  const kind = { bad: 'bad', warn: 'warn', info: '', good: 'ok' };
  v.append(pageHead('Daily tips'), h('p', { class: 'muted', style: { marginBottom: '12px' } }, r.note), r.items.length ? h('div', { class: 'stack' }, r.items.map(i => card('', h('div', { class: 'row between' }, h('b', null, i.title), badge({ bad: 'Act now', warn: 'Check', info: 'Info', good: 'Good' }[i.level], kind[i.level])), h('p', { style: { margin: '6px 0' } }, i.detail), i.link ? h('a', { class: 'btn sm', href: '#/' + i.link.replace(/^\//, '') }, 'Open') : null))) : h('div', { class: 'empty' }, 'No tips yet. They appear as orders and visits come in.'));
});

/* ---------- compliance ---------- */
reg(/^\/compliance$/, async v => {
  const box = h('div'); v.append(pageHead('Compliance centre', h('button', { class: 'btn', onclick: async () => { const t = await promptBox('Add a task', 'What do you need to do?'); if (t) { await api('/finance/compliance', { method: 'POST', body: { title: t } }); load(); } } }, '+ Add task')), box);
  async function load() {
    const c = await api('/finance/compliance');
    clear(box).append(h('div', { class: 'note warn', style: { marginBottom: '12px' } }, 'This list is a helper, not legal advice. Check the points with your CA or a lawyer.'),
      c.gaps.length ? card('Needs your attention', h('ul', null, c.gaps.map(g => h('li', null, g)))) : h('div', { class: 'note ok' }, 'No gaps found in your business details.'), h('div', { style: { height: '14px' } }),
      c.live_risk.length ? card('Live products with open risk items', table([{ l: 'Product', k: 'name' }, { l: 'Level', f: r => badge(r.level, r.level === 'red' ? 'bad' : 'warn') }, { l: 'Open points', f: r => (r.open || []).length }], c.live_risk, { onRow: r => go('/products/' + r.id) })) : null, c.live_risk.length ? h('div', { style: { height: '14px' } }) : null,
      card(`Checklist (${c.done} of ${c.total} done)`, h('div', { class: 'stack' }, c.items.map(i => h('div', { class: 'row between', style: { alignItems: 'flex-start', gap: '12px' } }, h('div', { style: { flex: 1 } }, h('b', { style: i.status !== 'todo' ? { textDecoration: 'line-through', opacity: .6 } : {} }, i.title), i.overdue ? ' ' : '', i.overdue ? badge('Overdue', 'bad') : null, i.detail ? h('div', { class: 'small muted' }, i.detail) : null, i.notes ? h('div', { class: 'small' }, 'Note: ' + i.notes) : null),
        h('div', { class: 'row' }, h('button', { class: 'btn sm ' + (i.status === 'done' ? 'ok' : ''), onclick: async () => { await api('/finance/compliance/' + i.id, { method: 'PATCH', body: { status: i.status === 'done' ? 'todo' : 'done' } }); load(); } }, i.status === 'done' ? 'Done ✓' : 'Mark done'), h('button', { class: 'btn sm', onclick: async () => { const n = await promptBox('Note', 'Your note', { value: i.notes || '' }); if (n !== null) { await api('/finance/compliance/' + i.id, { method: 'PATCH', body: { notes: n } }); load(); } } }, 'Note'), i.status !== 'na' ? h('button', { class: 'btn sm', onclick: async () => { await api('/finance/compliance/' + i.id, { method: 'PATCH', body: { status: 'na' } }); load(); } }, 'Not for me') : null))))));
  }
  load();
});

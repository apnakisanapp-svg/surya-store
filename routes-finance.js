'use strict';
const express = require('express');
const db = require('../shared/db');
const settings = require('../shared/settings');
const finance = require('../shared/finance');
const risk = require('../shared/risk');
const catalog = require('../shared/catalog');
const auth = require('../shared/auth');
const { crud } = require('./crud');
const { asyncH, bad, notFound, int, num, round2, jparse, now } = require('../shared/util');

const r = express.Router();
const DAY = 86400000;
const range = q => {
  const to = q.to ? new Date(new Date(q.to).getTime() + DAY) : new Date(Date.now() + 1000);
  const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * DAY);
  return { from: from.toISOString(), to: to.toISOString() };
};

/* ---- suppliers & quotes ---- */
r.use('/suppliers', crud({
  table: 'suppliers', label: 'supplier', soft: true, order: 'name', search: ['name', 'city'], required: ['name'],
  fields: { name: 'text', phone: 'text', city: 'text', url: 'text', rating: 'int', payment_terms: 'text', min_order: 'text', notes: 'text', bad_pieces: 'int' },
  before: (d, req, ex) => { if (!ex) d.created_at = now(); if (d.rating != null) d.rating = Math.min(5, Math.max(1, d.rating)); },
}));
r.get('/quotes', (req, res) => {
  const where = ['1=1'], args = [];
  if (req.query.product_id) { where.push('q.product_id=?'); args.push(int(req.query.product_id)); }
  if (req.query.supplier_id) { where.push('q.supplier_id=?'); args.push(int(req.query.supplier_id)); }
  res.json(db.prepare(`SELECT q.*, s.name supplier, p.name product FROM supplier_quotes q JOIN suppliers s ON s.id=q.supplier_id LEFT JOIN products p ON p.id=q.product_id WHERE ${where.join(' AND ')} ORDER BY q.quoted_at DESC LIMIT 500`).all(...args)
    .map(x => ({ ...x, landed: round2(x.rate * (1 + (x.duty_pct || 0) / 100) + (x.freight_unit || 0) + (x.other_unit || 0)) })));
});
r.post('/quotes', asyncH((req, res) => {
  const b = req.body || {};
  if (!db.prepare('SELECT 1 FROM suppliers WHERE id=?').get(int(b.supplier_id))) throw bad('Choose a supplier.');
  if (!(num(b.rate) > 0)) throw bad('Enter the rate per piece.');
  const id = db.prepare('INSERT INTO supplier_quotes(supplier_id,product_id,item,rate,qty_min,freight_unit,duty_pct,other_unit,quoted_at,delivery_days,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(int(b.supplier_id), int(b.product_id) || null, String(b.item || '').slice(0, 120) || null, num(b.rate), Math.max(1, int(b.qty_min, 1)), num(b.freight_unit), num(b.duty_pct), num(b.other_unit), b.quoted_at ? new Date(b.quoted_at).toISOString() : now(), int(b.delivery_days) || null, String(b.notes || '').slice(0, 300) || null).lastInsertRowid;
  auth.logActivity(req.admin.id, 'quote', 'supplier', b.supplier_id, b.rate, req);
  res.json({ id });
}));
r.delete('/quotes/:id', (req, res) => { db.prepare('DELETE FROM supplier_quotes WHERE id=?').run(int(req.params.id)); res.json({ ok: true }); });
r.get('/sourcing', asyncH((req, res) => { // best (cheapest) supplier per product, compared with what you paid last
  const prods = db.prepare('SELECT id,name,price,cost FROM products WHERE deleted_at IS NULL').all();
  res.json(prods.map(p => {
    const quotes = finance.bestSupplierQuotes(p.id), last = finance.latestLanded(p.id), best = quotes[0] || null;
    return { product_id: p.id, name: p.name, price: p.price, last_landed: last, best, quotes, saving_pct: best && last ? round2((last - best.landed) / last * 100) : null };
  }).filter(x => x.quotes.length));
}));

/* ---- purchases (what you bought, at what landed cost) ---- */
r.get('/purchases', (req, res) => res.json(db.prepare('SELECT u.*, p.name product, s.name supplier FROM purchases u JOIN products p ON p.id=u.product_id LEFT JOIN suppliers s ON s.id=u.supplier_id ORDER BY u.purchased_at DESC, u.id DESC LIMIT 500').all()));
r.post('/purchases', asyncH((req, res) => {
  const b = req.body || {}, p = db.prepare('SELECT * FROM products WHERE id=?').get(int(b.product_id));
  if (!p) throw bad('Choose the product.');
  const qty = int(b.qty); if (qty < 1) throw bad('Enter how many pieces you bought.');
  if (!(num(b.rate) >= 0) || b.rate === '' || b.rate == null) throw bad('Enter the rate per piece.');
  const badQty = Math.min(qty - 1 < 0 ? 0 : qty, Math.max(0, int(b.bad_qty)));
  const good = qty - badQty;
  const landed = finance.landedUnit({ qty, rate: num(b.rate), gst_pct: num(b.gst_pct), freight: num(b.freight), duty: num(b.duty), other: num(b.other), bad_qty: badQty, gst_credit: !!b.gst_credit });
  const addStock = b.add_stock === false ? 0 : 1;
  const id = db.transaction(() => {
    const id = db.prepare('INSERT INTO purchases(supplier_id,product_id,variant_id,qty,rate,gst_pct,freight,duty,other,unit_landed,qty_left,bad_qty,invoice_no,notes,purchased_at,add_stock) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(int(b.supplier_id) || null, p.id, int(b.variant_id) || null, qty, num(b.rate), num(b.gst_pct), num(b.freight), num(b.duty), num(b.other), landed, good, badQty, String(b.invoice_no || '').slice(0, 40) || null, String(b.notes || '').slice(0, 300) || null, b.purchased_at ? new Date(b.purchased_at).toISOString() : now(), addStock).lastInsertRowid;
    if (addStock) {
      if (b.variant_id) db.prepare('UPDATE variants SET stock=stock+? WHERE id=? AND product_id=?').run(good, int(b.variant_id), p.id);
      else db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(good, p.id);
    }
    db.prepare('UPDATE products SET cost=?, updated_at=? WHERE id=?').run(landed, now(), p.id);
    if (badQty && b.supplier_id) db.prepare('UPDATE suppliers SET bad_pieces=bad_pieces+? WHERE id=?').run(badQty, int(b.supplier_id));
    return id;
  })();
  auth.logActivity(req.admin.id, 'purchase', 'product', p.id, `${qty} @ landed ${landed}`, req);
  const ec = finance.economics(db.prepare('SELECT * FROM products WHERE id=?').get(p.id));
  res.json({ id, unit_landed: landed, economics: ec });
}));
r.delete('/purchases/:id', asyncH((req, res) => {
  const u = db.prepare('SELECT * FROM purchases WHERE id=?').get(int(req.params.id));
  if (!u) throw notFound();
  if (u.qty_left !== u.qty - u.bad_qty) throw bad('Some of this stock is already sold, so the entry cannot be deleted.');
  db.transaction(() => {
    if (u.add_stock) { if (u.variant_id) db.prepare('UPDATE variants SET stock=MAX(0,stock-?) WHERE id=?').run(u.qty_left, u.variant_id); else db.prepare('UPDATE products SET stock=MAX(0,stock-?) WHERE id=?').run(u.qty_left, u.product_id); }
    db.prepare('DELETE FROM purchases WHERE id=?').run(u.id);
  })();
  res.json({ ok: true });
}));
r.post('/landed-preview', (req, res) => { const b = req.body || {}; res.json({ unit_landed: finance.landedUnit({ qty: int(b.qty, 1), rate: num(b.rate), gst_pct: num(b.gst_pct), freight: num(b.freight), duty: num(b.duty), other: num(b.other), bad_qty: int(b.bad_qty), gst_credit: !!b.gst_credit }) }); });

/* ---- expenses ---- */
r.use('/expenses', crud({
  table: 'expenses', label: 'expense', order: 'spent_at DESC, id DESC', search: ['note', 'category'], required: ['amount'],
  fields: { category: 'text', amount: 'num', note: 'text', spent_at: 'date' },
  before: (d, req, ex) => { if (!ex && !d.spent_at) d.spent_at = now(); if (d.amount != null && !(d.amount > 0)) throw bad('Amount must be more than zero.'); },
}));

/* ---- profit centre ---- */
r.get('/profit/products', asyncH((req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE deleted_at IS NULL').all();
  const out = rows.map(p => { const e = finance.economics(p); return { id: p.id, name: p.name, status: p.status, price: p.price, cost: e.unit_cost, cost_source: e.cost_source, profit: e.profit, margin: e.margin, break_even_price: e.break_even_price, max_ad_per_order: e.max_ad_per_order, verdict: e.verdict, reasons: e.reasons, stock: p.stock }; });
  const order = { red: 0, yellow: 1, green: 2 };
  out.sort((a, b) => order[a.verdict] - order[b.verdict] || a.margin - b.margin);
  res.json(out);
}));
r.get('/profit/summary', asyncH((req, res) => {
  const { from, to } = range(req.query);
  const live = "o.status IN ('confirmed','packed','shipped','delivered')";
  const o = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(o.total),0) revenue, COALESCE(SUM(o.gst_amount),0) gst, COALESCE(SUM(o.ship_cost),0) ship, COALESCE(SUM(CASE WHEN o.ship_cost IS NULL THEN 1 ELSE 0 END),0) ship_missing FROM orders o WHERE ${live} AND o.placed_at>=? AND o.placed_at<?`).get(from, to);
  const cogs = db.prepare(`SELECT COALESCE(SUM(i.cost*i.qty),0) c, COALESCE(SUM(i.qty),0) units FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ${live} AND o.placed_at>=? AND o.placed_at<?`).get(from, to);
  const lost = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(total),0) v FROM orders WHERE status IN ('cancelled','returned') AND placed_at>=? AND placed_at<?").get(from, to);
  const refunds = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM refunds WHERE created_at>=? AND created_at<?').get(from, to).s;
  const exp = db.prepare('SELECT category, SUM(amount) s FROM expenses WHERE spent_at>=? AND spent_at<? GROUP BY category').all(from, to);
  const expenses = exp.reduce((s, e) => s + e.s, 0);
  const estShip = o.ship_missing * settings.get('shipping').avg_ship_cost;
  const gross = o.revenue - o.gst - cogs.c;
  const net = gross - o.ship - estShip - refunds - expenses;
  const byProduct = db.prepare(`SELECT i.name, SUM(i.qty) units, SUM(i.price*i.qty) revenue, SUM((i.price-i.cost)*i.qty) gross FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ${live} AND o.placed_at>=? AND o.placed_at<? GROUP BY i.product_id ORDER BY gross DESC LIMIT 20`).all(from, to);
  res.json({ from, to, orders: o.orders, units: cogs.units, revenue: round2(o.revenue), gst: round2(o.gst), cogs: round2(cogs.c), gross_profit: round2(gross), shipping_cost: round2(o.ship + estShip), shipping_estimated: o.ship_missing > 0, refunds: round2(refunds), expenses: round2(expenses), expenses_by: exp, net_profit: round2(net),
    cancelled: lost, byProduct, note: 'Net profit uses the landed cost from your purchase entries. Orders without a courier cost use your average shipping cost.' });
}));

/* ---- insights built only from your own data ---- */
r.get('/insights', asyncH((req, res) => {
  const out = [], since7 = new Date(Date.now() - 7 * DAY).toISOString(), since14 = new Date(Date.now() - 14 * DAY).toISOString(), since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const add = (level, title, detail, link) => out.push({ level, title, detail, link: link || null });
  const prods = db.prepare('SELECT * FROM products WHERE deleted_at IS NULL').all();
  for (const p of prods) {
    const sold14 = db.prepare("SELECT COALESCE(SUM(i.qty),0) q FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.product_id=? AND o.placed_at>=? AND o.status NOT IN ('cancelled')").get(p.id, since14).q;
    const perDay = sold14 / 14;
    if (p.status === 'published' && perDay > 0 && p.stock / perDay < 7) add('warn', `Restock "${p.name}"`, `You sell about ${round2(perDay)} a day and have ${p.stock} left, so it lasts about ${Math.floor(p.stock / perDay)} days. Check the Sourcing page for the cheapest supplier.`, `products/${p.id}`);
    if (p.status === 'published' && p.stock === 0 && !p.preorder) add('bad', `"${p.name}" is out of stock`, 'Customers can only use "Notify me". Restock or hide it.', `products/${p.id}`);
    const e = finance.economics(p);
    if (p.status === 'published' && e.verdict === 'red') add('bad', `"${p.name}" is not profitable`, e.reasons.join(' ') + ` Break-even price: ₹${e.break_even_price}.`, `profit`);
    const ev = db.prepare("SELECT SUM(type='view') v, SUM(type='atc') a, SUM(type='checkout') c FROM product_events WHERE product_id=? AND created_at>=?").get(p.id, since30);
    if (ev.v >= 40 && ev.a / ev.v < 0.03) add('info', `"${p.name}": many views, few add-to-cart`, `${ev.v} views but only ${ev.a || 0} add-to-cart in 30 days. Try better photos, a clearer title or a lower price.`, `products/${p.id}`);
    if (ev.a >= 10 && (ev.c || 0) / ev.a < 0.2) add('info', `"${p.name}": carts abandoned`, 'People add it to the cart but do not start checkout. Check shipping cost, COD options and delivery estimate.', `products/${p.id}`);
    const rk = risk.checkProduct({ ...p, tags: jparse(p.tags, []) });
    if (p.status === 'published' && rk.level !== 'green') add('warn', `"${p.name}" has open risk items`, 'Open the Risk checker and confirm or fix them.', `products/${p.id}`);
  }
  const noRes = db.prepare('SELECT term, COUNT(*) c FROM search_log WHERE results=0 AND created_at>=? GROUP BY term ORDER BY c DESC LIMIT 5').all(since30);
  for (const s of noRes) add('info', `Customers searched "${s.term}" (${s.c}x) and found nothing`, 'Think about adding a product for this, or add the word to a product\'s tags.', 'products');
  const top = db.prepare('SELECT term, COUNT(*) c FROM search_log WHERE created_at>=? GROUP BY term ORDER BY c DESC LIMIT 5').all(since30);
  if (top.length) add('info', 'Top searches (30 days)', top.map(t => `${t.term} (${t.c})`).join(', '), null);
  const cod = db.prepare("SELECT COUNT(*) n, SUM(status IN ('cancelled','returned')) bad FROM orders WHERE payment_method='cod' AND placed_at>=?").get(since30);
  if (cod.n >= 8 && cod.bad / cod.n > 0.25) add('bad', 'COD cancellations are high', `${cod.bad} of ${cod.n} COD orders in 30 days were cancelled or returned. Consider a COD fee, a COD limit, or confirming by phone.`, 'settings/payments');
  const stale = db.prepare('SELECT COUNT(*) c FROM supplier_quotes WHERE quoted_at<?').get(since30).c;
  if (stale) add('info', `${stale} supplier quote(s) are older than 30 days`, 'Prices change. Ask for fresh quotes before buying.', 'sourcing');
  const nocost = prods.filter(p => p.status === 'published' && !(p.cost > 0)).length;
  if (nocost) add('warn', `${nocost} live product(s) have no cost price`, 'Profit numbers are wrong without cost. Add a purchase entry or the cost field.', 'products');
  const states = db.prepare("SELECT json_extract(address,'$.state') st, COUNT(*) c FROM orders WHERE placed_at>=? AND status NOT IN ('cancelled') GROUP BY st ORDER BY c DESC LIMIT 5").all(since30);
  if (states.length) add('info', 'Where your orders come from', states.map(s => `${s.st} (${s.c})`).join(', '), null);
  const repeat = db.prepare("SELECT COUNT(*) c FROM (SELECT phone FROM orders WHERE status NOT IN ('cancelled') GROUP BY phone HAVING COUNT(*)>1)").get().c;
  if (repeat) add('good', `${repeat} repeat customer(s)`, 'Send them a thank-you coupon.', 'coupons');
  const rank = { bad: 0, warn: 1, info: 2, good: 3 };
  out.sort((a, b) => rank[a.level] - rank[b.level]);
  res.json({ items: out, note: 'These tips come from your own store data only. Market trends and competitor prices need external tools (Google Trends, marketplaces), which are not connected.' });
}));

/* ---- compliance centre ---- */
r.get('/compliance', (req, res) => {
  const items = db.prepare('SELECT * FROM compliance_items ORDER BY sort,id').all();
  const t = now();
  const liveRisk = db.prepare(`SELECT * FROM products p WHERE ${catalog.LIVE_SQL}`).all(...catalog.liveArgs()).map(p => ({ id: p.id, name: p.name, ...risk.checkProduct({ ...p, tags: jparse(p.tags, []) }) })).filter(x => x.level !== 'green').map(x => ({ id: x.id, name: x.name, level: x.level, open: x.open }));
  const B = settings.get('brand');
  const gaps = [];
  if (!B.grievance.name || !B.grievance.email) gaps.push('Grievance Officer name and email are not filled (Settings > Business).');
  if (!B.legal_name || !B.address) gaps.push('Legal name or address missing (Settings > Business).');
  if (!B.email || !B.phone) gaps.push('Support email or phone missing.');
  if (!settings.get('payments').upi_id) gaps.push('UPI ID is not set, so UPI checkout is off.');
  const g = db.prepare("SELECT COUNT(*) c FROM contact_messages WHERE kind='grievance' AND status!='resolved' AND ((acked_at IS NULL AND ack_due_at<?) OR resolve_due_at<?)").get(t, t).c;
  if (g) gaps.push(`${g} grievance(s) are past the 48-hour acknowledgement or 1-month resolution time.`);
  res.json({ items: items.map(i => ({ ...i, overdue: i.due_at && i.status === 'todo' && i.due_at < t })), live_risk: liveRisk, gaps, done: items.filter(i => i.status !== 'todo').length, total: items.length });
});
r.patch('/compliance/:id', asyncH((req, res) => {
  const id = int(req.params.id), b = req.body || {};
  if (b.status && !['todo', 'done', 'na'].includes(b.status)) throw bad('Bad status.');
  db.prepare('UPDATE compliance_items SET status=COALESCE(?,status), notes=CASE WHEN ? IS NULL THEN notes ELSE ? END, due_at=CASE WHEN ? IS NULL THEN due_at ELSE ? END, checked_at=? WHERE id=?')
    .run(b.status || null, b.notes === undefined ? null : 1, b.notes || null, b.due_at === undefined ? null : 1, b.due_at ? new Date(b.due_at).toISOString() : null, now(), id);
  auth.logActivity(req.admin.id, 'compliance', 'compliance', id, b.status || '', req);
  res.json({ ok: true });
}));
r.post('/compliance', asyncH((req, res) => {
  const t = String(req.body?.title || '').trim(); if (t.length < 3) throw bad('Write the task.');
  const id = db.prepare("INSERT INTO compliance_items(key,title,detail,status,sort) VALUES(?,?,?,'todo',999)").run('custom-' + Date.now(), t, String(req.body?.detail || '')).lastInsertRowid;
  res.json({ id });
}));

module.exports = r;

'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../shared/db');
const cfg = require('../shared/config');
const settings = require('../shared/settings');
const orders = require('../shared/orders');
const auth = require('../shared/auth');
const mail = require('../shared/mail');
const { itemImage, asyncH, bad, notFound, int, num, jparse, now, esc, rupee, toCSV, round2 } = require('../shared/util');

const r = express.Router();
const addr = o => jparse(o.address, {});

function listWhere(q) {
  const where = ['1=1'], args = [];
  if (q.status) {
    if (q.status === 'action') where.push("(status='cod_confirm' OR status='confirmed' OR payment_status='submitted')"); // unpaid UPI orders wait in their own tab until a payment is submitted
    else { where.push('status=?'); args.push(q.status); }
  }
  if (q.method) { where.push('payment_method=?'); args.push(q.method); }
  if (q.payment_status) { where.push('payment_status=?'); args.push(q.payment_status); }
  if (q.risky === '1') where.push('risky=1');
  if (q.from) { where.push('placed_at>=?'); args.push(new Date(q.from).toISOString()); }
  if (q.to) { where.push('placed_at<?'); args.push(new Date(new Date(q.to).getTime() + 86400000).toISOString()); }
  if (q.q) { const l = '%' + String(q.q).replace(/[%_]/g, '') + '%'; where.push('(number LIKE ? OR phone LIKE ? OR name LIKE ? OR email LIKE ? OR utr LIKE ? OR tracking_no LIKE ?)'); args.push(l, l, l, l, l, l); }
  return { w: where.join(' AND '), args };
}

r.get('/', asyncH((req, res) => {
  const { w, args } = listWhere(req.query);
  const page = Math.max(1, int(req.query.page, 1)), per = Math.min(100, int(req.query.per, 25));
  const total = db.prepare(`SELECT COUNT(*) c FROM orders WHERE ${w}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM orders WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  const items = db.prepare(`SELECT order_id, name, qty FROM order_items WHERE order_id IN (${rows.map(() => '?').join(',') || 'NULL'})`).all(...rows.map(x => x.id));
  const by = {}; for (const i of items) (by[i.order_id] ||= []).push(`${i.name} x${i.qty}`);
  const counts = db.prepare('SELECT status, COUNT(*) c FROM orders GROUP BY status').all();
  res.json({ total, page, pages: Math.ceil(total / per), counts: Object.fromEntries(counts.map(c => [c.status, c.c])),
    items: rows.map(o => ({ id: o.id, number: o.number, name: o.name, phone: o.phone, status: o.status, payment_method: o.payment_method, payment_status: o.payment_status, total: o.total, placed_at: o.placed_at,
      risky: !!o.risky, risk_reason: o.risk_reason, utr: o.utr, has_battery: !!o.has_battery, city: addr(o).city, summary: (by[o.id] || []).join(', ') })) });
}));

function orderProfit(o, items) {
  const cost = items.reduce((s, i) => s + (i.cost || 0) * i.qty, 0);
  const P = settings.get('profit');
  const gateway = o.payment_method === 'upi' ? 0 : 0;
  const ship = o.ship_cost != null ? o.ship_cost : settings.get('shipping').avg_ship_cost;
  const revenue = o.total - (o.gst_amount || 0);
  const profit = revenue - cost - ship - gateway;
  return { revenue: round2(revenue), cost: round2(cost), ship_cost: round2(ship), ship_estimated: o.ship_cost == null, profit: round2(profit), margin: o.total > 0 ? round2(profit / o.total * 100) : 0, allowance_note: P.gateway_fee_pct ? 'Gateway fee not included for manual UPI.' : '' };
}

r.get('/:id', asyncH((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(int(req.params.id));
  if (!o) throw notFound('Order not found.');
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id).map(i => ({ ...i, image_url: itemImage(i.image) }));
  const events = db.prepare('SELECT * FROM order_events WHERE order_id=? ORDER BY id').all(o.id);
  const requests = db.prepare('SELECT * FROM order_requests WHERE order_id=? ORDER BY id DESC').all(o.id).map(x => ({ ...x, photos: jparse(x.photos, []) }));
  const refunds = db.prepare('SELECT * FROM refunds WHERE order_id=? ORDER BY id').all(o.id);
  const history = db.prepare("SELECT COUNT(*) total, SUM(status='delivered') delivered, SUM(status IN ('cancelled','returned')) bad FROM orders WHERE phone=? AND id<>?").get(o.phone, o.id);
  const consents = db.prepare('SELECT kind,policy_slug,policy_version,accepted,created_at FROM consents WHERE order_id=?').all(o.id);
  const outbox = db.prepare('SELECT id,channel,kind,link,status,created_at FROM outbox WHERE order_id=? ORDER BY id DESC').all(o.id);
  res.json({ order: { ...o, address: addr(o), gift: jparse(o.gift, null), access_token: undefined, payment_screenshot: !!o.payment_screenshot, pay_amount: orders.payAmount(o), has_advance: orders.hasAdvance(o), due_on_delivery: orders.dueOnDelivery(o) }, items, events, requests, refunds, history, consents, outbox, profit: orderProfit(o, items), next: orders.NEXT[o.status] || [] });
}));

r.post('/:id/status', asyncH((req, res) => {
  const id = int(req.params.id), to = String(req.body?.to || '');
  if (!orders.STATUSES.includes(to)) throw bad('Unknown status.');
  if (to === 'cancelled' && !String(req.body?.reason || '').trim()) throw bad('Please write a reason for cancelling.');
  const o = orders.setStatus(id, to, { actor: 'admin', note: String(req.body?.note || ''), reason: String(req.body?.reason || ''), force: !!req.body?.force });
  auth.logActivity(req.admin.id, 'order_status', 'order', id, to, req);
  res.json({ order: o });
}));
// Match money received (pasted from your bank or UPI app) with orders that are waiting for payment.
// It only SUGGESTS matches. Nothing is confirmed until the owner presses the button.
r.post('/match-payments', asyncH((req, res) => {
  const text = String(req.body?.text || '').slice(0, 200000);
  const waiting = db.prepare("SELECT id,number,name,CASE WHEN payment_method='cod' THEN advance_pay ELSE total END AS total,utr,payment_status,placed_at FROM orders WHERE (payment_method='upi' OR advance_amount>0) AND payment_status IN ('pending','submitted') AND status IN ('payment_pending','placed') ORDER BY id DESC LIMIT 500").all();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const amountOf = l => [...l.matchAll(/(?:^|[^0-9.,])((?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2})(?!\d)/g)].map(m => Number(m[1].replace(/,/g, '')));
  const doneUtr = new Set(db.prepare("SELECT utr FROM orders WHERE utr IS NOT NULL AND payment_status='verified'").all().map(r => String(r.utr).toUpperCase()));
  const found = [], seen = new Set();
  for (const o of waiting) {
    const hits = lines.filter(l => amountOf(l).some(a => Math.abs(a - o.total) < 0.005));
    if (!hits.length) continue;
    const u = o.utr ? String(o.utr).toUpperCase() : '';
    const utrHit = u && hits.find(l => l.toUpperCase().includes(u));
    const sameAmount = waiting.filter(x => Math.abs(x.total - o.total) < 0.005).length;
    const usedElsewhere = hits.every(l => [...doneUtr].some(d => l.toUpperCase().includes(d)));
    const level = utrHit && sameAmount === 1 ? 'certain' : 'probable';
    if (usedElsewhere && !utrHit) continue; // this credit already belongs to an earlier confirmed order
    if (seen.has(o.id)) continue; seen.add(o.id);
    found.push({ id: o.id, number: o.number, name: o.name, total: o.total, utr: o.utr, level, line: (utrHit || hits[0]).trim().slice(0, 200), note: level === 'certain' ? 'Amount and transaction ID both match.' : (u ? 'Amount matches, but the customer\'s transaction ID was not found on that line.' : 'Amount matches. The customer has not sent a transaction ID yet.') });
  }
  res.json({ matches: found, waiting: waiting.length, lines: lines.length });
}));
r.post('/:id/verify', asyncH((req, res) => {
  const o = orders.verifyPayment(int(req.params.id), 'admin', !!req.body?.ok, String(req.body?.note || ''));
  auth.logActivity(req.admin.id, req.body?.ok ? 'payment_verified' : 'payment_rejected', 'order', o.id, o.utr || '', req);
  res.json({ order: o });
}));
r.post('/:id/advance-refunded', asyncH((req, res) => { // you returned the COD advance to the customer (UPI) and now record it
  const id = int(req.params.id), o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o || !orders.hasAdvance(o)) throw notFound('This order has no advance.');
  if (!['refund_due', 'verified'].includes(o.advance_status)) throw bad('There is no advance waiting to be refunded.');
  db.prepare("UPDATE orders SET advance_status='refunded', updated_at=? WHERE id=?").run(now(), id);
  orders.addEvent(id, o.status, `Advance of ${o.advance_amount} refunded to the customer${req.body?.note ? ': ' + String(req.body.note).slice(0, 200) : ''}`, 'admin');
  auth.logActivity(req.admin.id, 'advance_refunded', 'order', id, String(o.advance_amount), req);
  res.json({ ok: true });
}));
r.post('/:id/ship', asyncH((req, res) => {
  const id = int(req.params.id), b = req.body || {};
  if (!String(b.courier || '').trim()) throw bad('Please choose or type the courier name.');
  db.prepare('UPDATE orders SET courier=?, tracking_no=?, tracking_url=?, ship_cost=COALESCE(?,ship_cost) WHERE id=?').run(String(b.courier).trim(), String(b.tracking_no || '').trim() || null, String(b.tracking_url || '').trim() || orders.trackingLink(b.courier, b.tracking_no), b.ship_cost === '' || b.ship_cost == null ? null : num(b.ship_cost), id);
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!['shipped', 'delivered'].includes(o.status)) orders.setStatus(id, 'shipped', { actor: 'admin', note: `${b.courier} ${b.tracking_no || ''}` });
  auth.logActivity(req.admin.id, 'order_ship', 'order', id, b.courier, req);
  res.json({ order: db.prepare('SELECT * FROM orders WHERE id=?').get(id) });
}));
r.patch('/:id', asyncH((req, res) => {
  const id = int(req.params.id), b = req.body || {};
  const map = { internal_note: 'text', courier: 'text', tracking_no: 'text', tracking_url: 'text', ship_cost: 'num' };
  const sets = [], args = [];
  for (const [k, t] of Object.entries(map)) if (b[k] !== undefined) { sets.push(k + '=?'); args.push(t === 'num' ? (b[k] === '' ? null : num(b[k])) : (String(b[k]).trim() || null)); }
  if (sets.length) db.prepare(`UPDATE orders SET ${sets.join(',')}, updated_at=? WHERE id=?`).run(...args, now(), id);
  res.json({ ok: true });
}));
r.post('/bulk', asyncH((req, res) => {
  const ids = (req.body?.ids || []).map(int).slice(0, 200), to = String(req.body?.to || ''), done = [], failed = [];
  for (const id of ids) { try { orders.setStatus(id, to, { actor: 'admin', note: 'Bulk update', reason: String(req.body?.reason || '') }); done.push(id); } catch (e) { failed.push({ id, error: e.message }); } }
  auth.logActivity(req.admin.id, 'order_bulk', 'order', ids.join(','), to, req);
  res.json({ done, failed });
}));
r.post('/:id/requests/:rid', asyncH((req, res) => {
  const rq = db.prepare('SELECT * FROM order_requests WHERE id=? AND order_id=?').get(int(req.params.rid), int(req.params.id));
  if (!rq) throw notFound();
  const action = String(req.body?.action || ''), map = { approve: 'approved', reject: 'rejected', complete: 'completed' };
  if (!map[action]) throw bad('Unknown action.');
  db.prepare('UPDATE order_requests SET status=?, admin_note=?, resolved_at=? WHERE id=?').run(map[action], String(req.body?.note || '').slice(0, 500) || null, action === 'approve' ? null : now(), rq.id);
  orders.addEvent(rq.order_id, null, `Request ${map[action]}${req.body?.note ? ': ' + req.body.note : ''}`, 'admin');
  if (action === 'complete' && rq.type === 'refund') { try { orders.setStatus(rq.order_id, 'returned', { actor: 'admin', note: 'Refund completed', force: true, silent: true }); } catch { /* ignore */ } }
  auth.logActivity(req.admin.id, 'order_request_' + action, 'order', rq.order_id, rq.type, req);
  res.json({ ok: true });
}));
r.post('/:id/refund', asyncH((req, res) => {
  const id = int(req.params.id), amt = num(req.body?.amount);
  if (!(amt > 0)) throw bad('Enter the refund amount.');
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) throw notFound();
  const paid = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM refunds WHERE order_id=?').get(id).s;
  if (paid + amt > o.total + 0.001) throw bad('Refunds cannot be more than the order total.');
  db.prepare('INSERT INTO refunds(order_id,amount,method,ref,note,created_at) VALUES(?,?,?,?,?,?)').run(id, amt, String(req.body?.method || 'UPI').slice(0, 30), String(req.body?.ref || '').slice(0, 60) || null, String(req.body?.note || '').slice(0, 200) || null, now());
  orders.addEvent(id, o.status, `Refund of ${rupee(amt)} recorded`, 'admin');
  mail.queueOrderMessage(o, 'refunded');
  auth.logActivity(req.admin.id, 'refund', 'order', id, amt, req);
  res.json({ ok: true });
}));
r.get('/:id/file/:kind', asyncH((req, res) => {
  const o = db.prepare('SELECT payment_screenshot FROM orders WHERE id=?').get(int(req.params.id));
  let file = req.params.kind === 'payment' ? o?.payment_screenshot : null;
  if (!file && req.params.kind.startsWith('req-')) {
    const rq = db.prepare('SELECT photos FROM order_requests WHERE id=? AND order_id=?').get(int(req.params.kind.slice(4).split('-')[0]), int(req.params.id));
    file = jparse(rq?.photos, [])[int(req.params.kind.split('-')[2], 0)];
  }
  if (!file || !/^[a-f0-9]+\.webp$/.test(file)) throw notFound();
  const p = path.join(cfg.PRIVATE, file);
  if (!fs.existsSync(p)) throw notFound();
  res.set('Cache-Control', 'private, max-age=3600').sendFile(p);
}));

/* ---- printable documents ---- */
function doc(o, items, kind) {
  const B = settings.get('brand'), a = addr(o), gst = B.gst_enabled;
  const rows = items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}${i.variant_name ? ' (' + esc(i.variant_name) + ')' : ''}${i.sku ? '<br><small>' + esc(i.sku) + '</small>' : ''}</td><td class="r">${i.qty}</td>${kind === 'invoice' ? `<td class="r">${rupee(i.price)}</td><td class="r">${rupee(i.price * i.qty)}</td>` : ''}</tr>`).join('');
  const addrHtml = `${esc(a.name)}<br>${esc(a.line1)}${a.line2 ? ', ' + esc(a.line2) : ''}${a.landmark ? '<br>' + esc(a.landmark) : ''}<br>${esc(a.city)}, ${esc(a.state)} - ${esc(a.pincode)}<br>Phone: ${esc(a.phone || o.phone)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${kind === 'invoice' ? 'Invoice' : 'Packing slip'} ${esc(o.number)}</title><style>
  body{font:14px/1.5 system-ui,Arial,sans-serif;color:#111;margin:0;padding:28px;max-width:820px;margin:auto}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:18px 0}
  th,td{border-bottom:1px solid #ddd;padding:8px 6px;text-align:left;vertical-align:top}.r{text-align:right}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.tot td{border:0;padding:3px 6px}small{color:#666}
  .cod{border:2px solid #111;padding:10px;font-size:18px;font-weight:700;margin:12px 0}@media print{button{display:none}body{padding:0}}</style></head><body>
  <button onclick="print()">Print</button>
  <div class="grid"><div><h1>${esc(B.name)}</h1><small>${esc(B.legal_name)}<br>${esc(B.address)} ${esc(B.city)} ${esc(B.state)} ${esc(B.pincode)}<br>${esc(B.phone)} ${esc(B.email)}${gst && B.gstin ? '<br>GSTIN: ' + esc(B.gstin) : ''}</small></div>
  <div class="r"><b>${kind === 'invoice' ? (gst ? 'TAX INVOICE' : 'INVOICE / BILL OF SUPPLY') : 'PACKING SLIP'}</b><br>${esc(o.invoice_no || o.number)}<br>Order ${esc(o.number)}<br>${esc(new Date(o.placed_at).toLocaleDateString('en-IN'))}</div></div>
  <div class="grid" style="margin-top:18px"><div><b>Ship to</b><br>${addrHtml}</div><div><b>Payment</b><br>${o.payment_method === 'cod' ? 'Cash on delivery' : 'UPI'}${o.utr ? '<br>UTR: ' + esc(o.utr) : ''}</div></div>
  ${kind === 'slip' && o.payment_method === 'cod' ? `<div class="cod">COLLECT ${rupee(orders.dueOnDelivery(o))} (COD)${orders.hasAdvance(o) && o.advance_status === 'verified' ? ` &middot; advance ${rupee(o.advance_amount)} already paid` : ''}</div>` : ''}
  <table><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th>${kind === 'invoice' ? '<th class="r">Rate</th><th class="r">Amount</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
  ${kind === 'invoice' ? `<table class="tot" style="width:320px;margin-left:auto"><tr><td>Subtotal</td><td class="r">${rupee(o.subtotal)}</td></tr>${o.discount ? `<tr><td>Discount ${o.coupon_code ? '(' + esc(o.coupon_code) + ')' : ''}</td><td class="r">-${rupee(o.discount)}</td></tr>` : ''}
  <tr><td>Shipping</td><td class="r">${rupee(o.shipping)}</td></tr>${o.cod_fee ? `<tr><td>COD fee</td><td class="r">${rupee(o.cod_fee)}</td></tr>` : ''}${o.gift_fee ? `<tr><td>Gift wrap</td><td class="r">${rupee(o.gift_fee)}</td></tr>` : ''}
  ${gst && o.gst_amount ? `<tr><td>GST included</td><td class="r">${rupee(o.gst_amount)}</td></tr>` : ''}<tr><td><b>Total</b></td><td class="r"><b>${rupee(o.total)}</b></td></tr></table>
  <small>${gst ? '' : 'Seller is not registered under GST. '}Thank you for shopping with ${esc(B.name)}. Replacement/refund for damaged or defective items within ${settings.get('returns').window_days} days of delivery.</small>` : `<small>Fragile? ${o.has_battery ? 'Contains a lithium battery. ' : ''}${o.customer_note ? 'Customer note: ' + esc(o.customer_note) : ''}</small>`}
  </body></html>`;
}
for (const kind of ['invoice', 'slip']) {
  r.get(`/:id/${kind}`, asyncH((req, res) => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(int(req.params.id));
    if (!o) throw notFound();
    const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id);
    res.type('html').send(doc(o, items, kind));
  }));
}
r.get('/export/csv', asyncH((req, res) => {
  const { w, args } = listWhere(req.query);
  const rows = db.prepare(`SELECT * FROM orders WHERE ${w} ORDER BY id DESC LIMIT 20000`).all(...args);
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="orders.csv"').send(toCSV(['Order', 'Date', 'Name', 'Phone', 'City', 'Pincode', 'Status', 'Payment', 'Payment status', 'Total', 'Courier', 'Tracking'],
    rows.map(o => { const a = addr(o); return [o.number, o.placed_at, o.name, o.phone, a.city, a.pincode, o.status, o.payment_method, o.payment_status, o.total, o.courier, o.tracking_no]; })));
}));

module.exports = r;

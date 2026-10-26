'use strict';
const db = require('./db');
const settings = require('./settings');
const pricing = require('./pricing');
const mail = require('./mail');
const { now, jstr, jparse, orderNumber, token, normPhone, isPhone, isEmail, isPin, isUTR, bad, HttpError, hashIp, round2 } = require('./util');

const STATUSES = ['placed', 'payment_pending', 'cod_confirm', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned'];
const NEXT = {
  placed: ['payment_pending', 'cod_confirm', 'confirmed', 'cancelled'],
  payment_pending: ['confirmed', 'cancelled'],
  cod_confirm: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled', 'returned'],
  delivered: ['returned'],
  cancelled: [], returned: [],
};

function addEvent(orderId, status, note, actor) {
  db.prepare('INSERT INTO order_events(order_id,status,note,actor,created_at) VALUES(?,?,?,?,?)').run(orderId, status, note || null, actor || 'system', now());
}

function validateAddress(a) {
  if (!a || typeof a !== 'object') throw bad('Please enter your address.');
  const out = {
    name: String(a.name || '').trim().slice(0, 80), phone: normPhone(a.phone), line1: String(a.line1 || '').trim().slice(0, 160), line2: String(a.line2 || '').trim().slice(0, 160),
    landmark: String(a.landmark || '').trim().slice(0, 100), pincode: String(a.pincode || '').trim(), city: String(a.city || '').trim().slice(0, 60), state: String(a.state || '').trim().slice(0, 60),
  };
  if (out.name.length < 2) throw bad('Please enter your full name.', { field: 'name' });
  if (!isPhone(out.phone)) throw bad('Enter a valid 10-digit mobile number.', { field: 'phone' });
  if (out.line1.length < 5) throw bad('Please enter your house / street address.', { field: 'line1' });
  if (!isPin(out.pincode)) throw bad('Enter a valid 6-digit pincode.', { field: 'pincode' });
  if (out.city.length < 2) throw bad('Please enter your city.', { field: 'city' });
  if (out.state.length < 2) throw bad('Please enter your state.', { field: 'state' });
  return out;
}

/** Create an order. Stock is checked and reduced inside one SQLite transaction, so the last piece can only be sold once. */
function createOrder(body, ctx) {
  const P = settings.get('payments'), ST = settings.get('store');
  if (ST.maintenance) throw new HttpError(503, 'The store is temporarily closed.');
  const address = validateAddress(body.address);
  const email = body.email ? String(body.email).trim().toLowerCase() : '';
  if (email && !isEmail(email)) throw bad('Enter a valid email address.', { field: 'email' });
  const method = body.method === 'cod' ? 'cod' : 'upi';
  if (!ST.guest_checkout && !ctx.customer) throw new HttpError(401, 'Please log in to place an order.');

  // consents: terms + (if needed) safety
  const c = body.consents || {};
  if (!c.terms) throw bad('Please accept the Terms, Privacy and Return policies to continue.', { field: 'terms' });

  const priced = pricing.priceCart(body.items, {
    coupon: body.coupon, pincode: address.pincode, method, gift: !!body.gift,
    identity: { email, phone: address.phone, customer_id: ctx.customer?.id },
  });
  if (priced.errors.length) throw bad(priced.errors[0], { errors: priced.errors });
  if (priced.lines.some(l => l.ok && l.issue)) throw bad('Some quantities changed because of stock. Please review your cart.');
  if (priced.needs_safety_ack && !c.safety) throw bad('Please confirm that you have read the safety instructions.', { field: 'safety' });
  if (method === 'upi' && !priced.upi_ok) throw bad('UPI payment is not available right now.');
  if (method === 'cod' && !priced.cod.ok) throw bad(priced.cod.message || 'Cash on delivery is not available.');
  if (priced.coupon && body.coupon && !priced.coupon.ok) throw bad(priced.coupon.message);
  if (ctx.customer?.blocked) throw new HttpError(403, 'We are unable to take this order. Please contact support.');
  const blockedPhone = db.prepare('SELECT 1 FROM customers WHERE phone=? AND blocked=1 LIMIT 1').get(address.phone);
  if (blockedPhone) throw new HttpError(403, 'We are unable to take this order. Please contact support.');

  // risk flags for COD
  let risky = 0, riskReason = '';
  if (method === 'cod') {
    const bads = db.prepare("SELECT COUNT(*) c FROM orders WHERE phone=? AND status IN ('cancelled','returned') AND payment_method='cod'").get(address.phone).c;
    if (bads >= 2) { risky = 1; riskReason = `${bads} earlier COD orders were cancelled or returned`; }
    else if (priced.total > 3000) { risky = 1; riskReason = 'High-value COD order'; }
  }

  const run = db.transaction(() => {
    // duplicate guard: same phone + same total in last 2 minutes
    const dup = db.prepare("SELECT * FROM orders WHERE phone=? AND total=? AND placed_at > ? AND status NOT IN ('cancelled') ORDER BY id DESC LIMIT 1")
      .get(address.phone, priced.total, new Date(Date.now() - 120000).toISOString());
    if (dup) return { order: dup, duplicate: true };

    // stock lock
    for (const l of priced.lines) {
      if (!l.ok) continue;
      const p = db.prepare('SELECT preorder FROM products WHERE id=?').get(l.product_id);
      if (p.preorder) continue;
      let r;
      if (l.variant_id) r = db.prepare('UPDATE variants SET stock=stock-? WHERE id=? AND stock>=?').run(l.qty, l.variant_id, l.qty);
      else r = db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(l.qty, l.product_id, l.qty);
      if (!r.changes) throw new HttpError(409, `Sorry, "${l.name}" just went out of stock.`, { out_of_stock: l.product_id });
    }
    const ts = now();
    const number = (() => { for (let i = 0; i < 8; i++) { const n = orderNumber(); if (!db.prepare('SELECT 1 FROM orders WHERE number=?').get(n)) return n; } throw new Error('order number'); })();
    const status = method === 'upi' ? 'payment_pending' : (P.cod_phone_confirm ? 'cod_confirm' : 'confirmed');
    const payStatus = method === 'upi' ? 'pending' : 'cod_due';
    const expires = method === 'upi' ? new Date(Date.now() + ((P.upi_timer_min || 15) + (P.upi_grace_min || 60)) * 60000).toISOString() : null;
    const info = db.prepare(`INSERT INTO orders(number,customer_id,email,phone,name,address,status,payment_method,payment_status,subtotal,discount,coupon_code,shipping,cod_fee,gift_fee,gst_amount,total,
      gift,customer_note,risky,risk_reason,placed_at,expires_at,ip,ua,lang,access_token,has_battery,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      number, ctx.customer?.id || null, email || null, address.phone, address.name, jstr(address), status, method, payStatus, priced.subtotal, priced.discount,
      priced.coupon?.ok ? priced.coupon.code : null, priced.shipping + priced.packaging, priced.cod_fee, priced.gift_fee, priced.gst.amount, priced.total,
      body.gift ? jstr({ wrap: true, message: String(body.gift_message || '').slice(0, 200) }) : null, String(body.note || '').slice(0, 300) || null, risky, riskReason || null,
      ts, expires, hashIp(ctx.ip), String(ctx.ua || '').slice(0, 200), body.lang === 'hi' ? 'hi' : 'en', token(16), priced.has_battery ? 1 : 0, ts);
    const orderId = info.lastInsertRowid;
    const ins = db.prepare('INSERT INTO order_items(order_id,product_id,variant_id,name,variant_name,sku,qty,price,mrp,cost,image,gst_rate,hsn) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const l of priced.lines) if (l.ok) {
      const cost = unitCost(l.product_id, l.variant_id, l.cost);
      ins.run(orderId, l.product_id, l.variant_id, l.name, l.variant_name, l.sku, l.qty, l.price, l.mrp, cost, l.image, l.gst_rate, l.hsn);
      db.prepare('UPDATE products SET sold_count=sold_count+? WHERE id=?').run(l.qty, l.product_id);
    }
    if (priced.coupon?.ok) db.prepare('UPDATE coupons SET used_count=used_count+1 WHERE UPPER(code)=UPPER(?)').run(priced.coupon.code);
    addEvent(orderId, status, method === 'upi' ? 'Waiting for UPI payment' : 'Cash on delivery', 'customer');
    // consents
    const ip = hashIp(ctx.ip), ua = String(ctx.ua || '').slice(0, 200);
    const addC = (kind, slug, accepted = 1) => {
      const pol = slug ? db.prepare('SELECT version FROM policies WHERE slug=?').get(slug) : null;
      db.prepare('INSERT INTO consents(customer_id,order_id,email,phone,kind,policy_slug,policy_version,accepted,ip_hash,ua,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(ctx.customer?.id || null, orderId, email || null, address.phone, kind, slug, pol?.version || null, accepted, ip, ua, ts);
    };
    for (const slug of ['terms', 'privacy', 'returns']) addC('terms', slug);
    if (priced.has_battery || priced.needs_safety_ack) addC('safety', 'safety');
    if (c.marketing) { addC('marketing', null); if (email) try { db.prepare('INSERT OR IGNORE INTO newsletter(email,created_at) VALUES(?,?)').run(email, ts); } catch { /* ignore */ } }
    // save customer's contact details if logged in
    if (ctx.customer) {
      db.prepare('UPDATE customers SET phone=COALESCE(phone,?), name=COALESCE(NULLIF(name,\'\'),?) WHERE id=?').run(address.phone, address.name, ctx.customer.id);
      if (body.save_address) saveAddress(ctx.customer.id, address);
      if (c.marketing) db.prepare('UPDATE customers SET marketing_optin=1 WHERE id=?').run(ctx.customer.id);
    }
    return { order: db.prepare('SELECT * FROM orders WHERE id=?').get(orderId), duplicate: false };
  });
  const res = run();
  if (!res.duplicate) {
    mail.queueOrderMessage(res.order, 'placed');
    if (res.order.status === 'payment_pending') mail.queueOrderMessage(res.order, 'payment_pending');
  }
  return res;
}

function saveAddress(customerId, a) {
  const exists = db.prepare('SELECT id FROM addresses WHERE customer_id=? AND line1=? AND pincode=?').get(customerId, a.line1, a.pincode);
  if (exists) return exists.id;
  const first = !db.prepare('SELECT 1 FROM addresses WHERE customer_id=?').get(customerId);
  return db.prepare('INSERT INTO addresses(customer_id,label,name,phone,line1,line2,landmark,pincode,city,state,is_default) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(customerId, 'Home', a.name, a.phone, a.line1, a.line2, a.landmark, a.pincode, a.city, a.state, first ? 1 : 0).lastInsertRowid;
}

// cost used for profit: FIFO from purchase batches if present, else product/variant cost
function unitCost(productId, variantId, fallback) {
  const rows = db.prepare('SELECT * FROM purchases WHERE product_id=? AND qty_left>0 ORDER BY purchased_at, id').all(productId);
  if (rows.length) return rows[0].unit_landed;
  const last = db.prepare('SELECT unit_landed FROM purchases WHERE product_id=? ORDER BY purchased_at DESC, id DESC LIMIT 1').get(productId);
  return last ? last.unit_landed : (fallback || 0);
}

function consumeBatches(orderId) {
  const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(orderId);
  for (const it of items) {
    let need = it.qty;
    const rows = db.prepare('SELECT id, qty_left FROM purchases WHERE product_id=? AND qty_left>0 ORDER BY purchased_at, id').all(it.product_id);
    for (const r of rows) { if (need <= 0) break; const take = Math.min(r.qty_left, need); db.prepare('UPDATE purchases SET qty_left=qty_left-? WHERE id=?').run(take, r.id); need -= take; }
  }
}

function releaseStock(order) {
  if (order.stock_released) return;
  const items = db.prepare('SELECT product_id, variant_id, qty FROM order_items WHERE order_id=?').all(order.id);
  for (const it of items) {
    const p = db.prepare('SELECT preorder FROM products WHERE id=?').get(it.product_id);
    if (p?.preorder) continue;
    if (it.variant_id) db.prepare('UPDATE variants SET stock=stock+? WHERE id=?').run(it.qty, it.variant_id);
    else db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(it.qty, it.product_id);
    db.prepare('UPDATE products SET sold_count=MAX(0,sold_count-?) WHERE id=?').run(it.qty, it.product_id);
  }
  if (order.coupon_code) db.prepare('UPDATE coupons SET used_count=MAX(0,used_count-1) WHERE UPPER(code)=UPPER(?)').run(order.coupon_code);
  db.prepare('UPDATE orders SET stock_released=1 WHERE id=?').run(order.id);
}

const MSG_FOR = { confirmed: 'confirmed', packed: 'packed', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled' };

function setStatus(orderId, to, { actor = 'system', note = '', reason = '', force = false, silent = false } = {}) {
  const run = db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.status === to) return o;
    if (!force && !(NEXT[o.status] || []).includes(to)) throw bad(`Cannot change order from "${o.status}" to "${to}".`);
    const ts = now(); const sets = ['status=?', 'updated_at=?']; const args = [to, ts];
    if (to === 'confirmed') { sets.push('confirmed_at=?'); args.push(ts); if (o.payment_method === 'cod') { sets.push('cod_confirmed=1', 'cod_confirmed_at=?'); args.push(ts); } }
    if (to === 'shipped') { sets.push('shipped_at=?'); args.push(ts); }
    if (to === 'delivered') {
      sets.push('delivered_at=?'); args.push(ts);
      if (o.payment_method === 'cod') sets.push("payment_status='cod_collected'");
    }
    if (to === 'cancelled') { sets.push('cancelled_at=?', 'cancel_reason=?'); args.push(ts, reason || note || null); }
    if (['confirmed'].includes(to) && !o.invoice_no) { sets.push('invoice_no=?'); args.push('INV-' + o.number.replace('SY-', '')); }
    args.push(orderId);
    db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id=?`).run(...args);
    const fresh = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if (to === 'cancelled') releaseStock(fresh);
    if (to === 'confirmed') consumeBatches(orderId);
    addEvent(orderId, to, note || reason, actor);
    return fresh;
  });
  const o = run();
  if (!silent && MSG_FOR[to]) mail.queueOrderMessage(o, MSG_FOR[to]);
  return o;
}

function submitUTR(order, utr, screenshotFile) {
  if (order.payment_method !== 'upi') throw bad('This order is not a UPI order.');
  if (order.status === 'cancelled') throw bad('This order was cancelled. Please place a new order.');
  if (order.payment_status === 'verified') throw bad('Payment is already verified.');
  const u = String(utr || '').trim();
  if (!isUTR(u)) throw bad('Enter the transaction ID (UTR) from your UPI app. It is 12 digits or letters.');
  const used = db.prepare("SELECT 1 FROM orders WHERE utr=? AND id<>? AND payment_status IN ('submitted','verified')").get(u, order.id);
  if (used) throw bad('This transaction ID was already used for another order.');
  db.prepare("UPDATE orders SET utr=?, payment_status='submitted', payment_screenshot=COALESCE(?,payment_screenshot), updated_at=? WHERE id=?").run(u, screenshotFile || null, now(), order.id);
  addEvent(order.id, order.status, `Customer submitted UTR ${u}`, 'customer');
}

function verifyPayment(orderId, actor, ok, note) {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if (!o) throw new HttpError(404, 'Order not found');
  if (o.payment_method !== 'upi') throw bad('Only UPI orders need payment verification.');
  if (ok) {
    db.prepare("UPDATE orders SET payment_status='verified', updated_at=? WHERE id=?").run(now(), orderId);
    addEvent(orderId, o.status, 'Payment verified' + (note ? ': ' + note : ''), actor);
    if (o.status === 'payment_pending' || o.status === 'placed') return setStatus(orderId, 'confirmed', { actor, note: 'Payment verified' });
    return db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  }
  db.prepare("UPDATE orders SET payment_status='rejected', utr=NULL, updated_at=? WHERE id=?").run(now(), orderId);
  addEvent(orderId, o.status, 'Payment rejected' + (note ? ': ' + note : ''), actor);
  mail.queueOrderMessage(db.prepare('SELECT * FROM orders WHERE id=?').get(orderId), 'payment_rejected');
  return db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
}

function expireUnpaid() {
  const rows = db.prepare("SELECT id FROM orders WHERE status='payment_pending' AND payment_status IN ('pending','rejected') AND expires_at IS NOT NULL AND expires_at < ?").all(now());
  for (const r of rows) { try { setStatus(r.id, 'cancelled', { actor: 'system', reason: 'Payment not received in time', silent: false }); } catch { /* ignore */ } }
  return rows.length;
}

function serializeForCustomer(o) {
  const items = db.prepare('SELECT name, variant_name, qty, price, image, product_id FROM order_items WHERE order_id=?').all(o.id);
  const events = db.prepare('SELECT status, note, actor, created_at FROM order_events WHERE order_id=? ORDER BY id').all(o.id).filter(e => e.actor !== 'admin-note');
  const reqs = db.prepare('SELECT id, type, reason, status, created_at FROM order_requests WHERE order_id=? ORDER BY id DESC').all(o.id);
  const R = settings.get('returns');
  let canRequest = false;
  if (o.status === 'delivered' && o.delivered_at) {
    canRequest = (Date.now() - new Date(o.delivered_at).getTime()) <= R.window_days * 86400000 && !reqs.some(r => ['open', 'approved'].includes(r.status));
  }
  return {
    number: o.number, status: o.status, payment_method: o.payment_method, payment_status: o.payment_status, name: o.name, phone_last4: String(o.phone).slice(-4),
    address: jparse(o.address, {}), subtotal: o.subtotal, discount: o.discount, coupon_code: o.coupon_code, shipping: o.shipping, cod_fee: o.cod_fee, gift_fee: o.gift_fee, total: o.total,
    gst_amount: o.gst_amount, utr: o.utr, courier: o.courier, tracking_no: o.tracking_no, tracking_url: o.tracking_url, placed_at: o.placed_at, expires_at: o.expires_at,
    delivered_at: o.delivered_at, cancel_reason: o.cancel_reason, items, events, requests: reqs, can_request: canRequest, return_window_days: R.window_days,
    invoice_no: o.invoice_no, cod_confirmed: !!o.cod_confirmed,
  };
}

module.exports = { STATUSES, NEXT, createOrder, setStatus, submitUTR, verifyPayment, expireUnpaid, addEvent, releaseStock, serializeForCustomer, saveAddress, validateAddress, unitCost };

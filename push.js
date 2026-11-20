// Phone notifications for the owner (Web Push). Free. The signing key is made on first use and kept in the private folder on this server.
// Never throws and never delays an order.
const fs = require('fs'), path = require('path');
const db = require('./db'), cfg = require('./config'), settings = require('./settings');
const { now, itemImage } = require('./util');

db.exec(`CREATE TABLE IF NOT EXISTS push_subs(id INTEGER PRIMARY KEY, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, ua TEXT, created_at TEXT NOT NULL, last_ok TEXT)`);

let wp = null, keys = null;
function lib() { if (wp === null) { try { wp = require('web-push'); } catch { wp = false; } } return wp; }
function vapid() {
  if (keys) return keys;
  const f = path.join(cfg.PRIVATE, 'vapid.json');
  try { keys = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* make new */ }
  if (!keys || !keys.publicKey) { const w = lib(); if (!w) return null; keys = w.generateVAPIDKeys(); try { fs.writeFileSync(f, JSON.stringify(keys), { mode: 0o600 }); } catch { /* */ } }
  return keys;
}
const publicKey = () => { const k = vapid(); return k ? k.publicKey : ''; };
const count = () => db.prepare('SELECT COUNT(*) c FROM push_subs').get().c;

function subscribe(sub, ua) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
  db.prepare('INSERT INTO push_subs(endpoint,p256dh,auth,ua,created_at) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, ua=excluded.ua')
    .run(sub.endpoint.slice(0, 600), String(sub.keys.p256dh).slice(0, 200), String(sub.keys.auth).slice(0, 100), String(ua || '').slice(0, 200), now());
  return true;
}
const unsubscribe = endpoint => db.prepare('DELETE FROM push_subs WHERE endpoint=?').run(String(endpoint || ''));

const inr = n => '₹' + (Math.round((Number(n) || 0) * 100) / 100).toString();
const on = ev => { try { return settings.get('push')[ev] !== false; } catch { return true; } };
const lockHide = () => { try { return settings.get('push').lock_hide === true; } catch { return false; } };

/** Send one notification to every phone that turned them on. `ev` is the on/off key from Admin > Notifications. */
async function send(ev, n) {
  try {
    const w = lib(), k = vapid(); if (!w || !k) return 0;
    if (ev && ev !== 'test' && !on(ev)) return 0;
    const subs = db.prepare('SELECT * FROM push_subs').all(); if (!subs.length) return 0;
    const brand = settings.get('brand').name || 'SURYA';
    w.setVapidDetails('mailto:' + (settings.get('brand').email || 'owner@example.com'), k.publicKey, k.privateKey);
    const mk = n2 => JSON.stringify({ title: n2.title, body: n2.body, image: n2.image || undefined, url: n2.url || './', tag: n2.tag || undefined, actions: n2.actions || [], data: n2.data || {}, brand, lockHide: lockHide(), publicBody: n2.publicBody || undefined });
    let payload = mk(n);
    if (Buffer.byteLength(payload) > 3500 && n.data && n.data.wa) payload = mk({ ...n, data: { ...n.data, wa: null }, actions: (n.actions || []).filter(a => a.action !== 'wa') }); // push messages are limited to about 4 KB
    let ok = 0;
    await Promise.all(subs.map(async s => {
      try { await w.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12, urgency: 'high' }); ok++; db.prepare('UPDATE push_subs SET last_ok=? WHERE id=?').run(now(), s.id); }
      catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) db.prepare('DELETE FROM push_subs WHERE id=?').run(s.id); }
    }));
    return ok;
  } catch { return 0; }
}
const later = fn => { try { setImmediate(() => { Promise.resolve().then(fn).catch(() => {}); }); } catch { /* */ } };

/* ---- events (each one is fire-and-forget) ---- */
function orderRow(id) { return db.prepare('SELECT * FROM orders WHERE id=?').get(id); }
function firstItem(orderId) { const i = db.prepare('SELECT name, qty, image FROM order_items WHERE order_id=? ORDER BY id').all(orderId); return { first: i[0], n: i.length }; }
function waRow(orderId) { return db.prepare("SELECT id, link FROM outbox WHERE order_id=? AND channel='whatsapp' AND status='manual' ORDER BY id DESC LIMIT 1").get(orderId); }
function payLine(o) {
  if (o.payment_method === 'upi') return 'UPI';
  const adv = Number(o.advance_amount) || 0;
  return adv ? `COD · ${inr(adv)} advance, ${inr(Math.max(0, Number(o.total) - adv))} on delivery` : 'COD';
}
function orderCard(o) {
  const { first, n } = firstItem(o.id), wa = waRow(o.id);
  let addr = {}; try { addr = JSON.parse(o.address || '{}'); } catch { /* */ }
  const prod = first ? `${first.name}${first.qty > 1 ? ' ×' + first.qty : ''}${n > 1 ? ` +${n - 1} more` : ''}` : '';
  const actions = []; if (wa) actions.push({ action: 'wa', title: 'WhatsApp bhejo' }); actions.push({ action: 'done', title: 'Done' });
  return { image: first && first.image ? cfg.SITE_URL + itemImage(first.image).replace(/-thumb\.webp$/, '-card.webp') : undefined,
    body: `${o.name || 'Customer'}${addr.city ? ' · ' + addr.city : ''}\n${prod}\n${payLine(o)} · ${o.number}`, url: `#/orders/${o.id}`, tag: 'order-' + o.id,
    actions, data: { orderId: o.id, outboxId: wa ? wa.id : null, wa: wa ? wa.link : null }, publicBody: 'Open the app to see the details.' };
}
const orderPlaced = o => later(() => { const row = orderRow(o.id) || o; if (row.payment_method === 'upi') return; send('order', { title: `🛒 New order ${inr(row.total)}`, ...orderCard(row) }); });
const paymentSubmitted = (o, utr) => later(() => { const row = orderRow(o.id) || o; send('payment', { title: `💸 Payment to check ${inr(row.pay_amount != null ? row.pay_amount : row.total)}`, ...orderCard(row), body: orderCard(row).body + `\nUTR ${utr}` }); });
const orderCancelled = (o, why) => later(() => { const row = orderRow(o.id) || o; send('cancel', { title: `✖ Order cancelled ${row.number}`, ...orderCard(row), body: `${row.name || ''}\n${why || ''}`.trim() }); });
const returnRequested = (o, type) => later(() => { const row = orderRow(o.id) || o; send('ret', { title: `↩ ${type === 'refund' ? 'Refund' : 'Replacement'} request ${row.number}`, ...orderCard(row) }); });
const lowStock = (name, left) => later(() => send('stock', { title: left > 0 ? `📦 Low stock: ${name}` : `📦 Out of stock: ${name}`, body: left > 0 ? `Only ${left} left.` : 'Sold out. Add stock or hide it.', url: '#/products', tag: 'stock-' + name, actions: [] }));
const contactMessage = (m) => later(() => send('contact', { title: `✉ New message${m.subject ? ': ' + m.subject : ''}`, body: `${m.name || ''}\n${String(m.message || '').slice(0, 140)}`, url: '#/messages', tag: 'contact', actions: [], publicBody: 'Open the app to read it.' }));
const newReview = (r) => later(() => send('review', { title: `⭐ New review ${r.rating || ''}/5`, body: String(r.text || r.body || '').slice(0, 140), url: '#/reviews', tag: 'review', actions: [], publicBody: 'Open the app to read it.' }));
const newCustomer = (c) => later(() => send('customer', { title: '👤 New customer account', body: c.name || '', url: '#/customers', tag: 'customer', actions: [], publicBody: 'A new customer signed up.' }));

module.exports = { publicKey, count, subscribe, unsubscribe, send, orderPlaced, paymentSubmitted, orderCancelled, returnRequested, lowStock, contactMessage, newReview, newCustomer };

// Phone notifications for customers (Web Push, free). Order updates always go out; offers follow strict limits:
// at most 1 per day per phone, never between 10 pm and 8 am (India time), and only if the customer left offers ON.
// Never throws and never delays an order or an admin save.
const db = require('./db'), cfg = require('./config'), settings = require('./settings'), push = require('./push');
const { now, itemImage } = require('./util');

db.exec(`CREATE TABLE IF NOT EXISTS push_cust(id INTEGER PRIMARY KEY, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, customer_id INTEGER NOT NULL, ua TEXT, offers INTEGER DEFAULT 1, consent_at TEXT, created_at TEXT NOT NULL, last_ok TEXT, last_offer_at TEXT)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pushcust_c ON push_cust(customer_id)`);
db.exec(`CREATE TABLE IF NOT EXISTS cart_snap(customer_id INTEGER PRIMARY KEY, items TEXT NOT NULL, updated_at TEXT NOT NULL, reminded_at TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS push_sent(kind TEXT NOT NULL, key TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(kind,key))`);

function subscribe(customerId, sub, ua) {
  if (!customerId || !sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
  const ts = now();
  db.prepare(`INSERT INTO push_cust(endpoint,p256dh,auth,customer_id,ua,offers,consent_at,created_at) VALUES(?,?,?,?,?,1,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, customer_id=excluded.customer_id, ua=excluded.ua`)
    .run(sub.endpoint.slice(0, 600), String(sub.keys.p256dh).slice(0, 200), String(sub.keys.auth).slice(0, 100), customerId, String(ua || '').slice(0, 200), ts, ts);
  return true;
}
const unsubscribe = (customerId, endpoint) => db.prepare('DELETE FROM push_cust WHERE endpoint=? AND customer_id=?').run(String(endpoint || ''), customerId);
const setOffers = (customerId, on) => db.prepare('UPDATE push_cust SET offers=? WHERE customer_id=?').run(on ? 1 : 0, customerId);
const status = customerId => { const r = db.prepare('SELECT COUNT(*) n, COALESCE(MAX(offers),0) o FROM push_cust WHERE customer_id=?').get(customerId); return { devices: r.n, offers: r.n ? !!r.o : true }; };
const countAll = () => db.prepare('SELECT COUNT(*) n FROM push_cust WHERE offers=1').get().n;

const istHour = () => new Date(Date.now() + 330 * 60000).getUTCHours();
const quiet = () => { const h = istHour(); return h >= 22 || h < 8; };
const istDay = d => new Date((d ? new Date(d).getTime() : Date.now()) + 330 * 60000).toISOString().slice(0, 10);
const inr = n => '₹' + (Math.round((Number(n) || 0) * 100) / 100).toString();
const first = s => String(s || 'there').trim().split(/\s+/)[0];

async function deliver(rows, n, { offer = false } = {}) {
  try {
    const w = push._lib(), k = push._vapid(); if (!w || !k || !rows.length) return 0;
    const brand = settings.get('brand').name || 'SURYA';
    w.setVapidDetails('mailto:' + (settings.get('brand').email || 'owner@example.com'), k.publicKey, k.privateKey);
    const payload = JSON.stringify({ title: n.title, body: n.body, image: n.image || undefined, url: n.url || '/', tag: n.tag || undefined, brand, kind: offer ? 'offer' : 'order', actions: n.actions || [{ action: 'view', title: 'View' }] });
    let ok = 0;
    await Promise.all(rows.map(async r => {
      try { await w.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload, { TTL: offer ? 60 * 60 * 24 : 60 * 60 * 48, urgency: offer ? 'normal' : 'high' }); ok++; db.prepare('UPDATE push_cust SET last_ok=?' + (offer ? ', last_offer_at=?' : '') + ' WHERE id=?').run(...(offer ? [now(), now(), r.id] : [now(), r.id])); }
      catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) db.prepare('DELETE FROM push_cust WHERE id=?').run(r.id); }
    }));
    return ok;
  } catch { return 0; }
}
/** Offers: only phones with offers ON, not nudged in the last 20 hours / today, and never at night. */
const offerOk = rows => quiet() ? [] : rows.filter(r => r.offers && (!r.last_offer_at || (istDay(r.last_offer_at) !== istDay() && Date.now() - new Date(r.last_offer_at).getTime() > 20 * 3600 * 1000)));
const later = fn => { try { setImmediate(() => { Promise.resolve().then(fn).catch(() => {}); }); } catch { /* */ } };

function prodCard(p) {
  const img = db.prepare('SELECT file FROM product_images WHERE product_id=? ORDER BY sort, id LIMIT 1').get(p.id);
  return { image: img ? cfg.SITE_URL + itemImage(img.file).replace(/-thumb\.webp$/, '-card.webp') : undefined, url: '/p/' + p.slug, tag: 'p-' + p.id };
}
const buyActions = [{ action: 'view', title: 'View' }, { action: 'buy', title: 'Buy now' }];

/* ---- order updates: the customer's own phones, no limits ---- */
const COPY = {
  confirmed: o => ({ title: `Order confirmed ✨`, body: `Hi ${first(o.name)}, your order ${o.number} is confirmed. We are getting it ready for you.` }),
  shipped: o => ({ title: `On its way 🚚`, body: `Hi ${first(o.name)}, your order ${o.number} has been shipped.${o.tracking_no ? ' Tracking: ' + o.tracking_no : ''}` }),
  cancelled: o => ({ title: `Order cancelled`, body: `Hi ${first(o.name)}, your order ${o.number} has been cancelled. If you had paid, we will get in touch about your refund.` }),
  payment_rejected: o => ({ title: `Payment needs a check`, body: `Hi ${first(o.name)}, we could not match the payment for order ${o.number}. Please open the order and send the transaction ID again.` }),
  delivered: o => ({ title: `Delivered 🎉`, body: `Hi ${first(o.name)}, your order ${o.number} has arrived. We hope you love it!` }),
};
const orderUpdate = (o, kind) => later(async () => {
  if (!o || !o.customer_id || !COPY[kind]) return;
  const rows = db.prepare('SELECT * FROM push_cust WHERE customer_id=?').all(o.customer_id); if (!rows.length) return;
  const row = db.prepare('SELECT * FROM orders WHERE id=?').get(o.id) || o;
  const it = db.prepare('SELECT product_id, image FROM order_items WHERE order_id=? ORDER BY id LIMIT 1').get(row.id);
  const url = `/order/${row.number}?t=${row.access_token}`;
  await deliver(rows, { ...COPY[kind](row), image: it && it.image ? cfg.SITE_URL + itemImage(it.image).replace(/-thumb\.webp$/, '-card.webp') : undefined, url, tag: 'order-' + row.id, actions: [{ action: 'view', title: 'Track order' }] });
});

/* ---- wishlist triggers (offer rules apply) ---- */
function wishRows(productId) { return db.prepare('SELECT pc.* FROM push_cust pc JOIN wishlist w ON w.customer_id=pc.customer_id WHERE w.product_id=?').all(productId); }
const priceDrop = (p, oldPrice, newPrice) => later(async () => {
  if (!(newPrice > 0) || !(oldPrice > newPrice) || (oldPrice - newPrice) / oldPrice < 0.03) return;
  const rows = offerOk(wishRows(p.id)); if (!rows.length) return;
  await deliver(rows, { title: `Price drop ✨ ${p.name}`, body: `Now ${inr(newPrice)} (was ${inr(oldPrice)}). Something you saved just got better.`, ...prodCard(p), actions: buyActions }, { offer: true });
});
const backInStock = p => later(async () => {
  const rows = offerOk(wishRows(p.id)); if (!rows.length) return;
  await deliver(rows, { title: `Back in stock 💛`, body: `${p.name} is available again. Grab yours before it goes.`, ...prodCard(p), actions: buyActions }, { offer: true });
});
const newProduct = p => later(async () => {
  if (db.prepare('SELECT 1 FROM push_sent WHERE kind=? AND key=?').get('new', String(p.id))) return;
  db.prepare('INSERT OR IGNORE INTO push_sent(kind,key,at) VALUES(?,?,?)').run('new', String(p.id), now());
  const rows = offerOk(db.prepare('SELECT * FROM push_cust').all()); if (!rows.length) return;
  await deliver(rows, { title: `Just arrived ✨`, body: `${p.name}, now at ${inr(p.price)}. Be the first to see it.`, ...prodCard(p), actions: buyActions }, { offer: true });
});


/* ---- cart reminder: one gentle nudge ~3 hours after a cart is left (offer rules apply) ---- */
function saveCart(customerId, list) {
  const items = (Array.isArray(list) ? list : []).slice(0, 30).map(i => ({ p: Math.trunc(Number(i.product_id)), v: i.variant_id ? Math.trunc(Number(i.variant_id)) : null, q: Math.max(1, Math.min(99, Math.trunc(Number(i.qty) || 1))) })).filter(i => i.p > 0);
  if (!items.length) { db.prepare('DELETE FROM cart_snap WHERE customer_id=?').run(customerId); return; }
  const cur = db.prepare('SELECT items FROM cart_snap WHERE customer_id=?').get(customerId);
  if (cur && cur.items === JSON.stringify(items)) return; // unchanged: keep the timer
  db.prepare('INSERT INTO cart_snap(customer_id,items,updated_at,reminded_at) VALUES(?,?,?,NULL) ON CONFLICT(customer_id) DO UPDATE SET items=excluded.items, updated_at=excluded.updated_at, reminded_at=NULL').run(customerId, JSON.stringify(items), now());
}
const clearCart = customerId => { try { db.prepare('DELETE FROM cart_snap WHERE customer_id=?').run(customerId); } catch { /* */ } };
async function cartSweep(afterHours = 3) {
  if (quiet()) return 0;
  const cutoff = new Date(Date.now() - afterHours * 3600e3).toISOString(), oldest = new Date(Date.now() - 72 * 3600e3).toISOString();
  const snaps = db.prepare('SELECT * FROM cart_snap WHERE reminded_at IS NULL AND updated_at<=? AND updated_at>=?').all(cutoff, oldest);
  let n = 0;
  for (const sn of snaps) {
    const rows = offerOk(db.prepare('SELECT * FROM push_cust WHERE customer_id=?').all(sn.customer_id));
    db.prepare('UPDATE cart_snap SET reminded_at=? WHERE customer_id=?').run(now(), sn.customer_id); // one nudge per cart, even if we cannot send
    if (!rows.length) continue;
    let items = []; try { items = JSON.parse(sn.items); } catch { /* */ }
    const prods = items.map(i => db.prepare("SELECT * FROM products WHERE id=? AND status='published' AND deleted_at IS NULL AND stock>0").get(i.p)).filter(Boolean);
    if (!prods.length) continue;
    const c = db.prepare('SELECT first_name,name FROM customers WHERE id=?').get(sn.customer_id) || {}, who = first(c.first_name || c.name);
    const p0 = prods[0], more = prods.length - 1;
    n += await deliver(rows, { title: `Your cart is waiting 🛍️`, body: `Hi ${who}, ${p0.name}${more > 0 ? ` and ${more} more` : ''} ${more > 0 ? 'are' : 'is'} still in your cart. Ready when you are.`, ...prodCard(p0), url: '/cart', tag: 'cart', actions: [{ action: 'view', title: 'View cart' }] }, { offer: true }) ? 1 : 0;
  }
  return n;
}

/* ---- owner broadcast ---- */
async function broadcast({ title, body, url, productId }) {
  const p = productId ? db.prepare('SELECT * FROM products WHERE id=?').get(productId) : null;
  const card = p ? prodCard(p) : {};
  const all = db.prepare('SELECT * FROM push_cust').all(), rows = offerOk(all);
  const sent = await deliver(rows, { title, body, url: url || card.url || '/', image: card.image, tag: 'bc-' + Date.now(), actions: p ? buyActions : undefined }, { offer: true });
  return { sent, skipped: all.length - rows.length, quiet: quiet() };
}

module.exports = { saveCart, clearCart, cartSweep, subscribe, unsubscribe, setOffers, status, countAll, orderUpdate, priceDrop, backInStock, newProduct, broadcast, quiet, offerOk };

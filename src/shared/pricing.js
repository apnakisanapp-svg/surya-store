'use strict';
const db = require('./db');
const settings = require('./settings');
const catalog = require('./catalog');
const { jparse, round2, isPin, normPhone, int, now } = require('./util');

function eta() {
  const s = settings.get('shipping');
  const d = new Date(); const f = n => { const x = new Date(d.getTime() + n * 86400000); return x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
  return { min: s.eta_min, max: s.eta_max, text: `${f(s.eta_min)} - ${f(s.eta_max)}` };
}

function checkPincode(pin, { battery = false } = {}) {
  const S = settings.get('shipping'), P = settings.get('payments');
  if (!isPin(pin)) return { ok: false, valid: false, message: 'Enter a valid 6-digit pincode.', cod: false };
  if ((S.block_pincodes || []).includes(String(pin))) return { ok: false, valid: true, message: 'Sorry, we do not deliver to this pincode yet.', cod: false };
  if (battery && (S.battery_block_pincodes || []).includes(String(pin))) return { ok: false, valid: true, message: 'This product cannot be shipped to this pincode (battery shipping restriction).', cod: false };
  const cod = !!P.cod_enabled && !(P.cod_block_pincodes || []).includes(String(pin));
  return { ok: true, valid: true, message: 'Delivery available', cod, eta: eta() };
}

function couponFor(code) {
  if (!code) return null;
  return db.prepare('SELECT * FROM coupons WHERE UPPER(code)=UPPER(?) AND deleted_at IS NULL').get(String(code).trim());
}

function priorOrderCount(identity, couponCode) {
  const ph = identity && identity.phone ? normPhone(identity.phone) : '', em = identity && identity.email ? String(identity.email).toLowerCase() : '';
  if (!ph && !em && !(identity && identity.customer_id)) return 0;
  const where = ["status NOT IN ('cancelled')"], args = [];
  const ors = [];
  if (ph) { ors.push('phone=?'); args.push(ph); }
  if (em) { ors.push('LOWER(email)=?'); args.push(em); }
  if (identity.customer_id) { ors.push('customer_id=?'); args.push(identity.customer_id); }
  where.push('(' + ors.join(' OR ') + ')');
  if (couponCode) { where.push('UPPER(coupon_code)=UPPER(?)'); args.push(couponCode); }
  return db.prepare(`SELECT COUNT(*) c FROM orders WHERE ${where.join(' AND ')}`).get(...args).c;
}

function validateCoupon(c, lines, subtotal, identity) {
  if (!c) return { ok: false, message: 'Coupon not found.' };
  const t = now();
  if (!c.active) return { ok: false, message: 'This coupon is not active.' };
  if (c.starts_at && c.starts_at > t) return { ok: false, message: 'This coupon is not live yet.' };
  if (c.expires_at && c.expires_at < t) return { ok: false, message: 'This coupon has expired.' };
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return { ok: false, message: 'This coupon has been fully used.' };
  if (subtotal < (c.min_cart || 0)) return { ok: false, message: `Add items worth ₹${Math.ceil(c.min_cart - subtotal)} more to use this coupon.` };
  if (c.first_order_only && priorOrderCount(identity, null) > 0) return { ok: false, message: 'This coupon is only for your first order.' };
  if (c.per_customer != null && priorOrderCount(identity, c.code) >= c.per_customer) return { ok: false, message: 'You have already used this coupon.' };
  const pids = jparse(c.product_ids, []), cids = jparse(c.category_ids, []);
  let eligible = lines.filter(l => l.ok);
  if (pids.length) eligible = eligible.filter(l => pids.includes(l.product_id));
  if (cids.length) eligible = eligible.filter(l => cids.includes(l.category_id));
  const base = eligible.reduce((s, l) => s + l.line_total, 0);
  if (!base && !c.free_shipping) return { ok: false, message: 'This coupon does not apply to the items in your cart.' };
  let d = c.type === 'flat' ? Math.min(c.value, base) : base * (c.value / 100);
  if (c.max_discount != null && c.max_discount > 0) d = Math.min(d, c.max_discount);
  return { ok: true, discount: round2(d), free_shipping: !!c.free_shipping, code: c.code, description: c.description || '', message: 'Coupon applied.' };
}

/**
 * items: [{product_id, variant_id, qty}]
 * opts: { coupon, pincode, method: 'upi'|'cod'|null, gift: bool, identity: {email, phone, customer_id} }
 * Nothing the browser says about prices is trusted: everything is recomputed here from the database.
 */
function priceCart(items, opts = {}) {
  const S = settings.get('shipping'), P = settings.get('payments'), B = settings.get('brand');
  const lines = [], errors = [];
  const merged = new Map();
  for (const it of (items || []).slice(0, 50)) {
    const k = `${int(it.product_id)}:${int(it.variant_id)}`;
    const qty = Math.max(1, Math.min(int(it.qty, 1), 99));
    merged.set(k, { product_id: int(it.product_id), variant_id: int(it.variant_id) || null, qty: (merged.get(k)?.qty || 0) + qty });
  }
  const catRows = db.prepare('SELECT id, name FROM categories').all();
  for (const it of merged.values()) {
    const p = db.prepare(`SELECT p.* FROM products p WHERE p.id=? AND ${catalog.LIVE_SQL}`).get(it.product_id, ...catalog.liveArgs());
    const line = { key: `${it.product_id}:${it.variant_id || 0}`, product_id: it.product_id, variant_id: it.variant_id, qty: it.qty, ok: false, issue: null };
    if (!p) { line.issue = 'unavailable'; line.name = 'Unavailable product'; lines.push(line); continue; }
    const variants = db.prepare('SELECT * FROM variants WHERE product_id=? AND active=1 ORDER BY sort,id').all(p.id);
    let v = null;
    if (variants.length) {
      v = variants.find(x => x.id === it.variant_id) || null;
      if (!v) { line.issue = 'variant'; }
    }
    const price = v && v.price != null ? v.price : p.price, mrp = v && v.mrp != null ? v.mrp : p.mrp;
    const avail = variants.length ? (v ? v.stock : 0) : p.stock;
    const img = db.prepare('SELECT file FROM product_images WHERE product_id=? AND (id=? OR ?=0) ORDER BY (id=?) DESC, sort, id LIMIT 1').get(p.id, v?.image_id || 0, v?.image_id ? 1 : 0, v?.image_id || 0);
    Object.assign(line, {
      slug: p.slug, name: p.name, name_hi: p.name_hi, variant_name: v ? v.name : null, variant_name_hi: v ? v.name_hi : null,
      sku: (v && v.sku) || p.sku, price, mrp: mrp > price ? mrp : 0, image: img ? `/media/${img.file}-thumb.webp` : null,
      max_qty: p.preorder ? Math.min(p.max_per_order || 10, 99) : Math.min(avail, p.max_per_order || 10),
      has_battery: !!p.has_battery, safety_ack: !!p.safety_ack, gst_rate: p.gst_rate || 0, hsn: p.hsn || '',
      cost: (v && v.cost) || p.cost || 0, category_id: p.category_id, preorder: !!p.preorder,
    });
    if (!line.issue) {
      if (p.sold_out && !p.preorder) line.issue = 'out';
      else if (!p.preorder && avail <= 0) line.issue = 'out';
      else if (!p.preorder && it.qty > avail) { line.issue = 'stock'; line.qty = avail; }
      else if (it.qty > (p.max_per_order || 10)) { line.issue = 'max'; line.qty = p.max_per_order || 10; }
    }
    line.ok = !line.issue || line.issue === 'stock' || line.issue === 'max';
    line.line_total = line.ok ? round2(line.price * line.qty) : 0;
    lines.push(line);
  }
  const okLines = lines.filter(l => l.ok && l.qty > 0);
  const subtotal = round2(okLines.reduce((s, l) => s + l.line_total, 0));
  const mrpTotal = round2(okLines.reduce((s, l) => s + (l.mrp || l.price) * l.qty, 0));
  const hasBattery = okLines.some(l => l.has_battery);

  let coupon = null, discount = 0, freeShipCoupon = false;
  if (opts.coupon) {
    coupon = validateCoupon(couponFor(opts.coupon), lines, subtotal, opts.identity);
    if (coupon.ok) { discount = Math.min(coupon.discount, subtotal); freeShipCoupon = coupon.free_shipping; }
  }
  const afterDiscount = round2(subtotal - discount);
  const freeAbove = S.free_above > 0 ? S.free_above : null;
  let shipping = okLines.length ? ((freeAbove && afterDiscount >= freeAbove) || freeShipCoupon ? 0 : S.flat) : 0;
  const packaging = okLines.length ? (S.packaging_fee || 0) : 0;
  const giftFee = opts.gift && S.gift_enabled && okLines.length ? S.gift_price : 0;

  let pin = null;
  if (opts.pincode) pin = checkPincode(opts.pincode, { battery: hasBattery });
  const codBase = !!P.cod_enabled && (!pin || pin.cod);
  const payTotalNoCod = round2(afterDiscount + shipping + packaging + giftFee);
  const codRangeOk = payTotalNoCod >= (P.cod_min || 0) && (!P.cod_max || payTotalNoCod + (P.cod_fee || 0) <= P.cod_max);
  let codMsg = '';
  if (!P.cod_enabled) codMsg = 'Cash on delivery is not available right now.';
  else if (pin && !pin.cod) codMsg = 'Cash on delivery is not available for this pincode.';
  else if (!codRangeOk) codMsg = P.cod_max && payTotalNoCod > P.cod_max ? `Cash on delivery is available up to ₹${P.cod_max}.` : `Cash on delivery needs a minimum order of ₹${P.cod_min}.`;
  const codOk = codBase && codRangeOk;
  const method = opts.method === 'cod' ? 'cod' : opts.method === 'upi' ? 'upi' : null;
  const codFee = method === 'cod' && codOk ? (P.cod_fee || 0) : 0;
  const total = round2(payTotalNoCod + codFee);

  let gstAmount = 0;
  if (B.gst_enabled) {
    const share = subtotal > 0 ? afterDiscount / subtotal : 1;
    for (const l of okLines) if (l.gst_rate) gstAmount += (l.line_total * share) * l.gst_rate / (100 + l.gst_rate);
    gstAmount = round2(gstAmount);
  }

  const needsSafety = okLines.some(l => l.safety_ack);
  if (okLines.length === 0) errors.push('Your cart is empty.');
  if (lines.some(l => !l.ok)) errors.push('Some items are no longer available.');
  if (pin && !pin.ok) errors.push(pin.message);

  return {
    lines, count: okLines.reduce((s, l) => s + l.qty, 0), subtotal, mrp_total: mrpTotal, savings: round2(Math.max(0, mrpTotal - subtotal) + discount),
    discount, coupon, shipping, packaging, gift_fee: giftFee, cod_fee: codFee, total, gst: { enabled: !!B.gst_enabled, amount: gstAmount, inclusive: true },
    free_above: freeAbove, free_shipping_remaining: freeAbove && !freeShipCoupon ? Math.max(0, round2(freeAbove - afterDiscount)) : 0,
    pincode: pin, cod: { ok: codOk, message: codMsg, fee: P.cod_fee || 0 }, upi_ok: !!P.upi_enabled && !!P.upi_id,
    has_battery: hasBattery, battery_notice: hasBattery ? S.battery_notice : '', needs_safety_ack: needsSafety, method, errors,
  };
}

module.exports = { priceCart, checkPincode, couponFor, validateCoupon, eta };

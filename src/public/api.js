'use strict';
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const db = require('../shared/db');
const cfg = require('../shared/config');
const settings = require('../shared/settings');
const catalog = require('../shared/catalog');
const pricing = require('../shared/pricing');
const orders = require('../shared/orders');
const images = require('../shared/images');
const mail = require('../shared/mail');
const auth = require('../shared/auth');
const U = require('../shared/util');
const { asyncH, bad, notFound, HttpError, now, jparse, int, sha256, token, isEmail, normPhone, isPhone, hashIp, ipOf } = U;

const api = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 3 } });
const lim = (windowMin, max, msg) => rateLimit({ windowMs: windowMin * 60000, limit: max, standardHeaders: true, legacyHeaders: false, message: { error: msg || 'Too many requests. Please wait a little and try again.' } });
const csrf = (req, res, next) => (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.headers['x-sy-csrf'] === '1') ? next() : res.status(403).json({ error: 'Blocked (missing security header).' });

api.use(csrf);
api.use(auth.optionalCustomer);
api.use(lim(1, 240));

/* ---------- public settings (never leaks the UPI ID, costs, keys) ---------- */
function publicBrand() {
  const b = settings.get('brand');
  return { name: b.name, tagline: b.tagline, legal_name: b.legal_name, address: b.address, city: b.city, state: b.state, pincode: b.pincode, email: b.email, phone: b.phone, whatsapp: b.whatsapp,
    gstin: b.gst_enabled ? b.gstin : '', gst_enabled: !!b.gst_enabled, grievance: b.grievance, support_hours: b.support_hours, holiday_notice: b.holiday_notice, social: b.social };
}
function bootstrap(req) {
  const S = settings.all(), P = S.payments, SH = S.shipping, ST = S.store, T = S.theme;
  const cats = db.prepare('SELECT id,parent_id,slug,name,name_hi,image,description,description_hi FROM categories WHERE active=1 AND deleted_at IS NULL ORDER BY sort,id').all()
    .map(c => ({ ...c, image: images.url(c.image, 'card') }));
  const pol = db.prepare('SELECT slug,title,title_hi,version,in_footer FROM policies ORDER BY sort,id').all();
  return {
    v: settings.lastUpdated(), brand: publicBrand(), theme: { preset: T.preset, logo: T.logo_url, logo_dark: T.logo_dark_url, favicon: T.favicon_url, show_logo_text: T.show_logo_text },
    intro: S.intro, announcement: S.announcement, store: { maintenance: ST.maintenance, default_lang: ST.default_lang, language_toggle: ST.language_toggle, dark_toggle: ST.dark_toggle, guest_checkout: ST.guest_checkout,
      recently_viewed: ST.recently_viewed, wishlist: ST.wishlist, reviews: ST.reviews, pwa: ST.pwa, currency: ST.currency },
    payments: { upi: P.upi_enabled && !!P.upi_id, cod: P.cod_enabled, cod_fee: P.cod_fee, cod_min: P.cod_min, cod_max: P.cod_max, upi_timer_min: P.upi_timer_min, upi_screenshot: P.upi_screenshot },
    shipping: { flat: SH.flat, free_above: SH.free_above, eta_min: SH.eta_min, eta_max: SH.eta_max, gift_enabled: SH.gift_enabled, gift_price: SH.gift_price, battery_notice: SH.battery_notice },
    returns: { window_days: S.returns.window_days, text: S.returns.text }, popups: S.popups, menu: S.menu, home: { trust: S.home.trust, eco: S.home.eco }, filters: S.filters, ui: S.ui, search: S.search,
    seo: { ga_id: S.seo.ga_id, meta_pixel: S.seo.meta_pixel }, categories: cats, policies: pol, customer: req && req.customer ? publicCustomer(req.customer) : null,
  };
}
const publicCustomer = c => ({ id: c.id, email: c.email, name: c.name, first_name: c.first_name || (c.name || '').split(' ')[0] || '', last_name: c.last_name || (c.name || '').split(' ').slice(1).join(' '), phone: c.phone, marketing_optin: !!c.marketing_optin, has_password: !!c.pass_hash });

api.get('/bootstrap', (req, res) => res.json(bootstrap(req)));

/* ---------- home ---------- */
api.get('/home', asyncH((req, res) => {
  const H = settings.get('home'), ts = now();
  const banners = db.prepare('SELECT * FROM banners WHERE active=1 AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?) ORDER BY sort,id').all(ts, ts)
    .map(b => ({ ...b, image: images.url(b.image, 'gal'), image_mobile: images.url(b.image_mobile, 'gal'), product: b.product_id ? (catalog.getById(b.product_id) || null) : null }));
  const out = [];
  for (const s of H.sections) {
    if (!s.enabled) continue;
    const sec = { ...s };
    if (s.type === 'products') {
      const sortMap = { trending: 'trending', new: 'new', popular: 'popular', offers: 'discount', featured: 'trending' };
      const r = catalog.listPublic({ sort: sortMap[s.source] || 'trending', limit: Math.min(int(s.limit, 8), 24), offers: s.source === 'offers', category: s.category || undefined, tag: s.tag || undefined });
      sec.items = r.items;
    } else if (s.type === 'testimonials') sec.items = db.prepare('SELECT name,city,text,text_hi,rating FROM testimonials WHERE active=1 ORDER BY sort,id').all();
    else if (s.type === 'faq') sec.items = db.prepare('SELECT q,a,q_hi,a_hi FROM faqs WHERE active=1 ORDER BY sort,id LIMIT 8').all();
    out.push(sec);
  }
  res.json({ banners, sections: out });
}));

/* ---------- catalog ---------- */
api.get('/products', asyncH((req, res) => {
  const q = req.query, r = catalog.listPublic({
    q: q.q ? String(q.q).slice(0, 80) : undefined, category: q.category, min: q.min, max: q.max, inStock: q.in_stock === '1', sort: q.sort || (q.q ? 'relevance' : 'trending'),
    page: q.page, limit: q.limit, offers: q.offers === '1', tag: q.tag,
    ids: q.ids ? String(q.ids).split(',').slice(0, 40).map(Number).filter(Boolean) : undefined,
  });
  if (q.q && int(q.page, 1) === 1) db.prepare('INSERT INTO search_log(term,results,created_at) VALUES(?,?,?)').run(String(q.q).toLowerCase().slice(0, 80), r.total, now());
  res.json(r);
}));
api.get('/suggest', asyncH((req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.json({ products: [], categories: [], popular: settings.get('search').popular || [] });
  const products = catalog.listPublic({ q, limit: 6, sort: 'relevance' }).items.map(p => ({ slug: p.slug, name: p.name, name_hi: p.name_hi, price: p.price, image: p.images[0]?.thumb || null }));
  const like = '%' + q.replace(/[%_]/g, '') + '%';
  const categories = db.prepare('SELECT slug,name,name_hi FROM categories WHERE active=1 AND deleted_at IS NULL AND (name LIKE ? OR name_hi LIKE ?) LIMIT 4').all(like, like);
  res.json({ products, categories });
}));
api.get('/products/:slug', asyncH((req, res) => {
  const p = catalog.getBySlug(req.params.slug);
  if (!p) {
    const r = db.prepare('SELECT to_path FROM redirects WHERE from_path=?').get('/p/' + req.params.slug);
    if (r) return res.status(301).json({ redirect: r.to_path });
    throw notFound('This product is not available.');
  }
  res.json({ product: p, similar: catalog.similar(p, 10) });
}));
api.get('/products/:slug/reviews', asyncH((req, res) => {
  const p = db.prepare('SELECT id FROM products WHERE slug=?').get(req.params.slug);
  if (!p) throw notFound();
  const page = Math.max(1, int(req.query.page, 1)), per = 8;
  const rows = db.prepare("SELECT id,name,rating,title,body,verified,reply,created_at FROM reviews WHERE product_id=? AND status='approved' ORDER BY created_at DESC LIMIT ? OFFSET ?").all(p.id, per, (page - 1) * per);
  const dist = db.prepare("SELECT rating, COUNT(*) c FROM reviews WHERE product_id=? AND status='approved' GROUP BY rating").all(p.id);
  res.json({ items: rows, dist, page });
}));
api.post('/products/:slug/reviews', lim(60, 8, 'Too many reviews from this device.'), asyncH((req, res) => {
  if (!settings.get('store').reviews) throw bad('Reviews are turned off.');
  const p = db.prepare('SELECT id FROM products WHERE slug=?').get(req.params.slug);
  if (!p) throw notFound();
  const b = req.body || {}, rating = int(b.rating);
  if (rating < 1 || rating > 5) throw bad('Please choose 1 to 5 stars.');
  const name = String(b.name || req.customer?.name || '').trim().slice(0, 60) || 'Customer';
  const body = String(b.body || '').trim().slice(0, 1200);
  if (body.length < 3) throw bad('Please write a few words about the product.');
  let verified = 0, orderId = null;
  const num_ = String(b.order || '').trim(), phone = normPhone(b.phone || req.customer?.phone);
  if (num_) {
    const o = db.prepare("SELECT o.id FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.number=? AND (o.phone=? OR o.customer_id=?) AND i.product_id=? AND o.status='delivered'").get(num_, phone, req.customer?.id || -1, p.id);
    if (o) { verified = 1; orderId = o.id; }
  }
  db.prepare('INSERT INTO reviews(product_id,customer_id,order_id,name,rating,title,body,verified,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(p.id, req.customer?.id || null, orderId, name, rating, String(b.title || '').slice(0, 100) || null, body, verified, 'pending', now());
  res.json({ ok: true, message: 'Thank you! Your review will appear after we check it.' });
}));

/* ---------- cart, pincode, coupons ---------- */
api.post('/cart/price', asyncH((req, res) => {
  const b = req.body || {};
  const r = pricing.priceCart(b.items, { coupon: b.coupon, pincode: b.pincode, method: b.method, gift: !!b.gift, identity: { email: b.email, phone: b.phone, customer_id: req.customer?.id } });
  res.json(r);
}));
api.get('/pincode/:pin', (req, res) => {
  const battery = req.query.product ? !!db.prepare('SELECT has_battery h FROM products WHERE id=?').get(int(req.query.product))?.h : false;
  res.json(pricing.checkPincode(req.params.pin, { battery }));
});
api.get('/coupons', (req, res) => res.json(db.prepare("SELECT code,type,value,min_cart,max_discount,description,expires_at FROM coupons WHERE active=1 AND show_public=1 AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at>?) AND (starts_at IS NULL OR starts_at<=?)").all(now(), now())));

/* ---------- checkout ---------- */
const ctxOf = req => ({ customer: req.customer, ip: ipOf(req), ua: req.headers['user-agent'] });
api.post('/orders', lim(10, +process.env.ORDER_RATE_MAX || 12, 'Too many orders from this device. Please wait a few minutes.'), asyncH((req, res) => {
  if (process.env.CATALOGUE_ONLY === '1') { const B = settings.get('brand'); const wa = String(B.whatsapp || B.phone || '').replace(/\D/g, '').slice(-10); throw bad('Orders are not taken on this preview website. Please order on WhatsApp' + (wa ? ': +91 ' + wa : '') + '.'); }
  const r = orders.createOrder(req.body || {}, ctxOf(req));
  res.json({ number: r.order.number, token: r.order.access_token, status: r.order.status, method: r.order.payment_method, total: r.order.total, advance: Number(r.order.advance_amount) || 0, duplicate: r.duplicate });
}));

function orderAccess(req) {
  const o = db.prepare('SELECT * FROM orders WHERE number=?').get(String(req.params.number).toUpperCase());
  if (!o) throw notFound('Order not found.');
  const t = String(req.query.t || req.body?.t || req.headers['x-order-token'] || '');
  if (t && t === o.access_token) return o;
  if (req.customer && o.customer_id === req.customer.id) return o;
  throw new HttpError(403, 'Please open this order from your tracking link, or use Track order with your phone number.');
}

api.post('/track', lim(15, 20, 'Too many tries. Please wait a few minutes.'), asyncH((req, res) => {
  const b = req.body || {};
  const o = db.prepare('SELECT * FROM orders WHERE number=?').get(String(b.number || '').trim().toUpperCase());
  if (!o || o.phone !== normPhone(b.phone)) throw bad('We could not find an order with that number and phone.');
  res.json({ order: orders.serializeForCustomer(o), token: o.access_token });
}));
api.get('/orders/:number', asyncH((req, res) => {
  const o = orderAccess(req);
  res.json({ order: orders.serializeForCustomer(o), token: o.access_token });
}));

api.get('/orders/:number/pay', asyncH(async (req, res) => {
  const o = orderAccess(req), P = settings.get('payments');
  if (o.payment_method !== 'upi' && !orders.hasAdvance(o)) throw bad('This order does not need an online payment.');
  if (!P.upi_id) throw bad('UPI is not set up yet. Please contact us.');
  const am = orders.payAmount(o).toFixed(2);
  const link = `upi://pay?pa=${encodeURIComponent(P.upi_id)}&pn=${encodeURIComponent(P.upi_name || settings.get('brand').name)}&am=${am}&cu=INR&tn=${encodeURIComponent('Order ' + o.number)}&tr=${encodeURIComponent(o.number)}`;
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
  const payBy = new Date(new Date(o.placed_at).getTime() + (P.upi_timer_min || 15) * 60000).toISOString();
  res.json({ upi_id: P.upi_id, name: P.upi_name, amount: Number(am), adjust: Number(o.upi_adjust || 0), advance: orders.hasAdvance(o) ? { amount: o.advance_amount, due_on_delivery: orders.dueOnDelivery({ ...o, advance_status: 'verified' }), note: P.cod_advance_note || '' } : null, link, qr, pay_by: payBy, expires_at: o.expires_at, status: o.status, payment_status: o.payment_status, screenshot: !!P.upi_screenshot });
}));
api.post('/orders/:number/utr', lim(15, 15), upload.single('screenshot'), asyncH(async (req, res) => {
  const o = orderAccess(req);
  let shot = null;
  if (req.file && settings.get('payments').upi_screenshot) shot = await images.processPrivate(req.file.buffer);
  orders.submitUTR(o, req.body?.utr, shot);
  res.json({ ok: true, message: 'Thank you. We will check your payment and confirm your order shortly.' });
}));
api.post('/orders/:number/cancel', lim(15, 10), asyncH((req, res) => {
  const o = orderAccess(req);
  if (!['placed', 'payment_pending', 'cod_confirm', 'confirmed'].includes(o.status)) throw bad('This order can no longer be cancelled here. Please contact us.');
  orders.setStatus(o.id, 'cancelled', { actor: 'customer', reason: String(req.body?.reason || 'Cancelled by customer').slice(0, 200) });
  res.json({ ok: true });
}));
api.post('/orders/:number/request', lim(60, 6), upload.array('photos', 3), asyncH(async (req, res) => {
  const o = orderAccess(req);
  const s = orders.serializeForCustomer(o);
  if (!s.can_request) throw bad(`Replacement or refund can be requested within ${s.return_window_days} days of delivery, once at a time.`);
  const type = req.body.type === 'refund' ? 'refund' : 'replace';
  const reason = String(req.body.reason || '').trim().slice(0, 800);
  if (reason.length < 5) throw bad('Please tell us what is wrong with the product.');
  const photos = [];
  for (const f of req.files || []) photos.push(await images.processPrivate(f.buffer));
  db.prepare('INSERT INTO order_requests(order_id,type,reason,photos,status,created_at) VALUES(?,?,?,?,?,?)').run(o.id, type, reason, JSON.stringify(photos), 'open', now());
  orders.addEvent(o.id, o.status, `Customer asked for ${type === 'refund' ? 'a refund' : 'a replacement'}`, 'customer');
  res.json({ ok: true, message: 'We received your request. We will reply within 48 hours.' });
}));

/* ---------- accounts ---------- */
const authLim = lim(15, 25, 'Too many tries. Please wait a few minutes.');
api.post('/auth/register', authLim, asyncH((req, res) => {
  const b = req.body || {}, email = String(b.email || '').trim().toLowerCase();
  if (!isEmail(email)) throw bad('Enter a valid email address.');
  if (String(b.password || '').length < 8) throw bad('Password must be at least 8 characters.');
  if (!b.terms) throw bad('Please accept the Terms and Privacy Policy.');
  if (db.prepare('SELECT 1 FROM customers WHERE email=?').get(email)) throw bad('An account with this email already exists. Please log in.');
  const phone = b.phone ? normPhone(b.phone) : null;
  if (phone && !isPhone(phone)) throw bad('Enter a valid 10-digit mobile number.');
  const id = db.prepare('INSERT INTO customers(email,phone,name,pass_hash,marketing_optin,ref_code,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(email, phone, String(b.name || '').trim().slice(0, 80) || null, bcrypt.hashSync(String(b.password), 10), b.marketing ? 1 : 0, token(4), now()).lastInsertRowid;
  for (const slug of ['terms', 'privacy']) {
    const pol = db.prepare('SELECT version FROM policies WHERE slug=?').get(slug);
    db.prepare('INSERT INTO consents(customer_id,email,phone,kind,policy_slug,policy_version,accepted,ip_hash,ua,created_at) VALUES(?,?,?,?,?,?,1,?,?,?)').run(id, email, phone, 'terms', slug, pol?.version || null, hashIp(ipOf(req)), String(req.headers['user-agent'] || '').slice(0, 200), now());
  }
  // guest orders are linked only after the email is proven with a login code (see /auth/otp/verify)
  auth.startCustomerSession(res, id);
  res.json({ customer: publicCustomer(db.prepare('SELECT * FROM customers WHERE id=?').get(id)) });
}));
api.post('/auth/login', authLim, asyncH((req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const c = db.prepare('SELECT * FROM customers WHERE email=? AND deleted_at IS NULL').get(email);
  if (!c || !c.pass_hash || !bcrypt.compareSync(String(req.body?.password || ''), c.pass_hash)) throw new HttpError(401, 'Wrong email or password.');
  if (c.blocked) throw new HttpError(403, 'This account is not available. Please contact support.');
  auth.startCustomerSession(res, c.id);
  res.json({ customer: publicCustomer(c) });
}));
/* ---- email login code (free, no password needed). Mobile number is just saved, not verified. ---- */
const otpHash = (email, code) => sha256(`${email}|${code}|${cfg.SALT}`);
api.post('/auth/otp/send', lim(15, 12, 'Too many codes asked. Please wait a few minutes.'), asyncH(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!isEmail(email)) throw bad('Enter a valid email address.');
  const last = db.prepare('SELECT created_at FROM otp_codes WHERE email=? ORDER BY id DESC LIMIT 1').get(email);
  if (last && Date.now() - new Date(last.created_at).getTime() < 45000) throw bad('A code was just sent. Please wait 45 seconds before asking again.');
  const hourly = db.prepare('SELECT COUNT(*) c FROM otp_codes WHERE email=? AND created_at>?').get(email, new Date(Date.now() - 3600e3).toISOString()).c;
  if (hourly >= 5) throw bad('Too many codes for this email. Please try again in an hour.');
  const c = db.prepare('SELECT blocked FROM customers WHERE email=? AND deleted_at IS NULL').get(email);
  if (c && c.blocked) throw new HttpError(403, 'This account is not available. Please contact support.');
  const code = String(require('crypto').randomInt(0, 1000000)).padStart(6, '0');
  db.prepare('UPDATE otp_codes SET used=1 WHERE email=? AND used=0').run(email);
  db.prepare('INSERT INTO otp_codes(email,code_hash,expires_at,created_at) VALUES(?,?,?,?)').run(email, otpHash(email, code), new Date(Date.now() + 10 * 60000).toISOString(), now());
  if (!(await mail.sendOtp(email, code))) throw bad('We could not send the email right now. Please use your password, or try again later.');
  res.json({ ok: true, message: 'We sent a 6-digit code to your email. It works for 10 minutes.' });
}));
api.post('/auth/otp/verify', authLim, asyncH((req, res) => {
  const b = req.body || {}, email = String(b.email || '').trim().toLowerCase(), code = String(b.code || '').replace(/\D/g, '');
  if (!isEmail(email) || code.length !== 6) throw bad('Enter the 6-digit code from your email.');
  const row = db.prepare('SELECT * FROM otp_codes WHERE email=? AND used=0 ORDER BY id DESC LIMIT 1').get(email);
  if (!row || row.expires_at < now()) throw bad('This code has expired. Please ask for a new one.');
  if (row.attempts >= 5) { db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id); throw bad('Too many wrong tries. Please ask for a new code.'); }
  if (row.code_hash !== otpHash(email, code)) { db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?').run(row.id); throw bad('That code is not right. Please check and try again.'); }
  let c = db.prepare('SELECT * FROM customers WHERE email=? AND deleted_at IS NULL').get(email), isNew = false;
  if (!c && !b.terms) throw bad('Please accept the Terms and Privacy Policy to create your account.'); // checked before the code is used up, so the person can tick and retry
  db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);
  const phone = b.phone ? normPhone(b.phone) : null;
  if (phone && !isPhone(phone)) throw bad('Enter a valid 10-digit mobile number.');
  if (!c) {
    if (!b.terms) throw bad('Please accept the Terms and Privacy Policy to create your account.');
    const id = db.prepare('INSERT INTO customers(email,phone,name,pass_hash,email_verified,marketing_optin,ref_code,created_at) VALUES(?,?,?,?,1,0,?,?)')
      .run(email, phone, String(b.name || '').trim().slice(0, 80) || null, null, token(4), now()).lastInsertRowid;
    for (const slug of ['terms', 'privacy']) {
      const pol = db.prepare('SELECT version FROM policies WHERE slug=?').get(slug);
      db.prepare('INSERT INTO consents(customer_id,email,phone,kind,policy_slug,policy_version,accepted,ip_hash,ua,created_at) VALUES(?,?,?,?,?,?,1,?,?,?)').run(id, email, phone, 'terms', slug, pol?.version || null, hashIp(ipOf(req)), String(req.headers['user-agent'] || '').slice(0, 200), now());
    }
    c = db.prepare('SELECT * FROM customers WHERE id=?').get(id); isNew = true;
  } else {
    if (c.blocked) throw new HttpError(403, 'This account is not available. Please contact support.');
    db.prepare('UPDATE customers SET email_verified=1, phone=COALESCE(phone, ?) WHERE id=?').run(phone, c.id);
    c = db.prepare('SELECT * FROM customers WHERE id=?').get(c.id);
  }
  db.prepare('UPDATE orders SET customer_id=? WHERE customer_id IS NULL AND email=?').run(c.id, email); // email is now proven, so earlier guest orders join the account
  auth.startCustomerSession(res, c.id);
  res.json({ customer: publicCustomer(c), is_new: isNew });
}));
api.post('/auth/logout', (req, res) => { auth.customerLogout(req, res); res.json({ ok: true }); });
api.post('/auth/forgot', lim(60, 6), asyncH((req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const c = db.prepare('SELECT * FROM customers WHERE email=? AND deleted_at IS NULL').get(email);
  if (c) {
    const t = token(24);
    db.prepare('INSERT INTO password_resets(token_hash,customer_id,expires_at) VALUES(?,?,?)').run(sha256(t), c.id, new Date(Date.now() + 3600e3).toISOString());
    mail.queueEmail(email, 'Reset your password', `Open this link to choose a new password (valid for 1 hour): ${cfg.SITE_URL}/reset?token=${t}`, 'reset');
  }
  res.json({ ok: true, message: 'If that email has an account, we have sent a reset link.' });
}));
api.post('/auth/reset', authLim, asyncH((req, res) => {
  const r = db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND expires_at>?').get(sha256(String(req.body?.token || '')), now());
  if (!r) throw bad('This reset link is not valid or has expired.');
  if (String(req.body?.password || '').length < 8) throw bad('Password must be at least 8 characters.');
  db.prepare('UPDATE customers SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(String(req.body.password), 10), r.customer_id);
  db.prepare('DELETE FROM password_resets WHERE customer_id=?').run(r.customer_id);
  db.prepare('DELETE FROM customer_sessions WHERE customer_id=?').run(r.customer_id);
  res.json({ ok: true });
}));

const acct = express.Router();
acct.use(auth.requireCustomer);
acct.get('/me', (req, res) => res.json({ customer: publicCustomer(req.customer) }));
acct.patch('/me', asyncH((req, res) => {
  const b = req.body || {}, c0 = req.customer, phone = b.phone ? normPhone(b.phone) : c0.phone;
  if (b.complete && !phone) throw bad('Please enter your mobile number.');
  if (phone && !isPhone(phone)) throw bad('Enter a valid 10-digit mobile number.');
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  let first = b.first_name !== undefined ? clean(b.first_name) : (c0.first_name || (c0.name || '').split(' ')[0] || '');
  let last = b.last_name !== undefined ? clean(b.last_name) : (c0.last_name || (c0.name || '').split(' ').slice(1).join(' '));
  if (b.name !== undefined && b.first_name === undefined) { const parts = clean(b.name).split(' '); first = parts[0] || ''; last = parts.slice(1).join(' '); }
  if (b.complete && first.length < 2) throw bad('Please enter your first name.');
  const full = [first, last].filter(Boolean).join(' ') || null;
  const mk = b.marketing_optin === undefined ? c0.marketing_optin : (b.marketing_optin ? 1 : 0);
  db.prepare('UPDATE customers SET name=?, first_name=?, last_name=?, phone=?, marketing_optin=? WHERE id=?').run(full, first || null, last || null, phone || null, mk, c0.id);
  res.json({ customer: publicCustomer(db.prepare('SELECT * FROM customers WHERE id=?').get(c0.id)) });
}));
acct.post('/password', authLim, asyncH((req, res) => {
  if (req.customer.pass_hash && !bcrypt.compareSync(String(req.body?.old || ''), req.customer.pass_hash)) throw bad('Current password is wrong.');
  if (String(req.body?.password || '').length < 8) throw bad('Password must be at least 8 characters.');
  db.prepare('UPDATE customers SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(String(req.body.password), 10), req.customer.id);
  require('../shared/mail').sendPasswordChanged(req.customer.email, req.customer.first_name || (req.customer.name || '').split(' ')[0]).catch(() => {});
  res.json({ ok: true });
}));
acct.get('/orders', (req, res) => res.json(db.prepare('SELECT * FROM orders WHERE customer_id=? ORDER BY id DESC LIMIT 100').all(req.customer.id).map(o => ({ ...orders.serializeForCustomer(o), token: o.access_token }))));
acct.get('/addresses', (req, res) => res.json(db.prepare('SELECT * FROM addresses WHERE customer_id=? ORDER BY is_default DESC, id DESC').all(req.customer.id)));
acct.post('/addresses', asyncH((req, res) => {
  const a = orders.validateAddress(req.body);
  const id = orders.saveAddress(req.customer.id, a);
  if (req.body.is_default) { db.prepare('UPDATE addresses SET is_default=0 WHERE customer_id=?').run(req.customer.id); db.prepare('UPDATE addresses SET is_default=1 WHERE id=?').run(id); }
  if (req.body.label) db.prepare('UPDATE addresses SET label=? WHERE id=?').run(String(req.body.label).slice(0, 30), id);
  res.json({ id });
}));
acct.put('/addresses/:id', asyncH((req, res) => {
  const id = int(req.params.id), row = db.prepare('SELECT id FROM addresses WHERE id=? AND customer_id=?').get(id, req.customer.id);
  if (!row) throw bad('Address not found.');
  const a = orders.validateAddress(req.body);
  db.prepare('UPDATE addresses SET name=?, phone=?, line1=?, line2=?, landmark=?, pincode=?, city=?, state=? WHERE id=?').run(a.name, a.phone, a.line1, a.line2, a.landmark, a.pincode, a.city, a.state, id);
  res.json({ ok: true });
}));
acct.post('/addresses/:id/default', (req, res) => {
  const id = int(req.params.id); if (!db.prepare('SELECT id FROM addresses WHERE id=? AND customer_id=?').get(id, req.customer.id)) throw bad('Address not found.');
  db.prepare('UPDATE addresses SET is_default=0 WHERE customer_id=?').run(req.customer.id); db.prepare('UPDATE addresses SET is_default=1 WHERE id=?').run(id); res.json({ ok: true });
});
acct.delete('/addresses/:id', (req, res) => { db.prepare('DELETE FROM addresses WHERE id=? AND customer_id=?').run(int(req.params.id), req.customer.id); res.json({ ok: true }); });
acct.get('/wishlist', (req, res) => {
  const ids = db.prepare('SELECT product_id FROM wishlist WHERE customer_id=? ORDER BY created_at DESC').all(req.customer.id).map(r => r.product_id);
  res.json(ids.length ? catalog.listPublic({ ids, limit: 60, sort: 'relevance' }).items : []);
});
acct.put('/wishlist/:id', (req, res) => { db.prepare('INSERT OR IGNORE INTO wishlist(customer_id,product_id,created_at) VALUES(?,?,?)').run(req.customer.id, int(req.params.id), now()); res.json({ ok: true }); });
acct.delete('/wishlist/:id', (req, res) => { db.prepare('DELETE FROM wishlist WHERE customer_id=? AND product_id=?').run(req.customer.id, int(req.params.id)); res.json({ ok: true }); });
acct.get('/export', (req, res) => {
  const c = req.customer;
  res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
  res.json({ profile: publicCustomer(c), addresses: db.prepare('SELECT * FROM addresses WHERE customer_id=?').all(c.id), orders: db.prepare('SELECT number,status,total,placed_at,payment_method FROM orders WHERE customer_id=?').all(c.id),
    consents: db.prepare('SELECT kind,policy_slug,policy_version,accepted,created_at FROM consents WHERE customer_id=?').all(c.id), reviews: db.prepare('SELECT product_id,rating,body,created_at FROM reviews WHERE customer_id=?').all(c.id) });
});
acct.post('/delete', authLim, asyncH((req, res) => {
  if (req.customer.pass_hash ? !bcrypt.compareSync(String(req.body?.password || ''), req.customer.pass_hash) : String(req.body?.password || '').trim() !== 'DELETE') throw bad(req.customer.pass_hash ? 'Password is wrong.' : 'Type DELETE to confirm.');
  const id = req.customer.id;
  db.transaction(() => {
    db.prepare("UPDATE customers SET email=?, phone=NULL, name=NULL, pass_hash=NULL, marketing_optin=0, deleted_at=? WHERE id=?").run(`deleted-${id}@deleted.invalid`, now(), id);
    db.prepare('DELETE FROM addresses WHERE customer_id=?').run(id);
    db.prepare('DELETE FROM wishlist WHERE customer_id=?').run(id);
    db.prepare('DELETE FROM customer_sessions WHERE customer_id=?').run(id);
  })();
  auth.customerLogout(req, res);
  res.json({ ok: true, message: 'Your account was deleted. Order records needed for tax and legal reasons are kept without your login.' });
}));
api.use('/account', acct);

/* ---------- contact, grievance, notify, newsletter, events ---------- */
api.post('/contact', lim(60, 8, 'Too many messages. Please try again later.'), asyncH((req, res) => {
  const b = req.body || {}, kind = b.kind === 'grievance' ? 'grievance' : 'contact';
  const name = String(b.name || '').trim().slice(0, 80), msg = String(b.message || '').trim().slice(0, 3000);
  const email = String(b.email || '').trim().toLowerCase(), phone = b.phone ? normPhone(b.phone) : '';
  if (name.length < 2) throw bad('Please enter your name.');
  if (msg.length < 5) throw bad('Please write your message.');
  if (!isEmail(email) && !isPhone(phone)) throw bad('Please give an email or a 10-digit phone so we can reply.');
  const ts = now();
  const ack = kind === 'grievance' ? new Date(Date.now() + 48 * 3600e3).toISOString() : null;
  const resolve = kind === 'grievance' ? new Date(Date.now() + 30 * 86400e3).toISOString() : null;
  const id = db.prepare('INSERT INTO contact_messages(kind,name,email,phone,order_number,subject,message,status,ack_due_at,resolve_due_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(kind, name, email || null, phone || null, String(b.order_number || '').trim().toUpperCase().slice(0, 30) || null, String(b.subject || '').slice(0, 120) || null, msg, 'open', ack, resolve, ts).lastInsertRowid;
  res.json({ ok: true, ref: (kind === 'grievance' ? 'G-' : 'M-') + id, message: kind === 'grievance' ? 'Your complaint is registered. We will acknowledge it within 48 hours and resolve it within one month.' : 'Thank you. We will reply soon.' });
}));
api.post('/notify', lim(60, 10), asyncH((req, res) => {
  const contact = String(req.body?.contact || '').trim().toLowerCase().slice(0, 120);
  if (!isEmail(contact) && !isPhone(contact)) throw bad('Enter your email or 10-digit mobile number.');
  const pid = int(req.body?.product_id);
  if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(pid)) throw notFound();
  db.prepare('INSERT INTO notify_requests(product_id,variant_id,contact,created_at) VALUES(?,?,?,?)').run(pid, int(req.body?.variant_id) || null, isEmail(contact) ? contact : normPhone(contact), now());
  res.json({ ok: true, message: 'Done. We will tell you when it is back.' });
}));
api.post('/newsletter', lim(60, 6), asyncH((req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!isEmail(email)) throw bad('Enter a valid email address.');
  db.prepare('INSERT OR IGNORE INTO newsletter(email,created_at) VALUES(?,?)').run(email, now());
  res.json({ ok: true, message: 'You are in. Thank you!' });
}));
api.post('/events', lim(1, 120), (req, res) => {
  const type = String(req.body?.type || ''), pid = int(req.body?.product_id), sid = String(req.body?.sid || '').slice(0, 24);
  if (['view', 'atc', 'wish', 'checkout'].includes(type) && pid) {
    db.prepare('INSERT INTO product_events(type,product_id,sid,created_at) VALUES(?,?,?,?)').run(type, pid, sid, now());
    if (type === 'view') db.prepare('UPDATE products SET views=views+1 WHERE id=?').run(pid);
  }
  res.json({ ok: true });
});

/* ---------- pages ---------- */
function fillPolicy(html) {
  const b = settings.get('brand'), R = settings.get('returns'), S = settings.get('shipping');
  const v = { brand: b.name, legal_name: b.legal_name || b.name, address: b.address || '(address)', city: b.city || '(city)', email: b.email || '(email)', phone: b.phone || '(phone)', return_days: R.window_days, eta_min: S.eta_min, eta_max: S.eta_max };
  return String(html || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => U.esc(v[k] != null ? v[k] : ''));
}
api.get('/policies/:slug', asyncH((req, res) => {
  const p = db.prepare('SELECT slug,title,title_hi,body,body_hi,version,updated_at FROM policies WHERE slug=?').get(req.params.slug);
  if (!p) throw notFound();
  res.json({ ...p, body: U.cleanHtml(fillPolicy(p.body)), body_hi: p.body_hi ? U.cleanHtml(fillPolicy(p.body_hi)) : null });
}));
api.get('/faqs', (req, res) => res.json(db.prepare('SELECT q,a,q_hi,a_hi FROM faqs WHERE active=1 ORDER BY sort,id').all()));

module.exports = { api, bootstrap, fillPolicy, publicBrand };

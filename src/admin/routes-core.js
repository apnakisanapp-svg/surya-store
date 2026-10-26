'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const db = require('../shared/db');
const cfg = require('../shared/config');
const settings = require('../shared/settings');
const auth = require('../shared/auth');
const catalog = require('../shared/catalog');
const { asyncH, bad, notFound, int, round2, now, toCSV, jparse } = require('../shared/util');

const pub = express.Router();   // no login needed
const priv = express.Router();  // login needed

const loginLimit = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please wait 15 minutes.' } });
pub.post('/login', loginLimit, asyncH((req, res) => {
  if (req.headers['x-sy-csrf'] !== '1') return res.status(403).json({ error: 'Blocked (missing security header).' });
  res.json(auth.adminLogin(req, res, req.body?.email, req.body?.password, req.body?.code));
}));

priv.get('/me', (req, res) => {
  const a = req.admin, row = db.prepare('SELECT last_login FROM admins WHERE id=?').get(a.id);
  const recent = db.prepare('SELECT ok, ip, created_at FROM login_history WHERE email=? ORDER BY id DESC LIMIT 6').all(a.email);
  res.json({ id: a.id, email: a.email, name: a.name, must_change: a.must_change, totp_enabled: a.totp_enabled, last_login: row.last_login, recent_logins: recent, brand: settings.get('brand').name,
    site_url: cfg.SITE_URL, ip_limited: cfg.ADMIN_IP_ALLOW.length > 0 });
});
priv.post('/logout', (req, res) => { auth.adminLogout(req, res); res.json({ ok: true }); });
priv.post('/password', asyncH((req, res) => { auth.changePassword(req.admin.id, req.body?.old, req.body?.password, req.admin.session); auth.logActivity(req.admin.id, 'password_change', 'admin', req.admin.id, '', req); res.json({ ok: true }); }));
priv.post('/profile', asyncH((req, res) => { db.prepare('UPDATE admins SET name=? WHERE id=?').run(String(req.body?.name || '').slice(0, 60) || null, req.admin.id); res.json({ ok: true }); }));
priv.post('/2fa/setup', asyncH(async (req, res) => { const s = auth.setup2fa(req.admin.id, req.admin.email); res.json({ secret: s.secret, qr: await QRCode.toDataURL(s.uri, { margin: 1, width: 240 }) }); }));
priv.post('/2fa/enable', asyncH((req, res) => { const codes = auth.enable2fa(req.admin.id, req.body?.code); auth.logActivity(req.admin.id, '2fa_on', 'admin', req.admin.id, '', req); res.json({ recovery_codes: codes }); }));
priv.post('/2fa/disable', asyncH((req, res) => { auth.disable2fa(req.admin.id, req.body?.password); auth.logActivity(req.admin.id, '2fa_off', 'admin', req.admin.id, '', req); res.json({ ok: true }); }));
priv.get('/sessions', (req, res) => res.json({ logins: db.prepare('SELECT * FROM login_history ORDER BY id DESC LIMIT 50').all(), sessions: db.prepare('SELECT token_hash, created_at, last_seen, ip, ua FROM admin_sessions WHERE admin_id=?').all(req.admin.id).map(s => ({ ...s, id: s.token_hash.slice(0, 10), current: s.token_hash === req.admin.session, token_hash: undefined })) }));
priv.post('/sessions/logout-others', (req, res) => { db.prepare('DELETE FROM admin_sessions WHERE admin_id=? AND token_hash<>?').run(req.admin.id, req.admin.session); res.json({ ok: true }); });

/* ---- dashboard ---- */
priv.get('/dashboard', asyncH((req, res) => {
  const days = Math.min(90, Math.max(1, int(req.query.days, 14))), t = now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const good = "status IN ('confirmed','packed','shipped','delivered')";
  const q = (sql, ...a) => db.prepare(sql).get(...a);
  const today = q(`SELECT COUNT(*) n, COALESCE(SUM(total),0) v FROM orders WHERE placed_at>=? AND status!='cancelled'`, startOfToday.toISOString());
  const period = q(`SELECT COUNT(*) n, COALESCE(SUM(total),0) v FROM orders WHERE placed_at>=? AND ${good}`, since);
  const profit = q(`SELECT COALESCE(SUM((i.price-i.cost)*i.qty),0) p FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.placed_at>=? AND o.${good}`, since).p;
  const todo = {
    verify_upi: q("SELECT COUNT(*) c FROM orders WHERE payment_status='submitted' AND status NOT IN ('cancelled')").c,
    cod_confirm: q("SELECT COUNT(*) c FROM orders WHERE status='cod_confirm'").c,
    to_pack: q("SELECT COUNT(*) c FROM orders WHERE status='confirmed'").c,
    to_ship: q("SELECT COUNT(*) c FROM orders WHERE status='packed'").c,
    unpaid_upi: q("SELECT COUNT(*) c FROM orders WHERE status='payment_pending' AND payment_status IN ('pending','rejected')").c,
    requests: q("SELECT COUNT(*) c FROM order_requests WHERE status='open'").c,
    reviews: q("SELECT COUNT(*) c FROM reviews WHERE status='pending'").c,
    messages: q("SELECT COUNT(*) c FROM contact_messages WHERE kind='contact' AND status='open'").c,
    grievances: q("SELECT COUNT(*) c FROM contact_messages WHERE kind='grievance' AND status!='resolved'").c,
    grievance_overdue: q("SELECT COUNT(*) c FROM contact_messages WHERE kind='grievance' AND status!='resolved' AND ((acked_at IS NULL AND ack_due_at<?) OR resolve_due_at<?)", t, t).c,
    outbox: q("SELECT COUNT(*) c FROM outbox WHERE status IN ('manual','failed')").c,
    low_stock: q("SELECT COUNT(*) c FROM products WHERE deleted_at IS NULL AND status='published' AND stock<=COALESCE(low_stock_limit,?)", settings.get('store').low_stock_default).c,
    risky_cod: q("SELECT COUNT(*) c FROM orders WHERE risky=1 AND status IN ('cod_confirm','confirmed')").c,
    notify: q('SELECT COUNT(*) c FROM notify_requests WHERE notified=0').c,
  };
  const series = db.prepare(`SELECT substr(placed_at,1,10) d, COUNT(*) n, SUM(total) v FROM orders WHERE placed_at>=? AND status!='cancelled' GROUP BY d ORDER BY d`).all(since);
  const topProducts = db.prepare(`SELECT i.name, SUM(i.qty) q, SUM(i.price*i.qty) v FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.placed_at>=? AND o.status!='cancelled' GROUP BY i.product_id ORDER BY q DESC LIMIT 5`).all(since);
  const funnel = q("SELECT SUM(type='view') views, SUM(type='atc') atc, SUM(type='checkout') checkout FROM product_events WHERE created_at>=?", since);
  const recent = db.prepare('SELECT id,number,name,total,status,payment_method,payment_status,placed_at FROM orders ORDER BY id DESC LIMIT 8').all();
  const products = q("SELECT COUNT(*) c, SUM(status='published') live FROM products WHERE deleted_at IS NULL");
  const setup = [];
  const B = settings.get('brand'), P = settings.get('payments');
  if (!P.upi_id) setup.push({ text: 'Add your UPI ID', go: 'settings/payments' });
  if (!B.legal_name || !B.address) setup.push({ text: 'Fill business name and address', go: 'settings/brand' });
  if (!B.grievance.name || !B.grievance.email) setup.push({ text: 'Fill Grievance Officer details (required by law)', go: 'settings/brand' });
  if (!B.phone && !B.whatsapp) setup.push({ text: 'Add support phone or WhatsApp number', go: 'settings/brand' });
  if (!products.live) setup.push({ text: 'Publish your first product', go: 'products' });
  if (!B.email) setup.push({ text: 'Add support email', go: 'settings/brand' });
  res.json({ today, period: { ...period, profit: round2(profit), days }, todo, series, topProducts, funnel, recent, products, setup, admin_password_default: !!db.prepare('SELECT must_change FROM admins WHERE id=?').get(req.admin.id).must_change });
}));
priv.get('/search', asyncH((req, res) => { // global quick search
  const q = String(req.query.q || '').trim(); if (q.length < 2) return res.json([]);
  const l = '%' + q.replace(/[%_]/g, '') + '%', out = [];
  for (const o of db.prepare('SELECT id,number,name,phone,status FROM orders WHERE number LIKE ? OR phone LIKE ? OR name LIKE ? OR utr LIKE ? ORDER BY id DESC LIMIT 6').all(l, l, l, l)) out.push({ type: 'order', id: o.id, title: o.number, sub: `${o.name} · ${o.phone} · ${o.status}`, go: `orders/${o.id}` });
  for (const p of db.prepare('SELECT id,name,sku,status FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR sku LIKE ?) LIMIT 6').all(l, l)) out.push({ type: 'product', id: p.id, title: p.name, sub: `${p.sku || ''} ${p.status}`, go: `products/${p.id}` });
  for (const c of db.prepare('SELECT id,name,email,phone FROM customers WHERE deleted_at IS NULL AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) LIMIT 4').all(l, l, l)) out.push({ type: 'customer', id: c.id, title: c.name || c.email, sub: `${c.email || ''} ${c.phone || ''}`, go: `customers` });
  res.json(out);
}));

/* ---- activity, reports, backups ---- */
priv.get('/activity', (req, res) => res.json(db.prepare('SELECT a.*, m.email FROM activity_log a LEFT JOIN admins m ON m.id=a.admin_id ORDER BY a.id DESC LIMIT ?').all(Math.min(1000, int(req.query.limit, 200)))));
priv.get('/reports/sales.csv', asyncH((req, res) => {
  const from = req.query.from ? new Date(req.query.from).toISOString() : new Date(Date.now() - 30 * 86400000).toISOString(), to = req.query.to ? new Date(new Date(req.query.to).getTime() + 86400000).toISOString() : now();
  const rows = db.prepare("SELECT o.number,o.placed_at,o.name,o.status,o.payment_method,i.name item,i.qty,i.price,i.cost,i.hsn,i.gst_rate,o.coupon_code FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.placed_at>=? AND o.placed_at<? ORDER BY o.id").all(from, to);
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="sales-report.csv"').send(toCSV(['Order', 'Date', 'Customer', 'Status', 'Payment', 'Item', 'Qty', 'Price', 'Cost', 'HSN', 'GST %', 'Coupon'], rows.map(r => [r.number, r.placed_at, r.name, r.status, r.payment_method, r.item, r.qty, r.price, r.cost, r.hsn, r.gst_rate, r.coupon_code])));
}));
priv.get('/backups', (req, res) => res.json(fs.readdirSync(cfg.BACKUPS).filter(f => f.endsWith('.db')).sort().reverse().map(f => ({ name: f, size: fs.statSync(path.join(cfg.BACKUPS, f)).size, at: fs.statSync(path.join(cfg.BACKUPS, f)).mtime.toISOString() }))));
priv.post('/backups', asyncH(async (req, res) => { const name = await makeBackup(); auth.logActivity(req.admin.id, 'backup', 'system', name, '', req); res.json({ name }); }));
priv.get('/backups/:name', asyncH((req, res) => {
  if (!/^surya-[\d-]+\.db$/.test(req.params.name)) throw notFound();
  const p = path.join(cfg.BACKUPS, req.params.name); if (!fs.existsSync(p)) throw notFound();
  auth.logActivity(req.admin.id, 'backup_download', 'system', req.params.name, '', req);
  res.download(p);
}));
async function makeBackup() {
  const name = `surya-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`;
  await db.backup(path.join(cfg.BACKUPS, name));
  const all = fs.readdirSync(cfg.BACKUPS).filter(f => f.endsWith('.db')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 30))) fs.unlinkSync(path.join(cfg.BACKUPS, old)); // keep the last 30
  return name;
}
priv.get('/system', (req, res) => {
  const size = f => { try { return fs.statSync(f).size; } catch { return 0; } };
  res.json({ node: process.version, db_size: size(cfg.DB_FILE), site_url: cfg.SITE_URL, smtp: !!cfg.SMTP_URL, production: cfg.PRODUCTION, secure_cookies: cfg.SECURE_COOKIES, time: now(), uploads_note: 'Backups contain the database only. Copy the "data/uploads" folder too to save photos.' });
});

module.exports = { pub, priv, makeBackup };

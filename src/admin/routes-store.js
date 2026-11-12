'use strict';
const express = require('express');
const multer = require('multer');
const db = require('../shared/db');
const settings = require('../shared/settings');
const themes = require('../shared/themes');
const images = require('../shared/images');
const catalog = require('../shared/catalog');
const auth = require('../shared/auth');
const mail = require('../shared/mail');
const { crud } = require('./crud');
const { itemImage, asyncH, bad, notFound, int, num, jparse, now, uniqueSlug, toCSV, isEmail } = require('../shared/util');

const r = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

/* ---- generic image upload for logos, banners, category pictures ---- */
r.post('/upload', upload.single('image'), asyncH(async (req, res) => {
  if (!req.file) throw bad('Choose an image.');
  const keepAlpha = req.body?.alpha !== '0';
  const out = await images.processGeneric(req.file.buffer, { maxW: int(req.body?.max_w, 2000) || 2000, maxH: int(req.body?.max_h, 2000) || 2000, keepAlpha });
  res.json({ file: out.file, url: `/media/${out.file}-img.webp`, w: out.w, h: out.h });
}));

/* ---- simple resources ---- */
r.use('/categories', crud({
  table: 'categories', label: 'category', soft: true, order: 'sort, id', search: ['name'], required: ['name'],
  fields: { name: 'text', name_hi: 'text', parent_id: 'int', image: 'text', description: 'text', description_hi: 'text', sort: 'int', active: 'bool', seo_title: 'text', seo_desc: 'text' },
  before: (d, req, ex) => { if (!ex) d.slug = uniqueSlug(db, 'categories', d.name); if (ex && d.name && req.body.regen_slug) d.slug = uniqueSlug(db, 'categories', d.name, ex.id); if (d.parent_id && ex && d.parent_id === ex.id) throw bad('A category cannot be its own parent.'); },
  list: rows => rows.map(c => ({ ...c, image_url: c.image ? `/media/${c.image}-img.webp` : null, product_count: db.prepare('SELECT COUNT(*) c FROM products WHERE category_id=? AND deleted_at IS NULL').get(c.id).c })),
  beforeDelete: id => { if (db.prepare('SELECT 1 FROM products WHERE category_id=? AND deleted_at IS NULL').get(id)) throw bad('Move or delete the products in this category first.'); },
  after: () => catalog.reindexAll(),
}));
r.use('/coupons', crud({
  table: 'coupons', label: 'coupon', soft: true, order: 'id DESC', search: ['code'], required: ['code'],
  fields: { code: 'text', type: 'text', value: 'num', min_cart: 'num', max_discount: 'num', starts_at: 'date', expires_at: 'date', usage_limit: 'int', per_customer: 'int', product_ids: 'json', category_ids: 'json', first_order_only: 'bool', free_shipping: 'bool', active: 'bool', show_public: 'bool', description: 'text' },
  before: d => { if (d.code) { d.code = d.code.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); if (d.code.length < 3) throw bad('Coupon code needs at least 3 letters or numbers.'); } if (d.type && !['percent', 'flat'].includes(d.type)) throw bad('Type must be percent or flat.'); if (d.type === 'percent' && d.value > 100) throw bad('Percent cannot be above 100.'); },
}));
r.use('/banners', crud({
  table: 'banners', label: 'banner', order: 'sort, id', search: ['title'],
  fields: { title: 'text', title_hi: 'text', subtitle: 'text', subtitle_hi: 'text', cta_text: 'text', cta_text_hi: 'text', cta_url: 'text', image: 'text', image_mobile: 'text', product_id: 'int', theme: 'text', starts_at: 'date', ends_at: 'date', sort: 'int', active: 'bool' },
  list: rows => rows.map(b => ({ ...b, image_url: b.image ? `/media/${b.image}-img.webp` : null, image_mobile_url: b.image_mobile ? `/media/${b.image_mobile}-img.webp` : null })),
}));
r.use('/testimonials', crud({ table: 'testimonials', label: 'testimonial', order: 'sort, id', fields: { name: 'text', city: 'text', text: 'text', text_hi: 'text', rating: 'int', sort: 'int', active: 'bool' }, required: ['name', 'text'] }));
r.use('/faqs', crud({ table: 'faqs', label: 'faq', order: 'sort, id', fields: { q: 'text', a: 'text', q_hi: 'text', a_hi: 'text', sort: 'int', active: 'bool' }, required: ['q', 'a'] }));
r.use('/redirects', crud({
  table: 'redirects', label: 'redirect', fields: { from_path: 'text', to_path: 'text', code: 'int' }, required: ['from_path', 'to_path'],
  before: d => { if (d.from_path && !d.from_path.startsWith('/')) throw bad('"From" must start with /'); if (d.to_path && !/^(\/|https?:\/\/)/.test(d.to_path)) throw bad('"To" must start with / or https://'); if (d.from_path && d.from_path === d.to_path) throw bad('From and To are the same.'); d.code = [301, 302].includes(d.code) ? d.code : 301; },
}));

/* ---- reviews ---- */
r.get('/reviews', asyncH((req, res) => {
  const st = req.query.status || 'pending';
  res.json(db.prepare(`SELECT r.*, p.name product_name FROM reviews r JOIN products p ON p.id=r.product_id ${st === 'all' ? '' : 'WHERE r.status=?'} ORDER BY r.id DESC LIMIT 300`).all(...(st === 'all' ? [] : [st])));
}));
r.post('/reviews/approve-star-only', asyncH((req, res) => {
  const n = db.prepare("UPDATE reviews SET status='approved' WHERE status='pending' AND (body IS NULL OR body='') AND flagged IS NOT 1").run().changes;
  auth.logActivity(req.admin.id, 'review_approve_stars', 'review', 0, String(n), req);
  res.json({ ok: true, approved: n });
}));
r.patch('/reviews/:id', asyncH((req, res) => {
  const id = int(req.params.id), b = req.body || {};
  if (b.status && !['approved', 'rejected', 'pending'].includes(b.status)) throw bad('Bad status.');
  db.prepare('UPDATE reviews SET status=COALESCE(?,status), reply=CASE WHEN ? IS NULL THEN reply ELSE ? END, flagged=COALESCE(?,flagged) WHERE id=?').run(b.status || null, b.reply === undefined ? null : b.reply, b.reply === undefined ? null : String(b.reply).slice(0, 600) || null, b.flagged == null ? null : (b.flagged ? 1 : 0), id);
  auth.logActivity(req.admin.id, 'review_' + (b.status || 'edit'), 'review', id, '', req);
  res.json({ ok: true });
}));
r.delete('/reviews/:id', asyncH((req, res) => { db.prepare('DELETE FROM reviews WHERE id=?').run(int(req.params.id)); res.json({ ok: true }); }));

/* ---- messages & grievances ---- */
r.get('/messages', asyncH((req, res) => {
  const where = ['1=1'], args = [];
  if (req.query.kind) { where.push('kind=?'); args.push(req.query.kind); }
  if (req.query.status) { where.push('status=?'); args.push(req.query.status); }
  const rows = db.prepare(`SELECT * FROM contact_messages WHERE ${where.join(' AND ')} ORDER BY (status='open') DESC, id DESC LIMIT 300`).all(...args);
  const t = now();
  res.json(rows.map(m => ({ ...m, ack_overdue: m.kind === 'grievance' && !m.acked_at && m.ack_due_at < t, resolve_overdue: m.kind === 'grievance' && m.status !== 'resolved' && m.resolve_due_at < t })));
}));
r.patch('/messages/:id', asyncH((req, res) => {
  const id = int(req.params.id), b = req.body || {}, m = db.prepare('SELECT * FROM contact_messages WHERE id=?').get(id);
  if (!m) throw notFound();
  const sets = [], args = [];
  if (b.acknowledge && !m.acked_at) { sets.push('acked_at=?'); args.push(now()); }
  if (b.reply !== undefined) { sets.push('reply=?'); args.push(String(b.reply).slice(0, 3000)); if (!m.acked_at) { sets.push('acked_at=?'); args.push(now()); } }
  if (b.status) { if (!['open', 'in_progress', 'resolved'].includes(b.status)) throw bad('Bad status.'); sets.push('status=?'); args.push(b.status); if (b.status === 'resolved') { sets.push('resolved_at=?'); args.push(now()); } }
  if (sets.length) db.prepare(`UPDATE contact_messages SET ${sets.join(',')} WHERE id=?`).run(...args, id);
  if (b.reply && b.send_email && isEmail(m.email)) mail.queueEmail(m.email, `Re: ${m.subject || 'your message'}`, String(b.reply), 'reply');
  auth.logActivity(req.admin.id, 'message_update', 'message', id, b.status || '', req);
  res.json(db.prepare('SELECT * FROM contact_messages WHERE id=?').get(id));
}));
r.delete('/messages/:id', asyncH((req, res) => { db.prepare('DELETE FROM contact_messages WHERE id=?').run(int(req.params.id)); res.json({ ok: true }); }));

/* ---- customers ---- */
r.get('/customers', asyncH((req, res) => {
  const where = ['c.deleted_at IS NULL'], args = [];
  if (req.query.q) { const l = '%' + String(req.query.q).replace(/[%_]/g, '') + '%'; where.push('(c.email LIKE ? OR c.phone LIKE ? OR c.name LIKE ?)'); args.push(l, l, l); }
  if (req.query.blocked === '1') where.push('c.blocked=1');
  res.json(db.prepare(`SELECT c.id,c.email,c.phone,c.name,c.blocked,c.block_reason,c.marketing_optin,c.created_at,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id) orders, (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.customer_id=c.id AND o.status NOT IN ('cancelled')) spent
    FROM customers c WHERE ${where.join(' AND ')} ORDER BY c.id DESC LIMIT 500`).all(...args));
}));
r.get('/customers/history/:phone', asyncH((req, res) => { // everything one buyer ordered (account or guest), with photos
  const ph = String(req.params.phone).replace(/\D/g, '').slice(-10);
  if (ph.length < 10) throw bad('Phone number looks wrong.');
  const rows = db.prepare('SELECT id,number,status,payment_method,payment_status,total,placed_at,name,email FROM orders WHERE phone=? ORDER BY id DESC LIMIT 200').all(ph);
  const ids = rows.map(o => o.id);
  const items = ids.length ? db.prepare(`SELECT order_id,product_id,name,variant_name,qty,price,image FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
  const by = {}; for (const i of items) (by[i.order_id] = by[i.order_id] || []).push({ ...i, image_url: itemImage(i.image) });
  const orders = rows.map(o => ({ ...o, items: by[o.id] || [] }));
  const acct = db.prepare('SELECT id,name,email,blocked,created_at FROM customers WHERE phone=?').get(ph);
  res.json({ phone: ph, name: (acct && acct.name) || (rows[0] && rows[0].name) || '', email: (acct && acct.email) || (rows[0] && rows[0].email) || '', blocked: !!(acct && acct.blocked), has_account: !!acct,
    count: rows.length, spent: rows.filter(o => !['cancelled'].includes(o.status)).reduce((a, o) => a + o.total, 0), orders });
}));
r.get('/customers/phone/:phone', asyncH((req, res) => { // guests too
  const ph = String(req.params.phone).replace(/\D/g, '').slice(-10);
  res.json({ orders: db.prepare('SELECT number,status,total,placed_at,payment_method FROM orders WHERE phone=? ORDER BY id DESC').all(ph), blocked: !!db.prepare('SELECT 1 FROM customers WHERE phone=? AND blocked=1').get(ph) });
}));
r.patch('/customers/:id', asyncH((req, res) => {
  const id = int(req.params.id), b = req.body || {};
  db.prepare('UPDATE customers SET blocked=COALESCE(?,blocked), block_reason=CASE WHEN ? IS NULL THEN block_reason ELSE ? END, notes=CASE WHEN ? IS NULL THEN notes ELSE ? END WHERE id=?')
    .run(b.blocked == null ? null : (b.blocked ? 1 : 0), b.block_reason === undefined ? null : 1, b.block_reason || null, b.notes === undefined ? null : 1, b.notes || null, id);
  if (b.blocked) db.prepare('DELETE FROM customer_sessions WHERE customer_id=?').run(id);
  auth.logActivity(req.admin.id, b.blocked ? 'customer_block' : 'customer_update', 'customer', id, '', req);
  res.json({ ok: true });
}));
r.get('/customers/export/csv', asyncH((req, res) => {
  const rows = db.prepare("SELECT email,phone,name,marketing_optin,created_at FROM customers WHERE deleted_at IS NULL").all();
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="customers.csv"').send(toCSV(['Email', 'Phone', 'Name', 'Marketing OK', 'Joined'], rows.map(c => [c.email, c.phone, c.name, c.marketing_optin ? 'yes' : 'no', c.created_at])));
}));
r.get('/newsletter', (req, res) => res.json(db.prepare('SELECT * FROM newsletter ORDER BY id DESC LIMIT 2000').all()));
r.delete('/newsletter/:id', (req, res) => { db.prepare('DELETE FROM newsletter WHERE id=?').run(int(req.params.id)); res.json({ ok: true }); });
r.get('/notify', (req, res) => res.json(db.prepare('SELECT n.*, p.name product_name, p.stock FROM notify_requests n JOIN products p ON p.id=n.product_id ORDER BY n.id DESC LIMIT 500').all()));
r.post('/notify/send/:productId', asyncH((req, res) => {
  const pid = int(req.params.productId), p = db.prepare('SELECT name,slug,stock FROM products WHERE id=?').get(pid);
  if (!p || p.stock <= 0) throw bad('The product is not in stock yet.');
  const cfg = require('../shared/config'), B = settings.get('messages').back_in_stock;
  let n = 0;
  for (const q of db.prepare('SELECT * FROM notify_requests WHERE product_id=? AND notified=0').all(pid)) {
    const vars = { product: p.name, url: `${cfg.SITE_URL}/p/${p.slug}` }, body = mail.render(B.body, vars);
    if (isEmail(q.contact)) mail.queueEmail(q.contact, mail.render(B.subject, vars), body, 'back_in_stock');
    else { const link = mail.waLink(q.contact, body); db.prepare("INSERT INTO outbox(channel,to_addr,subject,body,link,status,kind,created_at) VALUES('whatsapp',?,?,?,?,'manual','back_in_stock',?)").run(q.contact, mail.render(B.subject, vars), body, link, now()); }
    db.prepare('UPDATE notify_requests SET notified=1 WHERE id=?').run(q.id); n++;
  }
  res.json({ queued: n });
}));

/* ---- outbox (messages waiting to be sent: WhatsApp links, emails) ---- */
r.get('/outbox', (req, res) => {
  const st = req.query.status;
  res.json(db.prepare(`SELECT o.*, ord.number order_number FROM outbox o LEFT JOIN orders ord ON ord.id=o.order_id ${st ? 'WHERE o.status=?' : "WHERE o.status IN ('manual','failed','queued')"} ORDER BY o.id DESC LIMIT 300`).all(...(st ? [st] : [])));
});
r.post('/outbox/:id/sent', (req, res) => { db.prepare("UPDATE outbox SET status='sent', sent_at=? WHERE id=?").run(now(), int(req.params.id)); res.json({ ok: true }); });
r.post('/outbox/:id/retry', asyncH(async (req, res) => { await mail.sendEmail(int(req.params.id)); res.json({ ok: true }); }));
r.delete('/outbox/:id', (req, res) => { db.prepare('DELETE FROM outbox WHERE id=?').run(int(req.params.id)); res.json({ ok: true }); });

/* ---- settings ---- */
const GROUPS = Object.keys(settings.DEFAULTS);
r.get('/settings', (req, res) => res.json({ values: settings.all(), defaults: settings.DEFAULTS, presets: Object.fromEntries(Object.entries(themes.PRESETS).map(([k, v]) => [k, { label: v.label, tokens: v.tokens, radius: v.radius || 24 }])), fonts: Object.fromEntries(Object.entries(themes.FONTS).map(([k, v]) => [k, v.label])) }));
r.put('/settings/:group', asyncH((req, res) => {
  const g = req.params.group;
  if (!GROUPS.includes(g)) throw notFound('Unknown settings group.');
  const b = req.body || {};
  if (g === 'payments') {
    if (b.upi_id !== undefined && b.upi_id && !/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/.test(String(b.upi_id).trim())) throw bad('UPI ID looks wrong. It should look like name@bank.');
    if (b.upi_id) b.upi_id = String(b.upi_id).trim();
    for (const k of ['cod_fee', 'cod_min', 'cod_max', 'upi_timer_min', 'upi_grace_min']) if (b[k] !== undefined) b[k] = Math.max(0, num(b[k]));
  }
  if (g === 'shipping') for (const k of ['flat', 'free_above', 'eta_min', 'eta_max', 'gift_price', 'avg_ship_cost']) if (b[k] !== undefined) b[k] = Math.max(0, num(b[k]));
  if (g === 'returns' && b.window_days !== undefined) b.window_days = Math.min(60, Math.max(0, int(b.window_days)));
  if (g === 'brand' && b.gst_enabled && !(b.gstin || settings.get('brand').gstin)) throw bad('Enter your GSTIN before turning GST on.');
  if (['home', 'menu'].includes(g)) settings.set(g, { ...settings.get(g), ...b }); // lists are replaced as a whole
  else settings.patch(g, b);
  auth.logActivity(req.admin.id, 'settings', g, g, Object.keys(b).join(','), req);
  res.json({ values: settings.get(g) });
}));
r.post('/settings/:group/reset', asyncH((req, res) => {
  const g = req.params.group;
  if (!GROUPS.includes(g)) throw notFound();
  settings.set(g, settings.DEFAULTS[g]);
  auth.logActivity(req.admin.id, 'settings_reset', g, g, '', req);
  res.json({ values: settings.get(g) });
}));

/* ---- policies with versions and consent proof ---- */
r.get('/policies', (req, res) => res.json(db.prepare('SELECT slug,title,title_hi,version,protected,updated_at,sort,in_footer FROM policies ORDER BY sort,id').all()));
r.get('/policies/:slug', asyncH((req, res) => {
  const p = db.prepare('SELECT * FROM policies WHERE slug=?').get(req.params.slug);
  if (!p) throw notFound();
  res.json({ ...p, versions: db.prepare('SELECT version,created_at FROM policy_versions WHERE slug=? ORDER BY version DESC').all(p.slug), accepted: db.prepare('SELECT COUNT(*) c FROM consents WHERE policy_slug=? AND policy_version=?').get(p.slug, p.version).c });
}));
r.get('/policies/:slug/version/:v', asyncH((req, res) => { const v = db.prepare('SELECT * FROM policy_versions WHERE slug=? AND version=?').get(req.params.slug, int(req.params.v)); if (!v) throw notFound(); res.json(v); }));
r.put('/policies/:slug', asyncH((req, res) => {
  const slug = req.params.slug, p = db.prepare('SELECT * FROM policies WHERE slug=?').get(slug), b = req.body || {};
  if (!p) throw notFound();
  const body = b.body !== undefined ? require('../shared/util').cleanHtml(b.body) : p.body, bodyHi = b.body_hi !== undefined ? require('../shared/util').cleanHtml(b.body_hi) : p.body_hi;
  const title = b.title !== undefined ? String(b.title).trim() : p.title;
  if (!title || !body) throw bad('Title and text are required.');
  const changed = body !== p.body || bodyHi !== p.body_hi || title !== p.title, ts = now();
  const ver = changed ? p.version + 1 : p.version;
  db.transaction(() => {
    db.prepare('UPDATE policies SET title=?, title_hi=?, body=?, body_hi=?, version=?, updated_at=?, in_footer=? WHERE slug=?').run(title, b.title_hi !== undefined ? b.title_hi : p.title_hi, body, bodyHi, ver, changed ? ts : p.updated_at, b.in_footer == null ? p.in_footer : (b.in_footer ? 1 : 0), slug);
    if (changed) db.prepare('INSERT INTO policy_versions(slug,version,title,body,body_hi,created_at) VALUES(?,?,?,?,?,?)').run(slug, ver, title, body, bodyHi, ts);
  })();
  auth.logActivity(req.admin.id, 'policy_update', 'policy', slug, `v${ver}`, req);
  res.json({ ok: true, version: ver, changed });
}));
r.post('/policies', asyncH((req, res) => { // new custom page
  const title = String(req.body?.title || '').trim(); if (title.length < 2) throw bad('Give the page a title.');
  const slug = uniqueSlug(db, 'policies', title), ts = now();
  db.prepare('INSERT INTO policies(slug,title,body,version,protected,updated_at,sort,in_footer) VALUES(?,?,?,?,0,?,99,1)').run(slug, title, String(req.body?.body || '<p></p>'), 1, ts);
  db.prepare('INSERT INTO policy_versions(slug,version,title,body,created_at) VALUES(?,?,?,?,?)').run(slug, 1, title, String(req.body?.body || '<p></p>'), ts);
  res.json({ slug });
}));
r.delete('/policies/:slug', asyncH((req, res) => {
  const p = db.prepare('SELECT protected FROM policies WHERE slug=?').get(req.params.slug);
  if (!p) throw notFound(); if (p.protected) throw bad('This policy is required for checkout and cannot be deleted. You can edit it.');
  db.prepare('DELETE FROM policies WHERE slug=?').run(req.params.slug); res.json({ ok: true });
}));
r.get('/consents', (req, res) => {
  const q = req.query, where = ['1=1'], args = [];
  if (q.phone) { where.push('phone=?'); args.push(String(q.phone).replace(/\D/g, '').slice(-10)); }
  if (q.kind) { where.push('kind=?'); args.push(q.kind); }
  res.json(db.prepare(`SELECT c.*, o.number order_number FROM consents c LEFT JOIN orders o ON o.id=c.order_id WHERE ${where.join(' AND ')} ORDER BY c.id DESC LIMIT 500`).all(...args));
});
r.get('/consents/export/csv', (req, res) => {
  const rows = db.prepare('SELECT c.*, o.number order_number FROM consents c LEFT JOIN orders o ON o.id=c.order_id ORDER BY c.id DESC LIMIT 50000').all();
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="consent-records.csv"').send(toCSV(['When', 'Order', 'Phone', 'Email', 'Kind', 'Policy', 'Version', 'Accepted', 'IP hash'], rows.map(c => [c.created_at, c.order_number, c.phone, c.email, c.kind, c.policy_slug, c.policy_version, c.accepted ? 'yes' : 'no', c.ip_hash])));
});

module.exports = r;

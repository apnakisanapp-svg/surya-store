'use strict';
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('../shared/db');
const cfg = require('../shared/config');
const catalog = require('../shared/catalog');
const images = require('../shared/images');
const risk = require('../shared/risk');
const finance = require('../shared/finance');
const auth = require('../shared/auth');
const { asyncH, bad, notFound, int, num, jparse, jstr, now, uniqueSlug, toCSV, parseCSV, token } = require('../shared/util');

const r = express.Router();
r.param('id', (req, res, next, v) => (/^\d+$/.test(v) ? next() : next('route')));
r.param('iid', (req, res, next, v) => (/^\d+$/.test(v) ? next() : next('route')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 12 } });
const glbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

const TEXT = ['sku', 'name', 'name_hi', 'tagline', 'tagline_hi', 'description', 'description_hi', 'safety', 'safety_hi', 'warranty', 'warranty_hi', 'origin_country', 'manufacturer', 'importer', 'hsn', 'brand_used',
  'seo_title', 'seo_desc', 'video_url', 'badge', 'dims', 'similar_mode', 'publish_at', 'pay_rule', 'adv_type', 'gift_rule', 'ret_rule', 'ship_rule'];
const NUMS = ['price', 'mrp', 'cost', 'gst_rate', 'packaging_cost', 'ad_cost', 'shipping_cost', 'adv_value', 'gift_price'];
const INTS = ['category_id', 'stock', 'low_stock_limit', 'max_per_order', 'weight_g', 'sort', 'ret_days'];
const BOOLS = ['preorder', 'sold_out', 'safety_ack', 'has_battery', 'is_electronic', 'has_blade', 'is_liquid', 'is_cosmetic_food', 'featured'];
const JSONS = ['tags', 'specs', 'faq', 'similar_ids', 'risk_ack'];

function pickFields(b) {
  const o = {};
  for (const k of TEXT) if (b[k] !== undefined) o[k] = b[k] === '' || b[k] == null ? null : String(b[k]).trim();
  for (const k of NUMS) if (b[k] !== undefined) o[k] = b[k] === '' || b[k] == null ? (k === 'price' || k === 'mrp' || k === 'cost' ? 0 : null) : num(b[k]);
  for (const k of INTS) if (b[k] !== undefined) o[k] = b[k] === '' || b[k] == null ? (k === 'stock' ? 0 : null) : int(b[k]);
  for (const k of BOOLS) if (b[k] !== undefined) o[k] = b[k] ? 1 : 0;
  for (const k of JSONS) if (b[k] !== undefined) o[k] = jstr(typeof b[k] === 'string' ? jparse(b[k], k === 'risk_ack' ? {} : []) : b[k]);
  if (o.name != null && o.name.length < 2) throw bad('Product name is too short.');
  if (o.price != null && o.price < 0) throw bad('Price cannot be negative.');
  if (o.stock != null && o.stock < 0) throw bad('Stock cannot be negative.');
  if (o.similar_mode && !['auto', 'manual'].includes(o.similar_mode)) o.similar_mode = 'auto';
  const oneOf = (k, list) => { if (o[k] != null && !list.includes(o[k])) o[k] = null; };
  oneOf('pay_rule', ['upi_only', 'cod_advance']); oneOf('adv_type', ['none', 'fixed', 'percent']); oneOf('gift_rule', ['yes', 'no']);
  oneOf('ret_rule', require('../shared/rules').RET_RULES); oneOf('ship_rule', ['free', 'paid']);
  for (const k of ['adv_value', 'gift_price']) if (o[k] != null && o[k] < 0) throw bad('Amounts cannot be negative.');
  if (o.adv_type === 'percent' && o.adv_value != null && o.adv_value > 90) throw bad('An advance of more than 90% is not allowed.');
  if (o.ret_days != null && (o.ret_days < 0 || o.ret_days > 90)) throw bad('Return days must be between 0 and 90.');
  if (o.publish_at) o.publish_at = new Date(o.publish_at).toISOString();
  if (o.description) o.description = require('../shared/util').cleanHtml(o.description);
  if (o.description_hi) o.description_hi = require('../shared/util').cleanHtml(o.description_hi);
  return o;
}

function full(id) {
  const p = catalog.getById(id, true);
  if (!p) return null;
  const row = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  return { ...p, risk: risk.checkProduct({ ...row, tags: jparse(row.tags, []) }), economics: finance.economics(row), landed_cost: finance.latestLanded(id), quotes: finance.bestSupplierQuotes(id) };
}

/* ---- list ---- */
r.get('/', asyncH((req, res) => {
  const q = req.query, where = [q.trash === '1' ? 'p.deleted_at IS NOT NULL' : 'p.deleted_at IS NULL'], args = [];
  if (q.status) { where.push('p.status=?'); args.push(q.status); }
  if (q.category) { where.push('p.category_id=?'); args.push(int(q.category)); }
  if (q.low === '1') where.push('p.stock <= COALESCE(p.low_stock_limit, ?)'), args.push(settingsLow());
  if (q.q) { const l = '%' + String(q.q).replace(/[%_]/g, '') + '%'; where.push('(p.name LIKE ? OR p.sku LIKE ?)'); args.push(l, l); }
  const page = Math.max(1, int(q.page, 1)), per = Math.min(100, int(q.per, 30));
  const total = db.prepare(`SELECT COUNT(*) c FROM products p WHERE ${where.join(' AND ')}`).get(...args).c;
  const rows = db.prepare(`SELECT p.*, c.name category_name, (SELECT file FROM product_images i WHERE i.product_id=p.id ORDER BY sort,id LIMIT 1) img FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where.join(' AND ')} ORDER BY ${q.sort === 'name' ? 'p.name' : q.sort === 'stock' ? 'p.stock' : 'p.id DESC'} LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  res.json({ total, page, pages: Math.ceil(total / per), counts: Object.fromEntries(db.prepare('SELECT status, COUNT(*) c FROM products WHERE deleted_at IS NULL GROUP BY status').all().map(x => [x.status, x.c])),
    items: rows.map(p => {
      const rk = risk.checkProduct({ ...p, tags: jparse(p.tags, []) }), ec = finance.economics(p);
      return { id: p.id, slug: p.slug, name: p.name, sku: p.sku, status: p.status, price: p.price, mrp: p.mrp, stock: p.stock, sold_count: p.sold_count, views: p.views, category_name: p.category_name, thumb: p.img ? `/media/${p.img}-thumb.webp` : null,
        risk_level: rk.level, verdict: ec.verdict, margin: ec.margin, deleted_at: p.deleted_at, publish_at: p.publish_at, featured: !!p.featured };
    }) });
}));
const settingsLow = () => require('../shared/settings').get('store').low_stock_default;

/* ---- live helpers for the product form ---- */
r.post('/risk-check', asyncH((req, res) => { const b = req.body || {}; res.json(risk.checkProduct({ ...pickFields(b), has_battery: b.has_battery, is_electronic: b.is_electronic, has_blade: b.has_blade, is_liquid: b.is_liquid, is_cosmetic_food: b.is_cosmetic_food, tags: b.tags || [], risk_ack: (b.id && db.prepare('SELECT risk_ack FROM products WHERE id=?').get(int(b.id)) || {}).risk_ack || '{}', price: num(b.price), mrp: num(b.mrp), name: b.name, description: b.description, name_hi: b.name_hi, tagline: b.tagline, origin_country: b.origin_country, manufacturer: b.manufacturer, importer: b.importer, warranty: b.warranty, safety: b.safety, hsn: b.hsn, gst_rate: num(b.gst_rate) })); }));
r.post('/economics', asyncH((req, res) => {
  const b = req.body || {};
  const base = b.product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(int(b.product_id)) : {};
  const p = { ...base, id: base?.id || 0, price: num(b.price, base?.price), gst_rate: b.gst_rate != null ? num(b.gst_rate) : (base?.gst_rate || 0), cost: num(b.cost, base?.cost) };
  res.json(finance.economics(p, { price: b.price != null ? num(b.price) : undefined, cost: b.cost !== undefined && b.cost !== '' ? num(b.cost) : undefined, ship: b.ship !== undefined && b.ship !== '' ? num(b.ship) : undefined, packaging: b.packaging !== undefined && b.packaging !== '' ? num(b.packaging) : undefined, ad: b.ad !== undefined && b.ad !== '' ? num(b.ad) : undefined }));
}));

/* ---- CSV ---- */
const CSV_COLS = ['sku', 'name', 'name_hi', 'category', 'price', 'mrp', 'cost', 'stock', 'tagline', 'description', 'origin_country', 'manufacturer', 'warranty', 'tags', 'status'];
r.get('/export/csv', asyncH((req, res) => {
  const rows = db.prepare('SELECT p.*, c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.deleted_at IS NULL ORDER BY p.id').all();
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="products.csv"').send(toCSV(CSV_COLS, rows.map(p => CSV_COLS.map(c => c === 'tags' ? jparse(p.tags, []).join('|') : p[c]))));
}));
r.post('/import', asyncH((req, res) => {
  const rows = parseCSV(String(req.body?.csv || ''));
  if (rows.length < 2) throw bad('The CSV is empty. First row must be the column names.');
  const head = rows[0].map(h => h.trim().toLowerCase());
  if (!head.includes('name')) throw bad('CSV needs a "name" column.');
  let created = 0, updated = 0; const errors = [];
  db.transaction(() => {
    rows.slice(1).forEach((cells, i) => {
      const rec = Object.fromEntries(head.map((h, j) => [h, cells[j]]));
      if (!rec.name) return;
      try {
        const cat = rec.category ? db.prepare('SELECT id FROM categories WHERE LOWER(name)=LOWER(?)').get(rec.category.trim()) : null;
        const data = pickFields({ ...rec, tags: rec.tags ? rec.tags.split('|').map(s => s.trim()).filter(Boolean) : undefined });
        if (cat) data.category_id = cat.id;
        delete data.status;
        const ex = rec.sku ? db.prepare('SELECT id FROM products WHERE sku=? AND deleted_at IS NULL').get(rec.sku) : null;
        if (ex) { save(ex.id, data); updated++; } else { createProduct(data); created++; }
      } catch (e) { errors.push(`Row ${i + 2}: ${e.message}`); }
    });
  })();
  auth.logActivity(req.admin.id, 'import', 'products', '', `${created} new, ${updated} updated`, req);
  res.json({ created, updated, errors, note: 'Imported products are saved as drafts. Add photos and the legal fields, then publish.' });
}));

function createProduct(d) {
  if (!d.name) throw bad('Product name is required.');
  const ts = now(), slug = uniqueSlug(db, 'products', d.name);
  const cols = Object.keys(d);
  const id = db.prepare(`INSERT INTO products(slug,status,created_at,updated_at${cols.length ? ',' + cols.join(',') : ''}) VALUES(?,'draft',?,?${cols.map(() => ',?').join('')})`).run(slug, ts, ts, ...cols.map(c => d[c])).lastInsertRowid;
  catalog.reindex(id);
  return id;
}
function save(id, d) {
  const cols = Object.keys(d);
  if (cols.length) db.prepare(`UPDATE products SET ${cols.map(c => c + '=?').join(',')}, updated_at=? WHERE id=?`).run(...cols.map(c => d[c]), now(), id);
  catalog.reindex(id);
}

/* ---- single ---- */
r.get('/:id', asyncH((req, res) => { const p = full(int(req.params.id)); if (!p) throw notFound(); res.json(p); }));
r.post('/', asyncH((req, res) => {
  const d = pickFields(req.body || {});
  if (req.body?.category_id === undefined) { const c = db.prepare('SELECT id FROM categories WHERE deleted_at IS NULL ORDER BY sort LIMIT 1').get(); if (c) d.category_id = c.id; }
  const id = createProduct(d);
  if (Array.isArray(req.body?.variants)) saveVariants(id, req.body.variants);
  auth.logActivity(req.admin.id, 'create', 'product', id, d.name, req);
  res.json(full(id));
}));
r.put('/:id', asyncH((req, res) => {
  const id = int(req.params.id), ex = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!ex) throw notFound();
  const d = pickFields(req.body || {});
  delete d.risk_ack; // only /:id/ack may change confirmations
  if (d.name && d.name !== ex.name && req.body.regen_slug) d.slug = uniqueSlug(db, 'products', d.name, id);
  save(id, d);
  if (Array.isArray(req.body?.variants)) saveVariants(id, req.body.variants);
  // a published product that now fails the risk check goes back to draft, so a risky edit can never stay live
  const cur = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  let demoted = false;
  if (cur.status === 'published') { const rk = risk.checkProduct({ ...cur, tags: jparse(cur.tags, []) }); if (!rk.can_publish) { db.prepare("UPDATE products SET status='draft', updated_at=? WHERE id=?").run(now(), id); demoted = true; } }
  auth.logActivity(req.admin.id, 'update', 'product', id, ex.name, req);
  res.json({ ...full(id), demoted });
}));
function saveVariants(id, list) {
  const keep = [];
  list.slice(0, 30).forEach((v, i) => {
    const name = String(v.name || '').trim(); if (!name) return;
    const vals = [name, v.name_hi || null, v.sku || null, v.price === '' || v.price == null ? null : num(v.price), v.mrp === '' || v.mrp == null ? null : num(v.mrp), v.cost === '' || v.cost == null ? null : num(v.cost), Math.max(0, int(v.stock)), v.image_id ? int(v.image_id) : null, v.color || null, i, v.active === false ? 0 : 1];
    if (v.id && db.prepare('SELECT 1 FROM variants WHERE id=? AND product_id=?').get(int(v.id), id)) {
      db.prepare('UPDATE variants SET name=?,name_hi=?,sku=?,price=?,mrp=?,cost=?,stock=?,image_id=?,color=?,sort=?,active=? WHERE id=?').run(...vals, int(v.id)); keep.push(int(v.id));
    } else keep.push(db.prepare('INSERT INTO variants(name,name_hi,sku,price,mrp,cost,stock,image_id,color,sort,active,product_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(...vals, id).lastInsertRowid);
  });
  db.prepare(`DELETE FROM variants WHERE product_id=? ${keep.length ? 'AND id NOT IN (' + keep.map(() => '?').join(',') + ')' : ''}`).run(id, ...keep);
}
r.post('/:id/duplicate', asyncH((req, res) => {
  const id = int(req.params.id), p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!p) throw notFound();
  const { id: _i, slug: _s, created_at, updated_at, views, sold_count, status, deleted_at, ...rest } = p;
  rest.name = p.name + ' (copy)'; rest.sku = null;
  const nid = createProduct(rest);
  for (const v of db.prepare('SELECT * FROM variants WHERE product_id=?').all(id)) db.prepare('INSERT INTO variants(product_id,name,name_hi,sku,price,mrp,cost,stock,color,sort,active) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(nid, v.name, v.name_hi, null, v.price, v.mrp, v.cost, v.stock, v.color, v.sort, v.active);
  auth.logActivity(req.admin.id, 'duplicate', 'product', nid, p.name, req);
  res.json(full(nid));
}));
r.delete('/:id', asyncH((req, res) => {
  const id = int(req.params.id);
  db.prepare("UPDATE products SET deleted_at=?, status='draft', updated_at=? WHERE id=?").run(now(), now(), id);
  catalog.reindex(id);
  auth.logActivity(req.admin.id, 'trash', 'product', id, '', req);
  res.json({ ok: true });
}));
r.delete('/:id/forever', asyncH((req, res) => {
  const id = int(req.params.id), p = db.prepare('SELECT id, deleted_at FROM products WHERE id=?').get(id);
  if (!p) throw notFound();
  if (!p.deleted_at) throw bad('Move the product to Trash first.');
  db.prepare('DELETE FROM products WHERE id=?').run(id);
  try { catalog.reindex(id); } catch (e) { /* index entry already gone */ }
  auth.logActivity(req.admin.id, 'delete-forever', 'product', id, '', req);
  res.json({ ok: true });
}));
r.post('/:id/restore', asyncH((req, res) => { const id = int(req.params.id); db.prepare('UPDATE products SET deleted_at=NULL, updated_at=? WHERE id=?').run(now(), id); catalog.reindex(id); res.json({ ok: true }); }));
r.post('/:id/ack', asyncH((req, res) => {
  const id = int(req.params.id), p = db.prepare('SELECT risk_ack FROM products WHERE id=?').get(id);
  if (!p) throw notFound();
  const ack = jparse(p.risk_ack, {}) || {};
  for (const [code, on] of Object.entries(req.body?.codes || {})) { if (on) ack[code] = { at: now(), by: req.admin.email }; else delete ack[code]; }
  db.prepare('UPDATE products SET risk_ack=?, updated_at=? WHERE id=?').run(jstr(ack), now(), id);
  auth.logActivity(req.admin.id, 'risk_ack', 'product', id, Object.keys(req.body?.codes || {}).join(','), req);
  res.json(full(id));
}));

function publish(id, req, publishAt) {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!p) throw notFound();
  const rk = risk.checkProduct({ ...p, tags: jparse(p.tags, []) });
  if (!rk.can_publish) { const e = bad('This product is not ready to publish. Fix or confirm the items in the Risk checker.', { risk: rk }); e.status = 422; throw e; }
  const imgs = db.prepare('SELECT COUNT(*) c FROM product_images WHERE product_id=?').get(id).c;
  if (!imgs) throw bad('Add at least one photo before publishing.');
  if (publishAt) db.prepare("UPDATE products SET status='scheduled', publish_at=?, updated_at=? WHERE id=?").run(new Date(publishAt).toISOString(), now(), id);
  else db.prepare("UPDATE products SET status='published', publish_at=NULL, updated_at=? WHERE id=?").run(now(), id);
  catalog.reindex(id);
  auth.logActivity(req.admin.id, publishAt ? 'schedule' : 'publish', 'product', id, p.name, req);
}
r.post('/:id/publish', asyncH((req, res) => { publish(int(req.params.id), req, req.body?.publish_at); res.json(full(int(req.params.id))); }));
r.post('/:id/unpublish', asyncH((req, res) => { db.prepare("UPDATE products SET status='draft', updated_at=? WHERE id=?").run(now(), int(req.params.id)); auth.logActivity(req.admin.id, 'unpublish', 'product', int(req.params.id), '', req); res.json(full(int(req.params.id))); }));
r.post('/:id/stock', asyncH((req, res) => {
  const id = int(req.params.id), delta = int(req.body?.delta);
  if (!delta) throw bad('Enter how many to add or remove.');
  const vid = int(req.body?.variant_id) || null;
  const rr = vid ? db.prepare('UPDATE variants SET stock=stock+? WHERE id=? AND product_id=? AND stock+?>=0').run(delta, vid, id, delta) : db.prepare('UPDATE products SET stock=stock+? WHERE id=? AND stock+?>=0').run(delta, id, delta);
  if (!rr.changes) throw bad('Stock cannot go below zero.');
  auth.logActivity(req.admin.id, 'stock', 'product', id, `${delta > 0 ? '+' : ''}${delta} ${req.body?.reason || ''}`, req);
  res.json(full(id));
}));
r.post('/bulk', asyncH((req, res) => {
  const ids = (req.body?.ids || []).map(int).slice(0, 200), a = String(req.body?.action || ''), done = [], failed = [];
  for (const id of ids) {
    try {
      if (a === 'publish') publish(id, req);
      else if (a === 'unpublish') db.prepare("UPDATE products SET status='draft', updated_at=? WHERE id=?").run(now(), id);
      else if (a === 'trash') { db.prepare("UPDATE products SET deleted_at=?, status='draft' WHERE id=?").run(now(), id); catalog.reindex(id); }
      else if (a === 'price_pct') { const pct = num(req.body.value); db.prepare('UPDATE products SET price=ROUND(price*(1+?/100.0)), updated_at=? WHERE id=?').run(pct, now(), id); }
      else if (a === 'category') save(id, { category_id: int(req.body.value) });
      else if (a === 'featured') save(id, { featured: req.body.value ? 1 : 0 });
      else throw bad('Unknown action.');
      done.push(id);
    } catch (e) { failed.push({ id, error: e.message }); }
  }
  auth.logActivity(req.admin.id, 'bulk_' + a, 'product', ids.join(','), '', req);
  res.json({ done, failed });
}));

/* ---- images ---- */
r.post('/:id/images', upload.array('images', 12), asyncH(async (req, res) => {
  const id = int(req.params.id);
  if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(id)) throw notFound();
  if (!req.files?.length) throw bad('Choose at least one image.');
  const count = db.prepare('SELECT COUNT(*) c FROM product_images WHERE product_id=?').get(id).c;
  if (count + req.files.length > 15) throw bad('A product can have up to 15 photos.');
  let sort = db.prepare('SELECT COALESCE(MAX(sort),-1)+1 s FROM product_images WHERE product_id=?').get(id).s;
  const added = [];
  for (const f of req.files) {
    const out = await images.processProductImage(f.buffer);
    const iid = db.prepare('INSERT INTO product_images(product_id,file,alt,sort,w,h) VALUES(?,?,?,?,?,?)').run(id, out.file, String(req.body?.alt || '').slice(0, 120) || null, sort++, out.w, out.h).lastInsertRowid;
    added.push(iid);
  }
  db.prepare('UPDATE products SET updated_at=? WHERE id=?').run(now(), id);
  res.json(full(id));
}));
r.put('/:id/images/order', asyncH((req, res) => {
  const id = int(req.params.id), ids = (req.body?.ids || []).map(int);
  db.transaction(() => ids.forEach((iid, i) => db.prepare('UPDATE product_images SET sort=? WHERE id=? AND product_id=?').run(i, iid, id)))();
  res.json(full(id));
}));
r.patch('/:id/images/:iid', asyncH(async (req, res) => {
  const id = int(req.params.id), iid = int(req.params.iid), im = db.prepare('SELECT * FROM product_images WHERE id=? AND product_id=?').get(iid, id);
  if (!im) throw notFound();
  const b = req.body || {};
  const fx = b.focus_x != null ? Math.min(1, Math.max(0, num(b.focus_x, 0.5))) : im.focus_x, fy = b.focus_y != null ? Math.min(1, Math.max(0, num(b.focus_y, 0.5))) : im.focus_y;
  db.prepare('UPDATE product_images SET alt=?, alt_hi=?, focus_x=?, focus_y=?, variant_id=? WHERE id=?').run(b.alt !== undefined ? String(b.alt).slice(0, 120) : im.alt, b.alt_hi !== undefined ? String(b.alt_hi).slice(0, 120) : im.alt_hi, fx, fy, b.variant_id !== undefined ? (int(b.variant_id) || null) : im.variant_id, iid);
  if (fx !== im.focus_x || fy !== im.focus_y) await images.recrop(im.file, fx, fy);
  res.json(full(id));
}));
r.delete('/:id/images/:iid', asyncH((req, res) => {
  const id = int(req.params.id), im = db.prepare('SELECT * FROM product_images WHERE id=? AND product_id=?').get(int(req.params.iid), id);
  if (!im) throw notFound();
  db.prepare('DELETE FROM product_images WHERE id=?').run(im.id);
  db.prepare('UPDATE variants SET image_id=NULL WHERE image_id=?').run(im.id);
  images.removeFiles(im.file);
  res.json(full(id));
}));
// 360 spin frames
r.post('/:id/spin', upload.array('frames', 12), asyncH(async (req, res) => {
  const id = int(req.params.id), p = db.prepare('SELECT spin_images FROM products WHERE id=?').get(id);
  if (!p) throw notFound();
  const cur = jparse(p.spin_images, []);
  if (cur.length + (req.files?.length || 0) > 72) throw bad('Up to 72 frames are allowed.');
  for (const f of req.files || []) cur.push((await images.processProductImage(f.buffer)).file);
  db.prepare('UPDATE products SET spin_images=?, updated_at=? WHERE id=?').run(jstr(cur), now(), id);
  res.json(full(id));
}));
r.delete('/:id/spin', asyncH((req, res) => {
  const id = int(req.params.id), p = db.prepare('SELECT spin_images FROM products WHERE id=?').get(id);
  for (const f of jparse(p?.spin_images, [])) images.removeFiles(f);
  db.prepare("UPDATE products SET spin_images='[]', updated_at=? WHERE id=?").run(now(), id);
  res.json(full(id));
}));
// 3D model (GLB)
r.post('/:id/glb', glbUpload.single('model'), asyncH((req, res) => {
  const id = int(req.params.id);
  if (!req.file) throw bad('Choose a .glb file.');
  if (req.file.buffer.slice(0, 4).toString() !== 'glTF') throw bad('This is not a valid .glb file.');
  const dir = path.join(cfg.UPLOADS, 'files'); fs.mkdirSync(dir, { recursive: true });
  const name = token(8) + '.glb';
  fs.writeFileSync(path.join(dir, name), req.file.buffer);
  db.prepare('UPDATE products SET model_glb=?, updated_at=? WHERE id=?').run(name, now(), id);
  res.json(full(id));
}));
r.delete('/:id/glb', asyncH((req, res) => { db.prepare('UPDATE products SET model_glb=NULL, updated_at=? WHERE id=?').run(now(), int(req.params.id)); res.json(full(int(req.params.id))); }));

module.exports = r;

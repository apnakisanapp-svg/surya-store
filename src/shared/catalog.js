'use strict';
const db = require('./db');
const settings = require('./settings');
const { jparse, now, round2 } = require('./util');

const LIVE_SQL = "(p.deleted_at IS NULL AND (p.status='published' OR (p.status='scheduled' AND p.publish_at IS NOT NULL AND p.publish_at<=?)))";
const liveArgs = () => [now()];

function mediaUrl(file, kind) { return file ? `/media/${file}-${kind}.webp` : null; }

function stockState(p, variants) {
  const active = (variants || []).filter(v => v.active);
  const total = active.length ? active.reduce((s, v) => s + Math.max(0, v.stock), 0) : Math.max(0, p.stock);
  const limit = p.low_stock_limit != null ? p.low_stock_limit : settings.get('store').low_stock_default;
  let state = 'in';
  if (p.sold_out || total <= 0) state = p.preorder ? 'preorder' : 'out';
  else if (total <= limit) state = 'low';
  return { state, total };
}

function discountPct(price, mrp) { return mrp > price && price > 0 ? Math.round((1 - price / mrp) * 100) : 0; }

/** Load images/variants/ratings for a list of product rows in 4 queries. */
function hydrate(rows, { admin = false } = {}) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id), ph = ids.map(() => '?').join(',');
  const imgs = db.prepare(`SELECT * FROM product_images WHERE product_id IN (${ph}) ORDER BY sort, id`).all(...ids);
  const vars = db.prepare(`SELECT * FROM variants WHERE product_id IN (${ph}) ORDER BY sort, id`).all(...ids);
  const rat = db.prepare(`SELECT product_id, COUNT(*) c, AVG(rating) a FROM reviews WHERE status='approved' AND product_id IN (${ph}) GROUP BY product_id`).all(...ids);
  const cats = db.prepare('SELECT id, slug, name, name_hi FROM categories').all();
  const catMap = new Map(cats.map(c => [c.id, c]));
  const imgBy = {}, varBy = {}, ratBy = {};
  for (const i of imgs) (imgBy[i.product_id] ||= []).push(i);
  for (const v of vars) (varBy[v.product_id] ||= []).push(v);
  for (const r of rat) ratBy[r.product_id] = r;
  return rows.map(r => shape(r, imgBy[r.id] || [], varBy[r.id] || [], ratBy[r.id], catMap.get(r.category_id), admin));
}

function shape(p, images, variants, rating, cat, admin) {
  const st = stockState(p, variants);
  const showBelow = settings.get('store').show_stock_below;
  const out = {
    id: p.id, slug: p.slug, sku: p.sku, name: p.name, name_hi: p.name_hi, tagline: p.tagline, tagline_hi: p.tagline_hi,
    description: p.description, description_hi: p.description_hi, category: cat ? { id: cat.id, slug: cat.slug, name: cat.name, name_hi: cat.name_hi } : null,
    tags: jparse(p.tags, []), price: p.price, mrp: p.mrp > p.price ? p.mrp : 0, discount_pct: discountPct(p.price, p.mrp),
    badge: p.badge, featured: !!p.featured, preorder: !!p.preorder, stock_state: st.state, stock_left: st.state === 'low' || st.total <= showBelow ? st.total : null,
    max_per_order: p.max_per_order, specs: jparse(p.specs, []), safety: p.safety, safety_hi: p.safety_hi, safety_ack: !!p.safety_ack,
    warranty: p.warranty, warranty_hi: p.warranty_hi, origin_country: p.origin_country, manufacturer: p.manufacturer, importer: p.importer,
    has_battery: !!p.has_battery, video_url: p.video_url, model_glb: p.model_glb ? `/media/files/${p.model_glb}` : null,
    spin: jparse(p.spin_images, []).map(f => mediaUrl(f, 'gal')), faq: jparse(p.faq, []), weight_g: p.weight_g,
    seo_title: p.seo_title, seo_desc: p.seo_desc, created_at: p.created_at, views: p.views, sold_count: p.sold_count,
    rating: rating ? { avg: round2(rating.a), count: rating.c } : { avg: 0, count: 0 },
    images: images.filter(i => !i.variant_id || true).map(i => ({
      id: i.id, variant_id: i.variant_id, alt: i.alt, alt_hi: i.alt_hi, w: i.w, h: i.h, focus_x: i.focus_x, focus_y: i.focus_y, file: i.file,
      card: mediaUrl(i.file, 'card'), gal: mediaUrl(i.file, 'gal'), thumb: mediaUrl(i.file, 'thumb'),
    })),
    variants: variants.filter(v => admin || v.active).map(v => ({
      id: v.id, name: v.name, name_hi: v.name_hi, sku: v.sku, price: v.price != null ? v.price : p.price, mrp: (v.mrp != null ? v.mrp : p.mrp) > (v.price != null ? v.price : p.price) ? (v.mrp != null ? v.mrp : p.mrp) : 0,
      color: v.color, image_id: v.image_id, in_stock: v.stock > 0 || !!p.preorder, stock_left: v.stock > 0 && v.stock <= showBelow ? v.stock : null, active: !!v.active,
      ...(admin ? { stock: v.stock, cost: v.cost, sort: v.sort } : {}),
    })),
  };
  if (admin) {
    Object.assign(out, {
      status: p.status, publish_at: p.publish_at, cost: p.cost, stock: p.stock, low_stock_limit: p.low_stock_limit, sold_out: !!p.sold_out, hsn: p.hsn, gst_rate: p.gst_rate,
      is_electronic: !!p.is_electronic, has_blade: !!p.has_blade, is_liquid: !!p.is_liquid, is_cosmetic_food: !!p.is_cosmetic_food, brand_used: p.brand_used,
      risk_ack: jparse(p.risk_ack, {}), similar_mode: p.similar_mode, similar_ids: jparse(p.similar_ids, []), packaging_cost: p.packaging_cost, ad_cost: p.ad_cost,
      shipping_cost: p.shipping_cost, dims: p.dims, sort: p.sort, updated_at: p.updated_at, deleted_at: p.deleted_at, category_id: p.category_id,
      model_glb_file: p.model_glb, spin_files: jparse(p.spin_images, []),
    });
  }
  return out;
}

function getBySlug(slug) {
  const r = db.prepare(`SELECT p.* FROM products p WHERE p.slug=? AND ${LIVE_SQL}`).get(slug, ...liveArgs());
  return r ? hydrate([r])[0] : null;
}
function getById(id, admin = false) {
  const r = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  return r ? hydrate([r], { admin })[0] : null;
}

const SORTS = {
  trending: "(p.sold_count*3 + p.views/10.0 + p.featured*5) DESC, p.id DESC",
  new: 'p.created_at DESC', popular: 'p.sold_count DESC, p.views DESC', price_asc: 'p.price ASC', price_desc: 'p.price DESC',
  discount: '((p.mrp - p.price)*1.0/NULLIF(p.mrp,0)) DESC', relevance: 'p.sort ASC, p.id DESC',
};

function ftsQuery(q) {
  const toks = String(q || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
  if (!toks.length) return '';
  return toks.map(t => `"${t}"*`).join(' ');
}

function listPublic(opts = {}) {
  const { q, category, min, max, inStock, sort = 'trending', page = 1, limit = 12, ids, offers, tag, exclude } = opts;
  const where = [LIVE_SQL], args = [...liveArgs()];
  let joinOrder = '';
  if (q) {
    const fq = ftsQuery(q);
    let hit = [];
    if (fq) { try { hit = db.prepare('SELECT rowid id FROM products_fts WHERE products_fts MATCH ? ORDER BY rank LIMIT 200').all(fq).map(r => r.id); } catch { hit = []; } }
    if (!hit.length) {
      const like = '%' + String(q).replace(/[%_]/g, '') + '%';
      hit = db.prepare('SELECT id FROM products WHERE name LIKE ? OR tags LIKE ? OR description LIKE ? OR name_hi LIKE ? LIMIT 100').all(like, like, like, like).map(r => r.id);
    }
    if (!hit.length) { return { items: [], total: 0, page, pages: 0 }; }
    where.push(`p.id IN (${hit.map(() => '?').join(',')})`); args.push(...hit);
    if (sort === 'relevance') joinOrder = `CASE p.id ${hit.map((id, i) => `WHEN ${Number(id)} THEN ${i}`).join(' ')} END`;
  }
  if (category) {
    const c = db.prepare('SELECT id FROM categories WHERE (slug=? OR id=?) AND deleted_at IS NULL').get(category, Number(category) || 0);
    if (!c) return { items: [], total: 0, page, pages: 0 };
    const kids = db.prepare('SELECT id FROM categories WHERE parent_id=?').all(c.id).map(r => r.id);
    const all = [c.id, ...kids];
    where.push(`p.category_id IN (${all.map(() => '?').join(',')})`); args.push(...all);
  }
  if (min != null && min !== '') { where.push('p.price>=?'); args.push(Number(min)); }
  if (max != null && max !== '') { where.push('p.price<=?'); args.push(Number(max)); }
  if (offers) where.push('p.mrp > p.price');
  if (tag) { where.push('p.tags LIKE ?'); args.push('%"' + String(tag).replace(/["%_]/g, '') + '"%'); }
  if (inStock) where.push("((p.sold_out=0) AND (CASE WHEN EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.active=1) THEN EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.active=1 AND v.stock>0) ELSE p.stock>0 END OR p.preorder=1))");
  if (ids && ids.length) { where.push(`p.id IN (${ids.map(() => '?').join(',')})`); args.push(...ids.map(Number)); }
  if (exclude && exclude.length) { where.push(`p.id NOT IN (${exclude.map(() => '?').join(',')})`); args.push(...exclude.map(Number)); }
  if (!settings.get('store').show_sold_out) where.push('(p.sold_out=0)');
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM products p WHERE ${w}`).get(...args).c;
  const order = (q && sort === 'relevance' && joinOrder) ? joinOrder : (SORTS[sort] || SORTS.trending);
  const lim = Math.min(Math.max(Number(limit) || 12, 1), 60), off = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const rows = db.prepare(`SELECT p.* FROM products p WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, lim, off);
  return { items: hydrate(rows), total, page: Number(page) || 1, pages: Math.ceil(total / lim) };
}

function similar(prod, limit = 10) {
  const full = db.prepare('SELECT similar_mode, similar_ids, tags, category_id FROM products WHERE id=?').get(prod.id);
  let ids = [];
  if (full.similar_mode === 'manual') {
    ids = jparse(full.similar_ids, []);
  }
  const live = db.prepare(`SELECT p.id FROM products p WHERE ${LIVE_SQL} AND p.id<>? AND p.category_id IS ? ORDER BY (p.sold_count*3+p.views/10.0) DESC LIMIT ?`)
    .all(...liveArgs(), prod.id, full.category_id, limit * 2).map(r => r.id);
  const more = db.prepare(`SELECT p.id FROM products p WHERE ${LIVE_SQL} AND p.id<>? ORDER BY (p.sold_count*3+p.views/10.0) DESC LIMIT ?`).all(...liveArgs(), prod.id, limit * 2).map(r => r.id);
  for (const id of [...live, ...more]) if (!ids.includes(id)) ids.push(id);
  ids = ids.filter(id => id !== prod.id).slice(0, limit);
  if (!ids.length) return [];
  const res = listPublic({ ids, limit: limit, sort: 'relevance' }).items;
  const pos = new Map(ids.map((id, i) => [id, i]));
  return res.sort((a, b) => pos.get(a.id) - pos.get(b.id));
}

function reindex(id) {
  const p = db.prepare('SELECT p.*, c.name cat FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?').get(id);
  db.prepare('DELETE FROM products_fts WHERE rowid=?').run(id);
  if (!p || p.deleted_at) return;
  db.prepare('INSERT INTO products_fts(rowid,name,name_hi,tagline,description,tags,category) VALUES(?,?,?,?,?,?,?)')
    .run(id, p.name || '', p.name_hi || '', p.tagline || '', String(p.description || '').replace(/<[^>]+>/g, ' '), (jparse(p.tags, []) || []).join(' '), p.cat || '');
}
function reindexAll() { for (const r of db.prepare('SELECT id FROM products').all()) reindex(r.id); }

module.exports = { LIVE_SQL, liveArgs, hydrate, shape, getBySlug, getById, listPublic, similar, reindex, reindexAll, stockState, discountPct, mediaUrl };

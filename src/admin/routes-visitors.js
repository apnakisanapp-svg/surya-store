'use strict';
// Insights: who visited, from where (reel / Short / WhatsApp...), what they looked at, what they bought.
const express = require('express');
const db = require('../shared/db');
const cfg = require('../shared/config');
const shortlink = require('../shared/shortlink');
const track = require('../shared/track');
const { asyncH, bad, notFound, int, now, round2, csvEscape } = require('../shared/util');
const visitPolicy = require('../shared/visitpolicy');
try { visitPolicy.ensure(false); } catch { /* policies not ready: the owner can press the button */ }

const r = express.Router();
const IST = 330 * 60000;
const NOT_LOST = "status NOT IN ('cancelled','returned')";

/** Window start/end. days=0 means "today" (from midnight, India time). */
function windowOf(q) {
  const days = [0, 1, 7, 30, 90].includes(int(q.days, 7)) ? int(q.days, 7) : 7;
  const nowMs = Date.now(), istMid = Math.floor((nowMs + IST) / 864e5) * 864e5 - IST;
  const from = days === 0 ? istMid : days === 1 ? istMid - 864e5 : istMid - (days - 1) * 864e5;
  const span = nowMs - from + 1, prevFrom = from - span;
  return { days, from: new Date(from).toISOString(), to: new Date(nowMs + 1000).toISOString(), pfrom: new Date(prevFrom).toISOString(), pto: new Date(from).toISOString() };
}
const pct = (a, b) => b > 0 ? round2(a / b * 100) : 0;
const delta = (cur, prev) => prev > 0 ? round2((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0);

function totals(f, t) {
  const v = db.prepare('SELECT COUNT(*) visits, COUNT(DISTINCT vid) visitors, COALESCE(SUM(is_new),0) newv, COALESCE(SUM(pages<=1),0) bounce, COALESCE(AVG(NULLIF(dur,0)),0) avg_dur, COALESCE(SUM(atc),0) atc, COALESCE(SUM(checkout),0) checkout, COALESCE(SUM(ordered),0) ordered FROM visits WHERE started_at>=? AND started_at<?').get(f, t);
  const pv = db.prepare('SELECT COUNT(*) n, COUNT(DISTINCT CASE WHEN kind=\'product\' THEN visit_id END) pvisits FROM page_views WHERE created_at>=? AND created_at<?').get(f, t);
  const o = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) v FROM orders WHERE placed_at>=? AND placed_at<? AND ${NOT_LOST}`).get(f, t);
  return { ...v, page_views: pv.n, product_visits: pv.pvisits, orders: o.n, revenue: round2(o.v) };
}

r.get('/overview', asyncH((req, res) => {
  const w = windowOf(req.query), cur = totals(w.from, w.to), prev = totals(w.pfrom, w.pto);
  const day = "substr(datetime(started_at,'+330 minutes'),1,10)";
  const daily = db.prepare(`SELECT ${day} d, COUNT(*) visits, COUNT(DISTINCT vid) visitors FROM visits WHERE started_at>=? AND started_at<? GROUP BY d ORDER BY d`).all(w.from, w.to);
  const ord = db.prepare("SELECT substr(datetime(placed_at,'+330 minutes'),1,10) d, COUNT(*) n, COALESCE(SUM(total),0) v FROM orders WHERE placed_at>=? AND placed_at<? AND " + NOT_LOST + ' GROUP BY d').all(w.from, w.to);
  const om = Object.fromEntries(ord.map(x => [x.d, x]));
  const days = new Set([...daily.map(x => x.d), ...ord.map(x => x.d)]);
  const series = [...days].sort().map(d => { const a = daily.find(x => x.d === d) || {}; return { d, visitors: a.visitors || 0, visits: a.visits || 0, orders: (om[d] || {}).n || 0, revenue: round2((om[d] || {}).v || 0) }; });
  const hours = Array(24).fill(0);
  for (const x of db.prepare("SELECT CAST(strftime('%H', datetime(started_at,'+330 minutes')) AS INTEGER) h, COUNT(*) c FROM visits WHERE started_at>=? AND started_at<? GROUP BY h").all(w.from, w.to)) hours[x.h] = x.c;
  const dev = db.prepare('SELECT device, COUNT(*) c FROM visits WHERE started_at>=? AND started_at<? GROUP BY device ORDER BY c DESC').all(w.from, w.to);
  const live = db.prepare('SELECT COUNT(DISTINCT vid) c FROM visits WHERE last_at>=?').get(new Date(Date.now() - 5 * 60000).toISOString()).c;
  const livePages = db.prepare('SELECT pv.path, COUNT(*) c FROM page_views pv JOIN visits v ON v.id=pv.visit_id WHERE v.last_at>=? AND pv.id=(SELECT MAX(id) FROM page_views WHERE visit_id=v.id) GROUP BY pv.path ORDER BY c DESC LIMIT 5').all(new Date(Date.now() - 5 * 60000).toISOString());
  const landing = db.prepare('SELECT landing path, COUNT(*) c FROM visits WHERE started_at>=? AND started_at<? GROUP BY landing ORDER BY c DESC LIMIT 6').all(w.from, w.to);
  const total = db.prepare('SELECT COUNT(*) c FROM visits').get().c;
  res.json({ days: w.days, cur, prev: { visitors: prev.visitors, visits: prev.visits, page_views: prev.page_views, orders: prev.orders, revenue: prev.revenue },
    change: { visitors: delta(cur.visitors, prev.visitors), orders: delta(cur.orders, prev.orders), revenue: delta(cur.revenue, prev.revenue), page_views: delta(cur.page_views, prev.page_views) },
    bounce_pct: pct(cur.bounce, cur.visits), new_pct: pct(cur.newv, cur.visits), avg_dur: Math.round(cur.avg_dur),
    funnel: [['Visits', cur.visits], ['Saw a product', cur.product_visits], ['Added to cart', cur.atc], ['Started checkout', cur.checkout], ['Ordered', cur.ordered]],
    series, hours, devices: dev, live, live_pages: livePages, landing, any_data: total > 0 });
}));

r.get('/sources', asyncH((req, res) => {
  const w = windowOf(req.query);
  const vs = db.prepare('SELECT src, COUNT(*) visits, COUNT(DISTINCT vid) visitors, COALESCE(AVG(NULLIF(dur,0)),0) avg_dur, COALESCE(SUM(pages<=1),0) bounce, COALESCE(SUM(atc),0) atc FROM visits WHERE started_at>=? AND started_at<? GROUP BY src').all(w.from, w.to);
  const os = db.prepare(`SELECT COALESCE(src,'unknown') src, COUNT(*) n, COALESCE(SUM(total),0) v FROM orders WHERE placed_at>=? AND placed_at<? AND ${NOT_LOST} GROUP BY COALESCE(src,'unknown')`).all(w.from, w.to);
  const names = new Set([...vs.map(x => x.src), ...os.map(x => x.src)]);
  const rows = [...names].map(s => { const a = vs.find(x => x.src === s) || {}, o = os.find(x => x.src === s) || {}; return { src: s, visits: a.visits || 0, visitors: a.visitors || 0, avg_dur: Math.round(a.avg_dur || 0), bounce_pct: pct(a.bounce || 0, a.visits || 0), atc: a.atc || 0, orders: o.n || 0, revenue: round2(o.v || 0), conv_pct: pct(o.n || 0, a.visits || 0) }; })
    .sort((a, b) => b.visits - a.visits || b.orders - a.orders);
  res.json({ days: w.days, rows });
}));

/* ---------- reels & shorts (tagged links) ---------- */
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
const PFX = { instagram: 'ig', youtube: 'yt', whatsapp: 'wa', facebook: 'fb', google: 'g', other: 'ot' };
function linksFor(c) {
  const path = c.target && c.target[0] === '/' ? c.target : '/';
  const full = `${cfg.SITE_URL}${path}${path.includes('?') ? '&' : '?'}src=${c.code}`;
  let short = full; try { short = shortlink.make(`${path}${path.includes('?') ? '&' : '?'}src=${c.code}`); } catch { /* keep full */ }
  return { link: full, short };
}
r.get('/campaigns', asyncH((req, res) => {
  const w = windowOf(req.query);
  const list = db.prepare('SELECT * FROM campaigns WHERE archived=0 ORDER BY id DESC').all();
  const seen = db.prepare("SELECT campaign code, src platform FROM visits WHERE campaign<>'' AND started_at>=? AND started_at<? GROUP BY campaign").all(w.from, w.to);
  const known = new Set(list.map(c => c.code));
  const all = [...list, ...seen.filter(x => !known.has(x.code)).map(x => ({ id: 0, name: x.code + ' (tag not saved)', code: x.code, platform: x.platform, target: '/' }))];
  const rows = all.map(c => {
    const v = db.prepare('SELECT COUNT(*) visits, COUNT(DISTINCT vid) visitors, COALESCE(AVG(NULLIF(dur,0)),0) avg_dur, COALESCE(SUM(atc),0) atc, COALESCE(SUM(checkout),0) checkout FROM visits WHERE campaign=? AND started_at>=? AND started_at<?').get(c.code, w.from, w.to);
    const pv = db.prepare("SELECT COUNT(DISTINCT pv.visit_id) n FROM page_views pv JOIN visits v ON v.id=pv.visit_id WHERE v.campaign=? AND pv.kind='product' AND v.started_at>=? AND v.started_at<?").get(c.code, w.from, w.to).n;
    const o = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM orders WHERE campaign=? AND placed_at>=? AND placed_at<? AND ${NOT_LOST}`).get(c.code, w.from, w.to);
    return { id: c.id, name: c.name, code: c.code, platform: c.platform, target: c.target, ...(c.id ? linksFor(c) : { link: '', short: '' }), visits: v.visits, visitors: v.visitors, avg_dur: Math.round(v.avg_dur), saw_product: pv, atc: v.atc, checkout: v.checkout, orders: o.n, revenue: round2(o.t), conv_pct: pct(o.n, v.visits), created_at: c.created_at };
  }).sort((a, b) => b.visits - a.visits || b.id - a.id);
  res.json({ days: w.days, rows });
}));
r.post('/campaigns', asyncH((req, res) => {
  const b = req.body || {}, name = String(b.name || '').trim().slice(0, 60);
  if (!name) throw bad('Give this reel or Short a name, for example "Gloves reel".');
  const platform = track.PLATFORMS.includes(b.platform) ? b.platform : 'other';
  let target = String(b.target || '/').trim();
  if (/^https?:\/\//i.test(target)) { try { const u = new URL(target); target = u.pathname + u.search; } catch { target = '/'; } }
  if (target[0] !== '/' || target[1] === '/' || target.length > 300) target = '/';
  const base = `${PFX[platform]}-${slug(name) || 'link'}`; let code = base, i = 1;
  while (db.prepare('SELECT 1 FROM campaigns WHERE code=?').get(code)) code = `${base}-${++i}`;
  const id = db.prepare('INSERT INTO campaigns(name,code,platform,target,created_at) VALUES(?,?,?,?,?)').run(name, code, platform, target, now()).lastInsertRowid;
  res.json({ ok: true, id, code, ...linksFor({ code, target }) });
}));
r.put('/campaigns/:id', asyncH((req, res) => {
  const id = int(req.params.id), c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(id); if (!c) throw notFound();
  const name = String(req.body?.name || c.name).trim().slice(0, 60) || c.name;
  db.prepare('UPDATE campaigns SET name=? WHERE id=?').run(name, id); res.json({ ok: true });
}));
r.delete('/campaigns/:id', asyncH((req, res) => { db.prepare('UPDATE campaigns SET archived=1 WHERE id=?').run(int(req.params.id)); res.json({ ok: true }); }));

/* ---------- products ---------- */
r.get('/products', asyncH((req, res) => {
  const w = windowOf(req.query);
  const ps = db.prepare("SELECT id, name, slug, status FROM products WHERE deleted_at IS NULL ORDER BY id").all();
  const ev = db.prepare('SELECT product_id id, SUM(type=\'view\') v, SUM(type=\'atc\') a, SUM(type=\'wish\') w, SUM(type=\'checkout\') c FROM product_events WHERE created_at>=? AND created_at<? GROUP BY product_id').all(w.from, w.to);
  const tm = db.prepare("SELECT product_id id, AVG(NULLIF(dur,0)) ms, AVG(NULLIF(scroll,0)) sc FROM page_views WHERE kind='product' AND created_at>=? AND created_at<? GROUP BY product_id").all(w.from, w.to);
  const sold = db.prepare(`SELECT oi.product_id id, COALESCE(SUM(oi.qty),0) q, COUNT(DISTINCT o.id) n, COALESCE(SUM(oi.price*oi.qty),0) v FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.placed_at>=? AND o.placed_at<? AND o.${NOT_LOST} GROUP BY oi.product_id`).all(w.from, w.to);
  const E = Object.fromEntries(ev.map(x => [x.id, x])), T = Object.fromEntries(tm.map(x => [x.id, x])), S = Object.fromEntries(sold.map(x => [x.id, x]));
  const rows = ps.map(p => { const e = E[p.id] || {}, t = T[p.id] || {}, s = S[p.id] || {}; const views = e.v || 0;
    return { id: p.id, name: p.name, slug: p.slug, status: p.status, views, avg_sec: Math.round((t.ms || 0) / 1000), scroll: Math.round(t.sc || 0), atc: e.a || 0, wish: e.w || 0, checkout: e.c || 0, orders: s.n || 0, qty: s.q || 0, revenue: round2(s.v || 0),
      conv_pct: pct(s.n || 0, views), flag: views >= 8 && !(s.n) ? 'looked_not_bought' : (views >= 8 && (e.a || 0) === 0 ? 'looked_not_carted' : '') }; })
    .filter(p => p.views || p.orders || p.atc).sort((a, b) => b.views - a.views || b.orders - a.orders);
  res.json({ days: w.days, rows });
}));

/* ---------- helpers for Release 11 ---------- */
const nameMap = () => Object.fromEntries(db.prepare('SELECT id, name, slug FROM products').all().map(p => [p.id, p]));
const pageLabel = (path, kind, P) => { if (path === '/') return 'Home'; if (kind === 'product') { const sl = path.slice(3); const p = Object.values(P).find(x => x.slug === sl); return p ? p.name : path; } return path; };
const anon = vid => { let n = 0; for (const c of String(vid)) n = (n * 31 + c.charCodeAt(0)) % 9000; return 'Visitor #' + (1000 + n); };
const csv = (head, rows) => '﻿' + [head, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');
const custOf = "COALESCE(v.customer_id,(SELECT MAX(x.customer_id) FROM visits x WHERE x.vid=v.vid))";

/* ---------- pages ---------- */
r.get('/pages', asyncH((req, res) => {
  const w = windowOf(req.query), P = nameMap();
  const kinds = db.prepare("SELECT kind, COUNT(*) views, COUNT(DISTINCT visit_id) visits, AVG(NULLIF(dur,0)) ms, AVG(NULLIF(scroll,0)) sc, SUM(id=(SELECT MAX(id) FROM page_views WHERE visit_id=pv.visit_id)) exits FROM page_views pv WHERE created_at>=? AND created_at<? GROUP BY kind ORDER BY views DESC").all(w.from, w.to)
    .map(k => ({ kind: k.kind, views: k.views, visits: k.visits, avg_sec: Math.round((k.ms || 0) / 1000), scroll: Math.round(k.sc || 0), exits: k.exits || 0, exit_pct: pct(k.exits || 0, k.views) }));
  const pages = db.prepare("SELECT path, kind, COUNT(*) views, AVG(NULLIF(dur,0)) ms, AVG(NULLIF(scroll,0)) sc, SUM(id=(SELECT MIN(id) FROM page_views WHERE visit_id=pv.visit_id)) entries, SUM(id=(SELECT MAX(id) FROM page_views WHERE visit_id=pv.visit_id)) exits FROM page_views pv WHERE created_at>=? AND created_at<? GROUP BY path ORDER BY views DESC LIMIT 60").all(w.from, w.to)
    .map(x => ({ path: x.path, label: pageLabel(x.path, x.kind, P), kind: x.kind, views: x.views, avg_sec: Math.round((x.ms || 0) / 1000), scroll: Math.round(x.sc || 0), entries: x.entries || 0, exits: x.exits || 0, exit_pct: pct(x.exits || 0, x.views) }));
  res.json({ days: w.days, kinds, pages });
}));

/* ---------- journeys ---------- */
r.get('/journeys', asyncH((req, res) => {
  const w = windowOf(req.query), f = String(req.query.filter || 'all'), page = Math.max(1, int(req.query.page, 1)), per = 25;
  const where = ['v.started_at>=?', 'v.started_at<?'], args = [w.from, w.to];
  if (f === 'ordered') where.push('v.ordered=1'); else if (f === 'carted') where.push('v.atc=1 AND v.ordered=0'); else if (f === 'new') where.push('v.is_new=1'); else if (f === 'login') where.push(custOf + ' IS NOT NULL');
  if (req.query.campaign) { where.push('v.campaign=?'); args.push(String(req.query.campaign).slice(0, 40)); }
  const total = db.prepare(`SELECT COUNT(*) c FROM visits v WHERE ${where.join(' AND ')}`).get(...args).c;
  const rows = db.prepare(`SELECT v.*, c.name cname, c.email cemail FROM visits v LEFT JOIN customers c ON c.id=${custOf} WHERE ${where.join(' AND ')} ORDER BY v.id DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  res.json({ days: w.days, total, page, pages: Math.ceil(total / per), items: rows.map(v => ({ id: v.id, who: v.cname ? `${v.cname}${v.cemail ? ' · ' + v.cemail : ''}` : anon(v.vid), login: !!v.cname, started_at: v.started_at, src: v.src, campaign: v.campaign, device: v.device, landing: v.landing, pages: v.pages, dur: v.dur, atc: !!v.atc, checkout: !!v.checkout, ordered: !!v.ordered, is_new: !!v.is_new })) });
}));
r.get('/journeys/:id', asyncH((req, res) => {
  const v = db.prepare(`SELECT v.*, c.name cname, c.email cemail FROM visits v LEFT JOIN customers c ON c.id=${custOf} WHERE v.id=?`).get(int(req.params.id)); if (!v) throw notFound('Visit not found.');
  const P = nameMap(), steps = [];
  for (const p of db.prepare('SELECT * FROM page_views WHERE visit_id=? ORDER BY id').all(v.id)) steps.push({ at: p.created_at, type: 'page', label: pageLabel(p.path, p.kind, P), path: p.path, kind: p.kind, sec: Math.round((p.dur || 0) / 1000), scroll: p.scroll || 0 });
  for (const e of db.prepare('SELECT * FROM visit_events WHERE visit_id=? ORDER BY id').all(v.id)) {
    const prod = e.product_id && P[e.product_id] ? P[e.product_id].name : '';
    steps.push({ at: e.created_at, type: e.type, label: e.type === 'atc' ? 'Added to cart' + (prod ? ': ' + prod : '') : e.type === 'checkout' ? 'Started checkout' + (prod ? ': ' + prod : '') : e.type === 'wish' ? 'Saved to wishlist' + (prod ? ': ' + prod : '') : 'Placed an order ' + String(e.ref || '').split('|')[0], total: e.type === 'order' ? Number(String(e.ref || '').split('|')[1]) || 0 : null });
  }
  steps.sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
  res.json({ visit: { id: v.id, who: v.cname ? `${v.cname}${v.cemail ? ' · ' + v.cemail : ''}` : anon(v.vid), login: !!v.cname, started_at: v.started_at, src: v.src, campaign: v.campaign, device: v.device, ref_host: v.ref_host, landing: v.landing, pages: v.pages, dur: v.dur, is_new: !!v.is_new }, steps });
}));

/* ---------- carts left behind ---------- */
r.get('/abandoned', asyncH((req, res) => {
  const w = windowOf(req.query), P = nameMap();
  const rows = db.prepare("SELECT e.product_id, COUNT(DISTINCT e.visit_id) visits, MAX(e.created_at) last_at FROM visit_events e JOIN visits v ON v.id=e.visit_id WHERE e.type='atc' AND v.ordered=0 AND e.created_at>=? AND e.created_at<? GROUP BY e.product_id ORDER BY visits DESC").all(w.from, w.to);
  const total = db.prepare("SELECT COUNT(DISTINCT visit_id) c FROM visit_events e JOIN visits v ON v.id=e.visit_id WHERE e.type='atc' AND v.ordered=0 AND e.created_at>=? AND e.created_at<?").get(w.from, w.to).c;
  const left = db.prepare("SELECT COUNT(*) c FROM visits WHERE checkout=1 AND ordered=0 AND started_at>=? AND started_at<?").get(w.from, w.to).c;
  res.json({ days: w.days, total, left_checkout: left, rows: rows.map(x => ({ product_id: x.product_id, name: x.product_id && P[x.product_id] ? P[x.product_id].name : '(removed product)', visits: x.visits, last_at: x.last_at })) });
}));

/* ---------- searches ---------- */
r.get('/searches', asyncH((req, res) => {
  const w = windowOf(req.query);
  const rows = db.prepare("SELECT LOWER(TRIM(term)) term, COUNT(*) n, MAX(results) results FROM search_log WHERE term<>'' AND created_at>=? AND created_at<? GROUP BY LOWER(TRIM(term)) ORDER BY n DESC LIMIT 80").all(w.from, w.to);
  res.json({ days: w.days, rows, nothing: rows.filter(x => !x.results).slice(0, 30) });
}));

/* ---------- people ---------- */
r.get('/people', asyncH((req, res) => {
  const w = windowOf(req.query), P = nameMap();
  const rows = db.prepare("SELECT vid, MAX(customer_id) cid, COUNT(*) visits, SUM(pages) pages, MIN(started_at) first_at, MAX(last_at) last_at, MAX(device) device, SUM(atc) atc, SUM(ordered) ordered, SUM(dur) dur, MAX(src) src FROM visits WHERE started_at>=? AND started_at<? GROUP BY vid ORDER BY MAX(last_at) DESC LIMIT 400").all(w.from, w.to);
  const guests = rows.filter(x => !x.cid).slice(0, 100).map(x => ({ who: anon(x.vid), visits: x.visits, pages: x.pages, first_at: x.first_at, last_at: x.last_at, device: x.device, src: x.src, atc: x.atc, ordered: x.ordered, dur: x.dur }));
  const by = {}; for (const x of rows.filter(x => x.cid)) { const c = (by[x.cid] ||= { cid: x.cid, vids: [], visits: 0, pages: 0, dur: 0, last_at: '', first_at: x.first_at, atc: 0, ordered: 0 }); c.vids.push(x.vid); c.visits += x.visits; c.pages += x.pages; c.dur += x.dur; c.atc += x.atc; c.ordered += x.ordered; if (x.last_at > c.last_at) c.last_at = x.last_at; if (x.first_at < c.first_at) c.first_at = x.first_at; }
  const logins = Object.values(by).slice(0, 100).map(c => {
    const cu = db.prepare('SELECT name,email FROM customers WHERE id=?').get(c.cid) || {};
    const ord = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) v FROM orders WHERE customer_id=? AND ${NOT_LOST}`).get(c.cid);
    const seen = db.prepare(`SELECT product_id, COUNT(*) n FROM page_views pv JOIN visits v ON v.id=pv.visit_id WHERE v.vid IN (${c.vids.map(() => '?').join(',')}) AND pv.kind='product' AND pv.product_id IS NOT NULL AND pv.created_at>=? AND pv.created_at<? GROUP BY product_id ORDER BY n DESC LIMIT 3`).all(...c.vids, w.from, w.to);
    return { id: c.cid, name: cu.name || '(no name)', email: cu.email || '', visits: c.visits, pages: c.pages, dur: c.dur, first_at: c.first_at, last_at: c.last_at, atc: c.atc, orders: ord.n, spent: round2(ord.v), seen: seen.map(s => P[s.product_id] ? P[s.product_id].name : '').filter(Boolean) };
  });
  res.json({ days: w.days, logins, guests });
}));

/* ---------- month by month ---------- */
function monthlyRows() {
  const m = d => `substr(datetime(${d},'+330 minutes'),1,7)`;
  const since = new Date(Date.now() - 366 * 864e5).toISOString();
  const vs = db.prepare(`SELECT ${m('started_at')} m, COUNT(*) visits, COUNT(DISTINCT vid) visitors FROM visits WHERE started_at>=? GROUP BY m`).all(since);
  const pv = db.prepare(`SELECT ${m('created_at')} m, COUNT(*) n FROM page_views WHERE created_at>=? GROUP BY m`).all(since);
  const os = db.prepare(`SELECT ${m('placed_at')} m, COUNT(*) n, COALESCE(SUM(total),0) v FROM orders WHERE placed_at>=? AND ${NOT_LOST} GROUP BY m`).all(since);
  const sr = db.prepare(`SELECT ${m('started_at')} m, src, COUNT(*) c FROM visits WHERE started_at>=? GROUP BY m, src`).all(since);
  const cp = db.prepare(`SELECT ${m('started_at')} m, campaign, COUNT(*) c FROM visits WHERE started_at>=? AND campaign<>'' GROUP BY m, campaign`).all(since);
  const tp = db.prepare(`SELECT ${m('o.placed_at')} m, oi.name, SUM(oi.qty) q FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.placed_at>=? AND o.${NOT_LOST} GROUP BY m, oi.product_id`).all(since);
  const months = [...new Set([...vs, ...pv, ...os].map(x => x.m))].sort().reverse().slice(0, 12);
  const top = (list, key, m2) => list.filter(x => x.m === m2).sort((a, b) => (b.c || b.q) - (a.c || a.q))[0];
  const rows = months.map((mo, i) => { const a = vs.find(x => x.m === mo) || {}, o = os.find(x => x.m === mo) || {}, s = top(sr, 'src', mo), c = top(cp, 'campaign', mo), p = top(tp, 'name', mo);
    return { month: mo, visitors: a.visitors || 0, visits: a.visits || 0, page_views: (pv.find(x => x.m === mo) || {}).n || 0, orders: o.n || 0, revenue: round2(o.v || 0), top_source: s ? s.src : '', top_reel: c ? c.campaign : '', top_product: p ? p.name : '' }; });
  rows.forEach((x, i) => { const prev = rows[i + 1]; x.change = prev ? { visitors: delta(x.visitors, prev.visitors), orders: delta(x.orders, prev.orders), revenue: delta(x.revenue, prev.revenue) } : null; });
  return rows;
}
r.get('/monthly', asyncH((req, res) => res.json({ rows: monthlyRows() })));

/* ---------- CSV downloads ---------- */
r.get('/export/csv', asyncH((req, res) => {
  const w = windowOf(req.query), type = String(req.query.type || 'visits'); let name = type, out = '';
  if (type === 'visits') {
    const rows = db.prepare(`SELECT v.*, c.name cname, c.email cemail FROM visits v LEFT JOIN customers c ON c.id=${custOf} WHERE v.started_at>=? AND v.started_at<? ORDER BY v.id DESC LIMIT 20000`).all(w.from, w.to);
    out = csv(['Visit', 'Time', 'Who', 'Source', 'Reel/Short tag', 'Device', 'First page', 'Pages', 'Seconds', 'Cart', 'Checkout', 'Ordered', 'New visitor'], rows.map(v => [v.id, v.started_at, v.cname ? `${v.cname} <${v.cemail || ''}>` : anon(v.vid), v.src, v.campaign, v.device, v.landing, v.pages, v.dur, v.atc, v.checkout, v.ordered, v.is_new]));
  } else if (type === 'products') {
    const P = db.prepare("SELECT p.id, p.name, (SELECT COUNT(*) FROM product_events e WHERE e.product_id=p.id AND e.type='view' AND e.created_at>=? AND e.created_at<?) views, (SELECT COUNT(*) FROM product_events e WHERE e.product_id=p.id AND e.type='atc' AND e.created_at>=? AND e.created_at<?) atc, (SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.placed_at>=? AND o.placed_at<? AND o.status NOT IN ('cancelled','returned')) sold FROM products p WHERE p.deleted_at IS NULL").all(w.from, w.to, w.from, w.to, w.from, w.to);
    out = csv(['Product', 'Views', 'Added to cart', 'Sold (qty)'], P.map(x => [x.name, x.views, x.atc, x.sold]));
  } else if (type === 'monthly') {
    const rows = monthlyRows();
    out = csv(['Month', 'Visitors', 'Visits', 'Page views', 'Orders', 'Order value', 'Top source', 'Top reel/Short', 'Top product'], rows.map(x => [x.month, x.visitors, x.visits, x.page_views, x.orders, x.revenue, x.top_source, x.top_reel, x.top_product]));
  } else throw bad('Unknown download.');
  res.type('text/csv').set('Content-Disposition', `attachment; filename="surya-${name}.csv"`).send(out);
}));

/* ---------- policy section for visit counting ---------- */
r.get('/policy', (req, res) => res.json(visitPolicy.status()));
r.post('/policy', asyncH((req, res) => res.json({ added: visitPolicy.ensure(true), ...visitPolicy.status() })));

module.exports = r;

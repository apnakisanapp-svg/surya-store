'use strict';
// Anonymous visit tracking for the owner's Insights. No IP and no name is stored.
const db = require('./db');
const { now, int } = require('./util');

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|lighthouse|headless|pingdom|uptime|monitor|curl|wget|python-requests|axios|go-http|java\/|okhttp|scrapy|bingpreview|embedly|vkshare|skypeuri|discord|slack/i;
const isBot = ua => !ua || BOT.test(String(ua));
const deviceOf = (ua, w) => /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|android|iphone/i.test(ua) ? 'mobile' : (w && w < 700 ? 'mobile' : 'desktop');
const clean = (s, n = 40) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, n);
const idOf = s => String(s || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);

const PREFIX = [[/^(ig|insta)/, 'instagram'], [/^(yt|you)/, 'youtube'], [/^(wa|whats)/, 'whatsapp'], [/^(fb|face)/, 'facebook'], [/^(g-|goog)/, 'google']];
const HOSTS = [[/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'], [/(^|\.)(wa\.me|whatsapp\.com)$/, 'whatsapp'], [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'], [/(^|\.)google\.[a-z.]+$/, 'google']];
const PLATFORMS = ['instagram', 'youtube', 'whatsapp', 'facebook', 'google', 'other'];

function hostOf(ref, own) {
  try { const h = new URL(ref).hostname.replace(/^www\./, ''); return h === own ? '' : h; } catch { return ''; }
}
/** Which platform sent this visit? A tagged link (?src=yt-gloves) wins, then the website that linked here. */
function resolveSource(camp, refHost) {
  const code = clean(camp);
  if (code) {
    const c = db.prepare('SELECT platform FROM campaigns WHERE code=?').get(code);
    if (c && c.platform) return { src: c.platform, campaign: code };
    for (const [re, p] of PREFIX) if (re.test(code)) return { src: p, campaign: code };
    return { src: HOSTS.map(([re, p]) => re.test(refHost) ? p : '').find(Boolean) || 'other', campaign: code };
  }
  if (!refHost) return { src: 'direct', campaign: '' };
  for (const [re, p] of HOSTS) if (re.test(refHost)) return { src: p, campaign: '' };
  return { src: 'other', campaign: '' };
}
function kindOf(path) {
  if (path === '/') return 'home';
  if (/^\/p\//.test(path)) return 'product';
  if (/^\/cart/.test(path)) return 'cart';
  if (/^\/checkout/.test(path)) return 'checkout';
  if (/^\/(order|track)/.test(path)) return 'order';
  if (/^\/(shop|c\/|category|search|wishlist)/.test(path)) return 'shop';
  return 'other';
}

function recordPv(req, b) {
  if (isBot(req.headers['user-agent'])) return null;
  const vid = idOf(b.vid), vk = idOf(b.vk), pk = idOf(b.pk);
  if (vid.length < 6 || vk.length < 6 || !pk) return null;
  const path = String(b.path || '/').split(/[?#]/)[0].slice(0, 200) || '/';
  const kind = kindOf(path), ts = now();
  let pid = null;
  if (kind === 'product') { const r = db.prepare('SELECT id FROM products WHERE slug=?').get(decodeURIComponent(path.slice(3)).slice(0, 200)); pid = r ? r.id : null; }
  let v = db.prepare('SELECT * FROM visits WHERE vk=?').get(vk);
  if (!v) {
    const own = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^www\./, '');
    const refHost = hostOf(b.ref, own), s = resolveSource(b.camp, refHost);
    const first = !db.prepare('SELECT 1 FROM visits WHERE vid=? LIMIT 1').get(vid);
    const info = db.prepare('INSERT INTO visits(vk,vid,customer_id,started_at,last_at,src,campaign,landing,device,ref_host,is_new,pages) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)')
      .run(vk, vid, req.customer ? req.customer.id : null, ts, ts, s.src, s.campaign, path, deviceOf(req.headers['user-agent'], int(b.w)), refHost.slice(0, 80), first ? 1 : 0);
    v = { id: info.lastInsertRowid, src: s.src, campaign: s.campaign };
  } else {
    db.prepare('UPDATE visits SET last_at=?, pages=pages+1, customer_id=COALESCE(?,customer_id) WHERE id=?').run(ts, req.customer ? req.customer.id : null, v.id);
  }
  db.prepare('INSERT INTO page_views(visit_id,pk,path,kind,product_id,created_at) VALUES(?,?,?,?,?,?)').run(v.id, pk, path, kind, pid, ts);
  if (Math.random() < 0.004) prune();
  return { src: v.src, campaign: v.campaign };
}
function recordLeave(b) {
  const pk = idOf(b.pk); if (!pk) return;
  const dur = Math.max(0, Math.min(int(b.dur), 30 * 60 * 1000)), scroll = Math.max(0, Math.min(int(b.scroll), 100));
  const pv = db.prepare('SELECT id, visit_id FROM page_views WHERE pk=?').get(pk); if (!pv) return;
  db.prepare('UPDATE page_views SET dur=MAX(dur,?), scroll=MAX(scroll,?) WHERE id=?').run(dur, scroll, pv.id);
  db.prepare('UPDATE visits SET dur=(SELECT COALESCE(SUM(dur),0)/1000 FROM page_views WHERE visit_id=?), last_at=? WHERE id=?').run(pv.visit_id, now(), pv.visit_id);
}
function bump(vk, type, pid) {
  vk = idOf(vk); if (!vk) return;
  const v = db.prepare('SELECT id FROM visits WHERE vk=?').get(vk); if (!v) return;
  const col = type === 'atc' ? 'atc' : type === 'checkout' ? 'checkout' : '';
  if (col) db.prepare(`UPDATE visits SET ${col}=1, last_at=? WHERE id=?`).run(now(), v.id);
  if (['atc', 'checkout', 'wish'].includes(type)) db.prepare('INSERT INTO visit_events(visit_id,type,product_id,created_at) VALUES(?,?,?,?)').run(v.id, type, int(pid) || null, now());
}
/** Link a placed order to the visit it came from (and to the last campaign the person came through in the past 7 days). */
function attachOrder(orderId, vk, attr) {
  vk = idOf(vk); const a = attr && typeof attr === 'object' ? attr : {};
  const v = vk ? db.prepare('SELECT * FROM visits WHERE vk=?').get(vk) : null;
  let src = v && v.src !== 'direct' ? v.src : '', campaign = v && v.campaign ? v.campaign : '';
  if (!src && PLATFORMS.concat(['direct']).includes(String(a.src))) { src = String(a.src); campaign = clean(a.campaign); }
  if (!v && !src) return;
  db.prepare('UPDATE orders SET src=?, campaign=?, vid=? WHERE id=?').run(src || (v ? v.src : 'direct'), campaign || null, v ? v.vid : null, orderId);
  if (v) { db.prepare('UPDATE visits SET ordered=1 WHERE id=?').run(v.id); const o = db.prepare('SELECT number,total FROM orders WHERE id=?').get(orderId); db.prepare('INSERT INTO visit_events(visit_id,type,ref,created_at) VALUES(?,?,?,?)').run(v.id, 'order', o ? `${o.number}|${o.total}` : '', now()); }
}
function prune() {
  db.prepare('DELETE FROM page_views WHERE created_at<?').run(new Date(Date.now() - 180 * 864e5).toISOString());
  db.prepare('DELETE FROM visits WHERE started_at<?').run(new Date(Date.now() - 400 * 864e5).toISOString());
}
module.exports = { recordPv, recordLeave, bump, attachOrder, resolveSource, isBot, prune, PLATFORMS, clean };

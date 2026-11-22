'use strict';
// Short, clean links for messages: https://site/s/k3Xp9q opens the right page (product with the chosen option, or the customer's order).
const crypto = require('crypto');
const db = require('./db');
const cfg = require('./config');
const { now } = require('./util');

const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { let s = ''; for (const x of crypto.randomBytes(7)) s += A[x % A.length]; return s; };

/** target = a path on this site ("/p/slug?v=3", "/order/N?t=...") or a full https link (courier tracking). Returns the short link. */
function make(target) {
  const t = String(target || '');
  const ok = t[0] === '/' && t[1] !== '/' || /^https:\/\//i.test(t);
  if (!ok || t.length > 600) return cfg.SITE_URL + (t[0] === '/' ? t : '');
  let r = db.prepare('SELECT code FROM short_links WHERE target=?').get(t);
  if (!r) {
    for (let i = 0; i < 6 && !r; i++) { const c = newCode(); try { db.prepare('INSERT INTO short_links(code,target,created_at) VALUES(?,?,?)').run(c, t, now()); r = { code: c }; } catch { /* clash, try again */ } }
  }
  return r ? `${cfg.SITE_URL}/s/${r.code}` : cfg.SITE_URL + (t[0] === '/' ? t : '');
}
const resolve = code => { const r = /^[A-Za-z0-9]{4,12}$/.test(String(code)) ? db.prepare('SELECT target FROM short_links WHERE code=?').get(code) : null; return r ? r.target : null; };
module.exports = { make, resolve };

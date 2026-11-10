'use strict';
const crypto = require('crypto');

const now = () => new Date().toISOString();
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const token = (n = 32) => crypto.randomBytes(n).toString('hex');
// order_items.image already holds the stored image URL (/media/...); older rows may hold only a file id
const itemImage = v => !v ? null : (/^(\/|https?:)/.test(v) ? v : `/media/${v}-thumb.webp`);
const jparse = (s, d = null) => { try { return s == null || s === '' ? d : JSON.parse(s); } catch { return d; } };
const jstr = v => JSON.stringify(v == null ? null : v);
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const rupee = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function slugify(s) {
  const out = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return out || 'item-' + crypto.randomBytes(3).toString('hex');
}
function uniqueSlug(db, table, base, selfId) {
  let slug = slugify(base), i = 2;
  const q = db.prepare(`SELECT id FROM ${table} WHERE slug=?`);
  while (true) {
    const r = q.get(slug);
    if (!r || (selfId && r.id === selfId)) return slug;
    slug = slugify(base) + '-' + i++;
  }
}

// order number like SY-241022-7K3Q (no confusing chars)
function orderNumber() {
  const d = new Date();
  const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let r = ''; const b = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) r += A[b[i] % A.length];
  return `SY-${ymd}-${r}`;
}

const isEmail = s => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(s || ''));
const normPhone = s => { const d = String(s || '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };
const isPhone = s => /^[6-9]\d{9}$/.test(normPhone(s));
const isPin = s => /^[1-9]\d{5}$/.test(String(s || ''));
const isUTR = s => /^[A-Za-z0-9]{8,24}$/.test(String(s || '').trim());

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// strip tags from rich text coming from admin editor (admin is trusted but be safe)
function cleanHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function hashIp(ip) { return sha256((ip || '') + '|surya').slice(0, 16); }
function ipOf(req) { return (req.ip || req.socket?.remoteAddress || '').replace('::ffff:', ''); }

function asyncH(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (m, extra) => new HttpError(400, m, extra);
const notFound = (m = 'Not found') => new HttpError(404, m);
const forbid = (m = 'Forbidden') => new HttpError(403, m);

function csvEscape(v) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // CSV injection guard
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rows, cols) {
  const head = cols.map(c => csvEscape(c.label || c.key)).join(',');
  const body = rows.map(r => cols.map(c => csvEscape(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','));
  return '﻿' + [head, ...body].join('\r\n');
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x !== ''));
}

module.exports = { itemImage,
  now, sha256, token, jparse, jstr, clamp, int, num, round2, rupee, slugify, uniqueSlug, orderNumber,
  isEmail, normPhone, isPhone, isPin, isUTR, esc, cleanHtml, hashIp, ipOf, asyncH, HttpError, bad, notFound, forbid,
  csvEscape, toCSV, parseCSV,
};

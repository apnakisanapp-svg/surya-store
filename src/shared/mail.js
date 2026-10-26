'use strict';
const db = require('./db');
const cfg = require('./config');
const settings = require('./settings');
const { now, normPhone, rupee } = require('./util');

let transporter = null;
function getTransport() {
  if (transporter !== null) return transporter || null;
  if (!cfg.SMTP_URL) { transporter = false; return null; }
  try { transporter = require('nodemailer').createTransport(cfg.SMTP_URL); } catch { transporter = false; }
  return transporter || null;
}

function render(tpl, vars) {
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
}

function orderVars(o) {
  const b = settings.get('brand');
  const base = cfg.SITE_URL;
  return {
    name: (o.name || '').split(' ')[0] || 'there', order: o.number, total: rupee(o.total), courier: o.courier || '', tracking: o.tracking_no || '',
    track_url: o.tracking_url || `${base}/track?order=${encodeURIComponent(o.number)}`, days: settings.get('returns').window_days,
    reason: o.cancel_reason || '', review_url: `${base}/order/${o.number}?t=${o.access_token}#review`, brand: b.name, url: base,
  };
}

function waLink(phone, text) {
  const p = normPhone(phone);
  if (p.length !== 10) return null;
  return `https://wa.me/91${p}?text=${encodeURIComponent(text)}`;
}

/** Queue a message about an order. Email is sent if SMTP is configured. WhatsApp is stored as a ready-to-click link for the owner. */
function queueOrderMessage(order, kind) {
  const tpl = settings.get('messages')[kind];
  if (!tpl) return;
  const vars = orderVars(order);
  const subject = render(tpl.subject, vars), body = render(tpl.body, vars);
  const ts = now();
  if (order.email) {
    const info = db.prepare("INSERT INTO outbox(channel,to_addr,subject,body,status,order_id,kind,created_at) VALUES('email',?,?,?,?,?,?,?)")
      .run(order.email, subject, body, getTransport() ? 'queued' : 'manual', order.id, kind, ts);
    if (getTransport()) sendEmail(info.lastInsertRowid).catch(() => {});
  }
  const link = waLink(order.phone, body);
  if (link) db.prepare("INSERT INTO outbox(channel,to_addr,subject,body,link,status,order_id,kind,created_at) VALUES('whatsapp',?,?,?,?,'manual',?,?,?)")
    .run(order.phone, subject, body, link, order.id, kind, ts);
}

function queueEmail(to, subject, body, kind = 'misc') {
  const info = db.prepare("INSERT INTO outbox(channel,to_addr,subject,body,status,kind,created_at) VALUES('email',?,?,?,?,?,?)")
    .run(to, subject, body, getTransport() ? 'queued' : 'manual', kind, now());
  if (getTransport()) sendEmail(info.lastInsertRowid).catch(() => {});
  return info.lastInsertRowid;
}

async function sendEmail(id) {
  const t = getTransport(); if (!t) return;
  const row = db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
  if (!row || row.channel !== 'email') return;
  const brand = settings.get('brand');
  try {
    await t.sendMail({ from: cfg.MAIL_FROM || `${brand.name} <${brand.email || 'no-reply@localhost'}>`, to: row.to_addr, subject: row.subject, text: row.body });
    db.prepare("UPDATE outbox SET status='sent', sent_at=? WHERE id=?").run(now(), id);
  } catch (e) {
    db.prepare("UPDATE outbox SET status='failed', error=? WHERE id=?").run(String(e.message).slice(0, 300), id);
  }
}

module.exports = { render, orderVars, waLink, queueOrderMessage, queueEmail, sendEmail };

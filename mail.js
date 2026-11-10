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


const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff0b8"/><stop offset=".55" stop-color="#f0b43a"/><stop offset="1" stop-color="#c9801a"/></radialGradient></defs><g stroke="#f0b43a" stroke-width="4" stroke-linecap="round"><path d="M32 6v7M32 51v7M6 32h7M51 32h7M13.6 13.6l5 5M45.4 45.4l5 5M13.6 50.4l5-5M45.4 18.6l5-5"/></g><circle cx="32" cy="32" r="13" fill="url(#g)"/></svg>';
let logoPng = null;
async function logoBuf() { if (logoPng) return logoPng; try { logoPng = await require('sharp')(Buffer.from(LOGO_SVG)).resize(96, 96).png().toBuffer(); } catch { logoPng = false; } return logoPng; }

/** Branded HTML e-mail: dark gold header with the sun logo, a white card, and a quiet footer. */
function layout({ brand, preheader, heading, bodyHtml, hasLogo }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3efe6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1a16">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe6"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(60,40,0,.12)">
<tr><td align="center" style="background:#0f0d09;background-image:linear-gradient(135deg,#17120a,#2a1f0a);padding:28px 20px 22px">
${hasLogo ? '<img src="cid:surya-logo" width="52" height="52" alt="" style="display:block;margin:0 auto 10px">' : ''}
<div style="font-size:22px;letter-spacing:.32em;font-weight:700;color:#f3d886;padding-left:.32em">${esc(String(brand).toUpperCase())}</div></td></tr>
<tr><td style="height:3px;background:linear-gradient(90deg,#b98a2e,#f3d886,#b98a2e);font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:30px 28px 8px"><h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#1c1a16">${esc(heading)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:8px 28px 26px"><div style="border-top:1px solid #eee6d4;padding-top:14px;font-size:12px;line-height:1.6;color:#8a8170">Sent by ${esc(brand)}. If this was not you, you can safely ignore this email.</div></td></tr>
</table></td></tr></table></body></html>`;
}

async function sendBranded(to, subject, text, { heading, bodyHtml, preheader }) {
  const t = getTransport(); if (!t) return false;
  const brand = settings.get('brand').name || 'SURYA', bs = settings.get('brand');
  const logo = await logoBuf();
  try {
    await t.sendMail({ from: cfg.MAIL_FROM || `${brand} <${bs.email || 'no-reply@localhost'}>`, to, subject, text,
      html: layout({ brand, preheader, heading, bodyHtml, hasLogo: !!logo }), attachments: logo ? [{ filename: 'logo.png', content: logo, cid: 'surya-logo' }] : [] });
    return true;
  } catch (e) { console.error('Mail failed:', e.message); return false; }
}

/** One-time login code. Sent straight away and NOT saved in the outbox (so admins never see codes).
 *  Returns true if sent. Without SMTP: prints the code in the server window when not in production (for testing). */
async function sendOtp(to, code) {
  const t = getTransport(); const bs = settings.get('brand'), brand = bs.name || 'SURYA';
  if (!t) { if (!cfg.PRODUCTION) { if (process.env.OTP_LOG_FILE) { try { require('fs').appendFileSync(process.env.OTP_LOG_FILE, `${to} ${code}\n`); } catch { /* ignore */ } } console.log(`  [OTP for ${to}] ${code}  (email is not set up, so the code is shown here)`); return true; } return false; }
  const text = `Your ${brand} login code is ${code}\n\nIt works for 10 minutes. Never share it with anyone. If you did not ask for it, ignore this email.`;
  const boxes = String(code).split('').map(d => `<td style="width:42px;height:54px;text-align:center;font-size:28px;font-weight:700;color:#1c1a16;background:#fbf6e8;border:1px solid #ead9a8;border-radius:10px">${esc(d)}</td><td style="width:6px"></td>`).join('');
  const bodyHtml = `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4a4436">Use this code to log in or create your account. It works for <b>10 minutes</b>.</p>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:6px auto 20px"><tr>${boxes}</tr></table>
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#8a8170">Never share this code with anyone. ${esc(brand)} will never ask for it on a call or chat.</p>`;
  return sendBranded(to, `${code} is your ${brand} login code`, text, { heading: 'Your login code', bodyHtml, preheader: `Your code is ${code}. It works for 10 minutes.` });
}

/** "Your password was changed" notice. Never contains the password itself. */
async function sendPasswordChanged(to, name) {
  const brand = settings.get('brand').name || 'SURYA';
  const text = `Hi ${name || 'there'},\n\nYour ${brand} account password was just changed. If this was you, nothing more to do.\nIf it was not you, reset your password right away from the login page and contact us.`;
  const bodyHtml = `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4a4436">Hi ${esc(name || 'there')}, your password was just changed.</p>
<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#4a4436">If this was you, there is nothing more to do. If it was <b>not</b> you, reset your password from the login page now and contact us.</p>`;
  if (!getTransport()) { console.log(`  [Password changed notice for ${to}] (email is not set up)`); return true; }
  return sendBranded(to, `Your ${brand} password was changed`, text, { heading: 'Password changed', bodyHtml, preheader: 'Your password was just changed.' });
}

module.exports = { LOGO_SVG, sendOtp, sendPasswordChanged, render, orderVars, waLink, queueOrderMessage, queueEmail, sendEmail };

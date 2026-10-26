'use strict';
const bcrypt = require('bcryptjs');
const db = require('./db');
const cfg = require('./config');
const totp = require('./totp');
const { now, sha256, token, ipOf, bad, forbid, HttpError } = require('./util');

const ADMIN_COOKIE = 'sy_admin', CUST_COOKIE = 'sy_cust';
const ADMIN_TTL_H = 12, CUST_TTL_D = 30;
const plusHours = h => new Date(Date.now() + h * 3600e3).toISOString();

function cookieOpts(maxAgeMs) {
  return { httpOnly: true, sameSite: 'strict', secure: cfg.SECURE_COOKIES, path: '/', maxAge: maxAgeMs };
}

/* ---------- admin ---------- */
function ipAllowed(req) {
  if (!cfg.ADMIN_IP_ALLOW.length) return true;
  const ip = ipOf(req);
  return cfg.ADMIN_IP_ALLOW.includes(ip) || cfg.ADMIN_IP_ALLOW.includes(ip.replace('::ffff:', ''));
}
function ipGate(req, res, next) { if (!ipAllowed(req)) return res.status(403).send('Not allowed from this network.'); next(); }

function logActivity(adminId, action, entity, entityId, detail, req) {
  db.prepare('INSERT INTO activity_log(admin_id,action,entity,entity_id,detail,ip,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(adminId || null, action, entity || null, entityId == null ? null : String(entityId), typeof detail === 'string' ? detail : JSON.stringify(detail || {}), req ? ipOf(req) : null, now());
}

function adminLogin(req, res, email, password, code) {
  email = String(email || '').toLowerCase().trim();
  const ip = ipOf(req), ua = String(req.headers['user-agent'] || '').slice(0, 200);
  const a = db.prepare('SELECT * FROM admins WHERE email=?').get(email);
  const fail = (msg, status = 401) => {
    db.prepare('INSERT INTO login_history(email,ok,ip,ua,created_at) VALUES(?,0,?,?,?)').run(email, ip, ua, now());
    if (a) {
      const f = (a.failed || 0) + 1;
      db.prepare('UPDATE admins SET failed=?, locked_until=? WHERE id=?').run(f, f >= 5 ? plusHours(0.25) : a.locked_until, a.id);
    }
    throw new HttpError(status, msg);
  };
  if (a && a.locked_until && a.locked_until > now()) throw new HttpError(429, 'Too many wrong attempts. Try again in 15 minutes.');
  if (!a || !bcrypt.compareSync(String(password || ''), a.pass_hash)) return fail('Wrong email or password.');
  if (a.totp_enabled) {
    if (!code) return { need_code: true };
    const c = String(code).replace(/\s/g, '');
    let ok = totp.verify(a.totp_secret, c);
    if (!ok) { // one-time recovery codes
      const rec = JSON.parse(a.recovery || '[]'), h = sha256(c);
      const i = rec.indexOf(h);
      if (i >= 0) { rec.splice(i, 1); db.prepare('UPDATE admins SET recovery=? WHERE id=?').run(JSON.stringify(rec), a.id); ok = true; }
    }
    if (!ok) return fail('Wrong 6-digit code.');
  }
  const t = token();
  db.prepare('INSERT INTO admin_sessions(token_hash,admin_id,created_at,expires_at,last_seen,ip,ua) VALUES(?,?,?,?,?,?,?)').run(sha256(t), a.id, now(), plusHours(ADMIN_TTL_H), now(), ip, ua);
  db.prepare('UPDATE admins SET failed=0, locked_until=NULL, last_login=? WHERE id=?').run(now(), a.id);
  db.prepare('INSERT INTO login_history(email,ok,ip,ua,created_at) VALUES(?,1,?,?,?)').run(email, ip, ua, now());
  res.cookie(ADMIN_COOKIE, t, cookieOpts(ADMIN_TTL_H * 3600e3));
  logActivity(a.id, 'login', 'admin', a.id, '', req);
  return { ok: true, must_change: !!a.must_change };
}

function adminFromReq(req) {
  const t = req.cookies && req.cookies[ADMIN_COOKIE];
  if (!t) return null;
  const s = db.prepare('SELECT s.*, a.email, a.name, a.must_change, a.totp_enabled FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=?').get(sha256(t));
  if (!s || s.expires_at < now()) return null;
  return { id: s.admin_id, email: s.email, name: s.name, must_change: !!s.must_change, totp_enabled: !!s.totp_enabled, session: s.token_hash };
}

/** Requires login + a custom header on writes (CSRF guard on top of SameSite=strict). */
function requireAdmin(req, res, next) {
  const a = adminFromReq(req);
  if (!a) return res.status(401).json({ error: 'Please log in.' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-sy-csrf'] !== '1') return res.status(403).json({ error: 'Blocked (missing security header).' });
  if (a.must_change && !/\/(me|password|logout)$/.test(req.path)) return res.status(403).json({ error: 'Please change your password first.', must_change: true });
  req.admin = a;
  next();
}
function adminLogout(req, res) {
  const t = req.cookies && req.cookies[ADMIN_COOKIE];
  if (t) db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(sha256(t));
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
}
function changePassword(adminId, oldPw, newPw, keepSession) {
  const a = db.prepare('SELECT * FROM admins WHERE id=?').get(adminId);
  if (!bcrypt.compareSync(String(oldPw || ''), a.pass_hash)) throw bad('Current password is wrong.');
  newPw = String(newPw || '');
  if (newPw.length < 10) throw bad('New password must be at least 10 characters.');
  if (!/[a-z]/i.test(newPw) || !/\d/.test(newPw)) throw bad('Use letters and numbers in the password.');
  if (newPw === oldPw) throw bad('Choose a different password.');
  db.prepare('UPDATE admins SET pass_hash=?, must_change=0 WHERE id=?').run(bcrypt.hashSync(newPw, 11), adminId);
  db.prepare('DELETE FROM admin_sessions WHERE admin_id=? AND token_hash<>?').run(adminId, keepSession || '');
}
function setup2fa(adminId, email) {
  const secret = totp.newSecret();
  db.prepare('UPDATE admins SET totp_secret=?, totp_enabled=0 WHERE id=?').run(secret, adminId);
  return { secret, uri: totp.uri(secret, email, 'SURYA Admin') };
}
function enable2fa(adminId, code) {
  const a = db.prepare('SELECT totp_secret FROM admins WHERE id=?').get(adminId);
  if (!a || !a.totp_secret || !totp.verify(a.totp_secret, String(code || '').replace(/\s/g, ''))) throw bad('That code is not right.');
  const codes = Array.from({ length: 8 }, () => token().slice(0, 10));
  db.prepare('UPDATE admins SET totp_enabled=1, recovery=? WHERE id=?').run(JSON.stringify(codes.map(sha256)), adminId);
  return codes;
}
function disable2fa(adminId, password) {
  const a = db.prepare('SELECT pass_hash FROM admins WHERE id=?').get(adminId);
  if (!bcrypt.compareSync(String(password || ''), a.pass_hash)) throw bad('Password is wrong.');
  db.prepare('UPDATE admins SET totp_enabled=0, totp_secret=NULL, recovery=NULL WHERE id=?').run(adminId);
}

/* ---------- customer ---------- */
function startCustomerSession(res, customerId) {
  const t = token();
  db.prepare('INSERT INTO customer_sessions(token_hash,customer_id,expires_at,created_at) VALUES(?,?,?,?)').run(sha256(t), customerId, plusHours(CUST_TTL_D * 24), now());
  res.cookie(CUST_COOKIE, t, cookieOpts(CUST_TTL_D * 86400e3));
}
function customerFromReq(req) {
  const t = req.cookies && req.cookies[CUST_COOKIE];
  if (!t) return null;
  const c = db.prepare('SELECT c.* FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>? AND c.deleted_at IS NULL').get(sha256(t), now());
  return c || null;
}
function optionalCustomer(req, res, next) { req.customer = customerFromReq(req); next(); }
function requireCustomer(req, res, next) {
  req.customer = customerFromReq(req);
  if (!req.customer) return res.status(401).json({ error: 'Please log in.' });
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-sy-csrf'] !== '1') return res.status(403).json({ error: 'Blocked (missing security header).' });
  next();
}
function customerLogout(req, res) {
  const t = req.cookies && req.cookies[CUST_COOKIE];
  if (t) db.prepare('DELETE FROM customer_sessions WHERE token_hash=?').run(sha256(t));
  res.clearCookie(CUST_COOKIE, { path: '/' });
}

function cleanupSessions() {
  db.prepare('DELETE FROM admin_sessions WHERE expires_at<?').run(now());
  db.prepare('DELETE FROM customer_sessions WHERE expires_at<?').run(now());
  db.prepare('DELETE FROM password_resets WHERE expires_at<?').run(now());
}

module.exports = {
  ipGate, ipAllowed, logActivity, adminLogin, adminFromReq, requireAdmin, adminLogout, changePassword, setup2fa, enable2fa, disable2fa,
  startCustomerSession, customerFromReq, optionalCustomer, requireCustomer, customerLogout, cleanupSessions, ADMIN_COOKIE, CUST_COOKIE,
};

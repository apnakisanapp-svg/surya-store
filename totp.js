'use strict';
// Minimal RFC 6238 TOTP (Google Authenticator compatible), implemented with node:crypto.
const crypto = require('crypto');
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function b32encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += A[(val << (5 - bits)) & 31];
  return out;
}
function b32decode(s) {
  let bits = 0, val = 0; const out = [];
  for (const c of String(s).toUpperCase().replace(/=+$/, '')) {
    const i = A.indexOf(c); if (i < 0) continue;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
const newSecret = () => b32encode(crypto.randomBytes(20));
function code(secret, t = Date.now(), step = 30) {
  const counter = Math.floor(t / 1000 / step);
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
function verify(secret, token) {
  const t = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  for (const w of [-1, 0, 1]) if (crypto.timingSafeEqual(Buffer.from(code(secret, Date.now() + w * 30000)), Buffer.from(t))) return true;
  return false;
}
const uri = (secret, email, issuer = 'SURYA Admin') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
module.exports = { newSecret, verify, code, uri };

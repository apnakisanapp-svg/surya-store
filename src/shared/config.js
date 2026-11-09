'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// tiny .env loader (no extra dependency)
(function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const cfg = {
  ROOT,
  DATA,
  UPLOADS: path.join(DATA, 'uploads'),
  PRIVATE: path.join(DATA, 'private'), // payment screenshots, return photos: never public
  BACKUPS: path.join(DATA, 'backups'),
  DB_FILE: path.join(DATA, 'surya.db'),
  WEB: path.join(ROOT, 'web'),
  ADMIN_WEB: path.join(ROOT, 'admin-web'),
  PUBLIC_PORT: Number(process.env.PUBLIC_PORT || process.env.PORT || 3000),
  ADMIN_PORT: Number(process.env.ADMIN_PORT || 4000),
  PUBLIC_HOST: process.env.PUBLIC_HOST || '0.0.0.0',
  ADMIN_HOST: process.env.ADMIN_HOST || '127.0.0.1', // admin listens on localhost by default
  SITE_URL: (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  PRODUCTION: process.env.NODE_ENV === 'production',
  SECURE_COOKIES: process.env.SECURE_COOKIES === undefined ? process.env.NODE_ENV === 'production' : process.env.SECURE_COOKIES === '1',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  SMTP_URL: process.env.SMTP_URL || '', // e.g. smtps://user:pass@smtp.example.com
  MAIL_FROM: process.env.MAIL_FROM || '',
  ADMIN_IP_ALLOW: (process.env.ADMIN_IP_ALLOW || '').split(',').map(s => s.trim()).filter(Boolean),
  SALT: process.env.APP_SECRET || 'change-me-in-.env',
};
for (const d of [cfg.DATA, cfg.UPLOADS, cfg.PRIVATE, cfg.BACKUPS]) fs.mkdirSync(d, { recursive: true });
module.exports = cfg;

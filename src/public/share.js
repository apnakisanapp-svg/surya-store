'use strict';
/* Link-preview cards (WhatsApp, Instagram, Facebook, Telegram...). They need a JPEG/PNG (not webp) at about 1200x630. */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const cfg = require('../shared/config');
const db = require('../shared/db');
const settings = require('../shared/settings');
const catalog = require('../shared/catalog');
const { LOGO_SVG } = require('../shared/mail');

const W = 1200, H = 630;
const cache = new Map();
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wrap = (text, max, lines) => { const out = []; let cur = ''; for (const w of String(text).split(/\s+/)) { if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/.{0,2}$/, '…'); } return out; };
const bg = `<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7e0"/><stop offset="1" stop-color="#f6d98a"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#b)"/><circle cx="1080" cy="80" r="260" fill="#fff" opacity=".35"/>`;
const logo = async size => sharp(require('path').join(__dirname, '..', '..', 'web', 'img', 'logo.png')).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const mediaFile = url => { const m = String(url || '').match(/^\/media\/([\w.-]+)$/); return m ? path.join(cfg.UPLOADS, m[1]) : null; };

async function homeCard() {
  const B = settings.get('brand'), S = settings.get('seo');
  const custom = mediaFile(S.og_image);
  if (custom && fs.existsSync(custom)) return sharp(custom).resize(W, H, { fit: 'cover' }).jpeg({ quality: 86 }).toBuffer();
  const tag = wrap(B.tagline || 'Everyday gadgets for home, kitchen and car', 30, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bg}
  <text x="600" y="395" text-anchor="middle" font-family="DejaVu Sans, Inter, sans-serif" font-weight="700" font-size="104" letter-spacing="14" fill="#1a1405">${esc((B.name || 'SURYA').toUpperCase())}</text>
  ${tag.map((l, i) => `<text x="600" y="${470 + i * 44}" text-anchor="middle" font-family="DejaVu Sans, Inter, sans-serif" font-size="34" fill="#5a4410">${esc(l)}</text>`).join('')}</svg>`;
  return sharp(Buffer.from(svg)).composite([{ input: await logo(210), left: 495, top: 70 }]).jpeg({ quality: 88 }).toBuffer();
}

async function productCard(slug) {
  const B = settings.get('brand'), p = catalog.getBySlug(slug);
  if (!p) return homeCard();
  const f = p.images[0] && mediaFile(p.images[0].gal);
  const name = wrap(p.name, 18, 3), price = '₹' + Number(p.price).toLocaleString('en-IN');
  const mrp = p.mrp && p.mrp > p.price ? '₹' + Number(p.mrp).toLocaleString('en-IN') : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bg}
  <rect x="30" y="30" width="570" height="570" rx="34" fill="#fff"/>
  ${name.map((l, i) => `<text x="650" y="${140 + i * 58}" font-family="DejaVu Sans, Inter, sans-serif" font-weight="700" font-size="44" fill="#1a1405">${esc(l)}</text>`).join('')}
  <text x="650" y="${190 + name.length * 58 + 40}" font-family="DejaVu Sans, Inter, sans-serif" font-weight="700" font-size="84" fill="#9a6b12">${esc(price)}</text>
  ${mrp ? `<text x="650" y="${190 + name.length * 58 + 100}" font-family="DejaVu Sans, Inter, sans-serif" font-size="34" fill="#8a7a55" text-decoration="line-through">${esc(mrp)}</text>` : ''}
  <text x="650" y="580" font-family="DejaVu Sans, Inter, sans-serif" font-weight="700" font-size="34" letter-spacing="6" fill="#1a1405">${esc((B.name || 'SURYA').toUpperCase())}</text></svg>`;
  const layers = [];
  if (f && fs.existsSync(f)) layers.push({ input: await sharp(f).resize(540, 540, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).png().toBuffer(), left: 45, top: 45 });
  layers.push({ input: await logo(70), left: 1090, top: 520 });
  return sharp(Buffer.from(svg)).composite(layers).jpeg({ quality: 86 }).toBuffer();
}

async function serve(res, key, ver, make) {
  let hit = cache.get(key);
  if (!hit || hit.ver !== ver) { try { hit = { ver, buf: await make() }; } catch (e) { console.error('share card:', e.message); return res.status(404).end(); } cache.set(key, hit); if (cache.size > 200) cache.delete(cache.keys().next().value); }
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' }).send(hit.buf);
}

function mount(app) {
  app.get('/share/home.jpg', (req, res) => serve(res, 'home', JSON.stringify([settings.get('brand'), settings.get('seo').og_image]), homeCard));
  app.get('/share/p/:slug.jpg', (req, res) => { const p = catalog.getBySlug(req.params.slug); if (!p) return res.status(404).end(); serve(res, 'p:' + p.slug, JSON.stringify([p.name, p.price, p.mrp, p.images[0] && p.images[0].gal]), () => productCard(p.slug)); });
}
const version = () => 'v' + require('crypto').createHash('md5').update(JSON.stringify([settings.get('brand'), settings.get('seo').og_image])).digest('hex').slice(0, 6);
const pver = p => require('crypto').createHash('md5').update(JSON.stringify([p.name, p.price, p.mrp, p.images[0] && p.images[0].gal])).digest('hex').slice(0, 6);
module.exports = { mount, version, pver };

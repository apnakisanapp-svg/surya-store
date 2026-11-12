'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cfg = require('../shared/config');
const db = require('../shared/db');
const settings = require('../shared/settings');
const catalog = require('../shared/catalog');
const themes = require('../shared/themes');
const images = require('../shared/images');
const { esc, now } = require('../shared/util');
const { notFoundApi, errorHandler } = require('../shared/http');
const { api, bootstrap, fillPolicy } = require('./api');
const auth = require('../shared/auth');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // Optional (free hosting with only one web address): open the admin panel at /<ADMIN_PATH>/ on the same site.
  // It is still protected by the owner login (and 2-step login if you turn it on).
  const ap = process.env.ADMIN_PATH || '';
  if (/^[a-z0-9-]{8,}$/.test(ap)) {
    app.use((req, res, next) => (req.path === '/' + ap && !req.originalUrl.split('?')[0].endsWith('/') ? res.redirect('/' + ap + '/') : next()));
    app.use('/' + ap + '/', require('../admin/server').createApp());
    console.log('  Admin also at /' + ap + '/ (same address as the website)');
  }
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'", (req, res) => (settings.get('seo').ga_id ? 'https://www.googletagmanager.com' : "'self'")],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https://www.google-analytics.com', 'https://*.google-analytics.com'],
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));

  // redirects set by the owner (Admin > SEO > Redirects)
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/media/') || req.path.startsWith('/share/')) return next();
    const r = db.prepare('SELECT to_path, code FROM redirects WHERE from_path=?').get(req.path);
    if (r) return res.redirect(r.code || 301, r.to_path);
    next();
  });

  // maintenance mode
  app.use((req, res, next) => {
    if (!settings.get('store').maintenance) return next();
    if (/^\/(media|css|js|fonts|vendor|img|theme\.css|favicon)/.test(req.path)) return next();
    const b = settings.get('brand'), st = settings.get('store');
    if (req.path.startsWith('/api/')) return res.status(503).json({ error: st.maintenance_message });
    res.status(503).set('Retry-After', '3600').type('html').send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(b.name)}</title><body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px"><div><h1>${esc(b.name)}</h1><p>${esc(st.maintenance_message)}</p></div>`);
  });

  app.get('/theme.css', (req, res) => {
    const body = themes.css();
    res.type('text/css').set('Cache-Control', 'no-cache').send(body);
  });

  require('./share').mount(app);

  // media: only processed webp + model files; never the private folder
  app.use('/media', express.static(cfg.UPLOADS, { maxAge: '365d', immutable: true, index: false, dotfiles: 'deny', fallthrough: false,
    setHeaders: (res, p) => { if (!/\.(webp|glb|jpg|png)$/i.test(p)) res.statusCode = 403; } }));

  app.use('/api', (req, res, next) => { res.set('X-Robots-Tag', 'noindex'); next(); });
  app.use('/api', api, notFoundApi);

  app.get('/robots.txt', (req, res) => {
    const idx = settings.get('seo').robots_index !== false;
    res.type('text/plain').send(idx ? `User-agent: *\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\nDisallow: /orders\nDisallow: /profile\nDisallow: /wishlist\nDisallow: /order/\nSitemap: ${cfg.SITE_URL}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
  });
  app.get('/sitemap.xml', (req, res) => {
    const urls = ['/', '/shop', '/contact', '/faq', '/track'];
    for (const c of db.prepare('SELECT slug FROM categories WHERE active=1 AND deleted_at IS NULL').all()) urls.push('/shop?category=' + c.slug);
    const prods = db.prepare(`SELECT slug, updated_at FROM products p WHERE ${catalog.LIVE_SQL}`).all(...catalog.liveArgs());
    for (const p of db.prepare('SELECT slug FROM policies').all()) urls.push('/policy/' + p.slug);
    const x = u => `<url><loc>${esc(cfg.SITE_URL + u)}</loc></url>`;
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(x).join('')}${prods.map(p => `<url><loc>${esc(cfg.SITE_URL + '/p/' + p.slug)}</loc><lastmod>${esc(String(p.updated_at || '').slice(0, 10))}</lastmod></url>`).join('')}</urlset>`);
  });
  app.get('/manifest.webmanifest', (req, res) => {
    const b = settings.get('brand'), T = settings.get('theme');
    res.type('application/manifest+json').json({ name: b.name, short_name: b.name, start_url: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#ffffff',
      icons: T.favicon_url ? [{ src: T.favicon_url, sizes: '512x512', type: 'image/png' }] : [{ src: '/img/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/img/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] });
  });

  // static front-end
  app.use(express.static(cfg.WEB, { maxAge: cfg.PRODUCTION ? '1h' : 0, index: false, extensions: ['html'] }));

  // single-page app with server-side head tags (title, description, JSON-LD) so search engines and link previews work
  let tpl = null;
  const readTpl = () => { if (!tpl || !cfg.PRODUCTION) tpl = fs.readFileSync(path.join(cfg.WEB, 'index.html'), 'utf8'); return tpl; };
  app.get(/^\/(?!api\/|media\/).*/, (req, res, next) => {
    if (path.extname(req.path)) return next(); // missing asset
    let html;
    try { html = readTpl(); } catch { return res.status(500).send('Storefront files are missing.'); }
    let { head, status } = headFor(req);
    if (status === 200 && !/^\/(shop|p\/[^/]+|cart|checkout|order\/[A-Za-z0-9-]+|orders|track|wishlist|account|login|profile|reset|policy\/[a-z0-9-]+|about|faq|contact|grievance)?$/.test(req.path.replace(/\/+$/, '') || '/')) status = 404; // unknown address: tell Google it is not a page
    try { req.customer = auth.customerFromReq(req); } catch { req.customer = null; } // so a logged-in customer stays logged in after a page load
    const boot = JSON.stringify(bootstrap(req)).replace(/</g, '\\u003c');
    html = html.replace('<!--SEO-->', head).replace('<!--BOOT-->', `<script type="application/json" id="boot">${boot}</script>`);
    res.status(status).set('Cache-Control', 'no-cache').type('html').send(html);
  });

  app.use(errorHandler);
  return app;
}

function headFor(req) {
  const B = settings.get('brand'), S = settings.get('seo');
  const p = req.path.replace(/\/+$/, '') || '/';
  const abs = u => (/^https?:/.test(u) ? u : cfg.SITE_URL + u);
  const full = /\b(store|shop)\b/i.test(B.name) ? B.name : B.name + ' Store'; // "SURYA Store": the name people actually type into Google
  const alt = [...new Set([B.name, full, B.name + ' Shop', B.name + ' Store India'])].filter(x => x !== full);
  const tagLine = 'UPI and cash on delivery, delivery across India, replacement for damaged items.';
  let title = (S.title && S.title.trim().toLowerCase() !== String(B.name).trim().toLowerCase()) ? S.title : (full + ' | Online Gadgets for Home, Kitchen & Car'), desc = S.description || ('Shop useful gadgets for home, kitchen and car at ' + full + '. ' + tagLine), canonical = cfg.SITE_URL + p, img = cfg.SITE_URL + '/share/home.jpg?' + require('./share').version(), type = 'website', ld = [], status = 200, noindex = false;
  let m;
  if ((m = p.match(/^\/p\/([^/]+)$/))) {
    const prod = catalog.getBySlug(decodeURIComponent(m[1]));
    if (prod) {
      title = (prod.seo_title || prod.name) + ' | Buy Online | ' + full;
      desc = prod.seo_desc || String(prod.tagline || prod.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      img = cfg.SITE_URL + '/share/p/' + encodeURIComponent(prod.slug) + '.jpg?v=' + require('./share').pver(prod);
      type = 'product';
      const avail = prod.stock_state === 'out' ? 'OutOfStock' : prod.preorder ? 'PreOrder' : 'InStock';
      ld.push({ '@context': 'https://schema.org', '@type': 'Product', name: prod.name, description: desc, sku: prod.sku || undefined, image: prod.images.map(i => abs(i.gal)), brand: { '@type': 'Brand', name: B.name },
        offers: { '@type': 'Offer', priceCurrency: 'INR', price: prod.price, availability: 'https://schema.org/' + avail, url: canonical, itemCondition: 'https://schema.org/NewCondition' },
        ...(prod.rating.count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: prod.rating.avg, reviewCount: prod.rating.count } } : {}) });
      ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: cfg.SITE_URL + '/' }, { '@type': 'ListItem', position: 2, name: prod.name, item: canonical }] });
    } else { status = 404; title = 'Product not found | ' + B.name; noindex = true; }
  } else if (p === '/') {
    ld.push({ '@context': 'https://schema.org', '@type': 'Organization', name: full, alternateName: alt, legalName: B.legal_name || undefined, url: cfg.SITE_URL, logo: cfg.SITE_URL + '/img/icon-512.png', email: B.email || undefined, telephone: B.phone || undefined });
    ld.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: full, alternateName: alt, url: cfg.SITE_URL, potentialAction: { '@type': 'SearchAction', target: cfg.SITE_URL + '/shop?q={search_term_string}', 'query-input': 'required name=search_term_string' } });
  } else if (p === '/shop') {
    const c = req.query.category ? db.prepare('SELECT name,seo_title,seo_desc FROM categories WHERE slug=?').get(String(req.query.category)) : null;
    title = c ? ((c.seo_title || c.name + ' – Buy Online') + ' | ' + full) : 'Buy Useful Gadgets Online for Home, Kitchen & Car | ' + full;
    desc = c ? (c.seo_desc || 'Buy ' + c.name + ' online at ' + full + '. ' + tagLine) : 'Browse all gadgets for home, kitchen and car at ' + full + '. ' + tagLine;
    if (req.query.q) noindex = true;
    canonical = cfg.SITE_URL + '/shop' + (c ? '?category=' + encodeURIComponent(req.query.category) : '');
  } else if ((m = p.match(/^\/policy\/([^/]+)$/))) {
    const pol = db.prepare('SELECT title,body FROM policies WHERE slug=?').get(m[1]);
    if (pol) { title = pol.title + ' | ' + full; const PD = { returns: 'How returns, replacement and refunds work at ' + full + ': the time limit, what is covered and how to ask.', shipping: 'Delivery time, shipping charges and tracking at ' + full + '. We deliver across India.', privacy: 'How ' + full + ' collects, uses and protects your personal information.', terms: 'Terms of use and sale for ' + full + ': orders, payment, delivery and your rights.', cookies: 'How ' + full + ' uses cookies and similar technology.', warranty: 'Warranty and replacement information for products sold at ' + full + '.', safety: 'Product safety information from ' + full + '.' };
      desc = PD[m[1]] || (pol.title + ' of ' + full + '. Read how ordering, payment, delivery and replacement work.'); } else status = 404;
  } else if (p === '/about') { title = 'About ' + full + ' | Online Gadget Shop in India'; desc = 'Know ' + full + ': a small Indian online shop for useful home, kitchen and car gadgets. ' + tagLine;
  } else if (p === '/contact') { title = 'Contact ' + full + ' | Order, Delivery & Replacement Help'; desc = 'Need help with an order, delivery or replacement? Contact ' + full + ' by WhatsApp, phone or email. We reply as soon as we can.';
  } else if (p === '/faq') { title = 'FAQ | Orders, Payment & Delivery | ' + full; desc = 'Quick answers about orders, UPI and cash on delivery, shipping time and replacement at ' + full + '.';
  } else if (p === '/grievance') { title = 'Grievance Officer | ' + full; desc = 'Contact details of the Grievance Officer of ' + full + ' for complaints about orders, products or privacy.';
  } else if (/^\/(cart|checkout|account|login|order|orders|profile|reset|wishlist|track)/.test(p)) { noindex = true; title = full; }
  const tags = [
    `<title>${esc(title)}</title>`, desc ? `<meta name="description" content="${esc(desc)}">` : '', `<link rel="canonical" href="${esc(canonical)}">`,
    (noindex || S.robots_index === false) ? '<meta name="robots" content="noindex,nofollow">' : '',
    `<meta property="og:site_name" content="${esc(full)}"><meta property="og:title" content="${esc(title)}"><meta property="og:type" content="${type}"><meta property="og:url" content="${esc(canonical)}">`,
    desc ? `<meta property="og:description" content="${esc(desc)}">` : '', img ? `<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">',
    S.verification_google ? `<meta name="google-site-verification" content="${esc(S.verification_google)}">` : '',
    ...ld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
  ].filter(Boolean).join('\n');
  return { head: tags, status };
}

function start(port = cfg.PUBLIC_PORT, host = cfg.PUBLIC_HOST) {
  const app = createApp();
  return new Promise(resolve => { const s = app.listen(port, host, () => { console.log(`  Website  : http://localhost:${port}`); resolve(s); }); });
}

if (require.main === module) { require('../shared/seed').ensureBaseline(); start(); }
module.exports = { createApp, start };

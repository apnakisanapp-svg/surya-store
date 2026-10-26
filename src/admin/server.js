'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cfg = require('../shared/config');
const auth = require('../shared/auth');
const { notFoundApi, errorHandler } = require('../shared/http');
const core = require('./routes-core');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(auth.ipGate);
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], fontSrc: ["'self'", 'data:'], connectSrc: ["'self'"], frameAncestors: ["'none'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"] } },
    crossOriginEmbedderPolicy: false, referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow, noarchive'); res.set('Cache-Control', 'no-store'); next(); });
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  // photos (processed webp only) so the admin can show them; private payment screenshots go through /api/orders/:id/file
  app.use('/media', express.static(cfg.UPLOADS, { maxAge: '1d', index: false, dotfiles: 'deny', fallthrough: false }));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  const api = express.Router();
  api.use(core.pub);
  api.use(auth.requireAdmin);
  api.use(core.priv);
  api.use('/orders', require('./routes-orders'));
  api.use('/products', require('./routes-products'));
  api.use('/finance', require('./routes-finance'));
  api.use('/', require('./routes-store'));
  app.use('/api', api, notFoundApi);

  app.use(express.static(cfg.ADMIN_WEB, { index: false, maxAge: 0 }));
  app.get(/^\/(?!api\/|media\/).*/, (req, res, next) => {
    if (path.extname(req.path)) return next();
    const f = path.join(cfg.ADMIN_WEB, 'index.html');
    if (!fs.existsSync(f)) return res.status(500).send('Admin files are missing.');
    res.sendFile(f);
  });
  app.use(errorHandler);
  return app;
}

function start(port = cfg.ADMIN_PORT, host = cfg.ADMIN_HOST) {
  const app = createApp();
  return new Promise(resolve => { const s = app.listen(port, host, () => { console.log(`  Admin    : http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`); resolve(s); }); });
}

if (require.main === module) { require('../shared/seed').ensureBaseline(); start(); }
module.exports = { createApp, start };

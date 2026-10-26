'use strict';
const { HttpError } = require('./util');

function notFoundApi(req, res) { res.status(404).json({ error: 'Not found' }); }

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);
  let status = err.status || 500, message = err.message;
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') { status = 413; message = 'That file or request is too large.'; }
  else if (err.type === 'entity.parse.failed') { status = 400; message = 'Bad request.'; }
  else if (err.code && String(err.code).startsWith('LIMIT_')) { status = 400; message = 'Upload problem: ' + err.message; }
  else if (!(err instanceof HttpError) && status === 500) { console.error('[error]', req.method, req.originalUrl, err); message = 'Something went wrong on our side. Please try again.'; }
  if (req.originalUrl.startsWith('/api/')) return res.status(status).json({ error: message, ...(err.extra || {}) });
  res.status(status).type('html').send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${status}</title><body style="font-family:system-ui;padding:40px;text-align:center"><h1>${status}</h1><p>${String(message).replace(/[<>&]/g, '')}</p><p><a href="/">Back to home</a></p>`);
}

module.exports = { notFoundApi, errorHandler };

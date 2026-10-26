'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const cfg = require('./config');
const { token, bad } = require('./util');

sharp.cache(false);
const OK_FMT = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff', 'heif']);

/**
 * Takes any uploaded image and produces fixed-size variants so layouts never break:
 *   thumb 160x160 (square), card 720x720 (square, focus-point crop), gal up to 1600 (original ratio), orig 2400 (for re-cropping)
 */
async function processProductImage(buffer, { focusX = 0.5, focusY = 0.5 } = {}) {
  let meta;
  try { meta = await sharp(buffer, { limitInputPixels: 60e6 }).metadata(); } catch { throw bad('This file is not a valid image.'); }
  if (!OK_FMT.has(meta.format)) throw bad('Please upload a JPG, PNG, WebP or AVIF image.');
  const id = token(8);
  const base = path.join(cfg.UPLOADS, id);
  const src = sharp(buffer, { limitInputPixels: 60e6 }).rotate();
  const orig = await src.clone().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
  fs.writeFileSync(base + '-orig.webp', orig.data);
  const w = orig.info.width, h = orig.info.height;
  await src.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(base + '-gal.webp');
  await cropSquare(orig.data, w, h, focusX, focusY, 720, base + '-card.webp', 80);
  await cropSquare(orig.data, w, h, focusX, focusY, 160, base + '-thumb.webp', 74);
  return { file: id, w, h };
}

async function cropSquare(buf, w, h, fx, fy, size, out, quality) {
  const side = Math.min(w, h);
  const left = Math.round(Math.min(Math.max(fx * w - side / 2, 0), w - side));
  const top = Math.round(Math.min(Math.max(fy * h - side / 2, 0), h - side));
  await sharp(buf).extract({ left, top, width: side, height: side }).resize(size, size).webp({ quality }).toFile(out);
}

async function recrop(file, focusX, focusY) {
  const base = path.join(cfg.UPLOADS, file);
  const orig = fs.readFileSync(base + '-orig.webp');
  const m = await sharp(orig).metadata();
  await cropSquare(orig, m.width, m.height, focusX, focusY, 720, base + '-card.webp', 80);
  await cropSquare(orig, m.width, m.height, focusX, focusY, 160, base + '-thumb.webp', 74);
}

// generic single image (banners, logos, category images): keeps ratio, max width
async function processGeneric(buffer, { maxW = 2000, maxH = 2000, keepAlpha = true } = {}) {
  let meta;
  try { meta = await sharp(buffer, { limitInputPixels: 60e6 }).metadata(); } catch { throw bad('This file is not a valid image.'); }
  if (!OK_FMT.has(meta.format)) {
    if (meta.format === 'svg') throw bad('SVG upload is not allowed. Use PNG, JPG or WebP.');
    throw bad('Please upload a JPG, PNG, WebP or AVIF image.');
  }
  const id = token(8);
  const out = path.join(cfg.UPLOADS, id + '-img.webp');
  await sharp(buffer, { limitInputPixels: 60e6 }).rotate().resize({ width: maxW, height: maxH, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86, alphaQuality: keepAlpha ? 90 : 0 }).toFile(out);
  const m = await sharp(out).metadata();
  return { file: id, w: m.width, h: m.height };
}

// private images (payment screenshot, return photos): resized, never publicly served
async function processPrivate(buffer) {
  let meta;
  try { meta = await sharp(buffer, { limitInputPixels: 40e6 }).metadata(); } catch { throw bad('This file is not a valid image.'); }
  if (!OK_FMT.has(meta.format)) throw bad('Please upload a JPG or PNG image.');
  const id = token(10) + '.webp';
  await sharp(buffer, { limitInputPixels: 40e6 }).rotate().resize({ width: 1400, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(cfg.PRIVATE, id));
  return id;
}

function removeFiles(file) {
  if (!file || /[^a-z0-9]/i.test(file)) return;
  for (const suf of ['-orig.webp', '-gal.webp', '-card.webp', '-thumb.webp', '-img.webp']) {
    try { fs.unlinkSync(path.join(cfg.UPLOADS, file + suf)); } catch { /* ignore */ }
  }
}
const url = (file, kind = 'card') => file ? `/media/${file}-${kind}.webp` : null;

module.exports = { processProductImage, processGeneric, processPrivate, recrop, removeFiles, url };

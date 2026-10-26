'use strict';
const settings = require('./settings');

// Colour/shape tokens. The owner can switch presets or override single tokens from Admin > Settings > Look.
const BASE = {
  '--ok': '#1f8a4c', '--warn': '#b7791f', '--err': '#c0392b', '--info': '#3b5bdb',
  '--shadow': '0 10px 30px rgba(0,0,0,.08)', '--glass': 'rgba(255,255,255,.72)', '--glass-line': 'rgba(0,0,0,.08)',
};
const PRESETS = {
  safed: {
    label: 'Safed (clean, Apple-like)',
    tokens: { '--bg': '#ffffff', '--bg2': '#f5f5f7', '--surface': '#ffffff', '--ink': '#1d1d1f', '--mute': '#6e6e73', '--line': '#d9d9de', '--accent': '#b97800',
      '--btn-bg': '#1d1d1f', '--btn-ink': '#ffffff', '--btn2-bg': '#e8a92b', '--btn2-ink': '#201503', '--hero-bg': '#f5f5f7', '--hero-ink': '#1d1d1f', '--dark-bg': '#111214', '--dark-ink': '#f5f5f7', '--tile-bg': '#f5f5f7', '--logo': '#1d1d1f' },
  },
  raat: {
    label: 'Raat (dark, glass)',
    tokens: { '--bg': '#07090c', '--bg2': '#0d1116', '--surface': '#121820', '--ink': '#edeff3', '--mute': '#9aa3b2', '--line': 'rgba(255,255,255,.13)', '--accent': '#e8a92b',
      '--btn-bg': '#e8a92b', '--btn-ink': '#1b1203', '--btn2-bg': 'transparent', '--btn2-ink': '#edeff3', '--hero-bg': '#0d1116', '--hero-ink': '#edeff3', '--dark-bg': '#05070a', '--dark-ink': '#edeff3', '--tile-bg': '#121820', '--logo': '#edeff3',
      '--glass': 'rgba(18,24,32,.72)', '--glass-line': 'rgba(255,255,255,.12)', '--shadow': '0 18px 50px rgba(0,0,0,.5)' },
  },
  mitti: {
    label: 'Mitti (green, eco)',
    tokens: { '--bg': '#eef1e6', '--bg2': '#e2e9d3', '--surface': '#ffffff', '--ink': '#26331c', '--mute': '#55674a', '--line': '#c4cfb0', '--accent': '#5e8c3a',
      '--btn-bg': '#26331c', '--btn-ink': '#f4f6ec', '--btn2-bg': '#f2a71b', '--btn2-ink': '#26331c', '--hero-bg': '#e2e9d3', '--hero-ink': '#26331c', '--dark-bg': '#26331c', '--dark-ink': '#f4f6ec', '--tile-bg': '#e2e9d3', '--logo': '#26331c',
      '--glass': 'rgba(238,241,230,.78)', '--glass-line': 'rgba(38,51,28,.14)' },
    radius: 14,
  },
  sunehri: {
    label: 'Sunehri (warm)',
    tokens: { '--bg': '#fff9ee', '--bg2': '#f6ecd6', '--surface': '#ffffff', '--ink': '#2a2013', '--mute': '#7a6a4f', '--line': '#e8dcc0', '--accent': '#c77d00',
      '--btn-bg': '#2a2013', '--btn-ink': '#fff9ee', '--btn2-bg': '#e8a92b', '--btn2-ink': '#2a1b00', '--hero-bg': '#f6ecd6', '--hero-ink': '#2a2013', '--dark-bg': '#2a2013', '--dark-ink': '#fff9ee', '--tile-bg': '#f6ecd6', '--logo': '#2a2013',
      '--glass': 'rgba(255,249,238,.78)' },
  },
};
const DARK_OVERRIDE = PRESETS.raat.tokens;

const FONTS = {
  'inter-tight': { label: 'Inter Tight (modern)', stack: "'Inter Tight', 'Hind', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  hind: { label: 'Hind (friendly, Hindi-ready)', stack: "'Hind', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  serif: { label: 'Serif (classic)', stack: "Georgia, 'Times New Roman', 'Hind', serif" },
  system: { label: 'System default (fastest)', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Hind', sans-serif" },
};

function css() {
  const T = settings.get('theme');
  const preset = PRESETS[T.preset] || PRESETS.safed;
  const tokens = { ...BASE, ...preset.tokens, ...(T.tokens || {}) };
  const radius = Number(T.radius) || preset.radius || 24;
  const fh = (FONTS[T.font_head] || FONTS['inter-tight']).stack, fb = (FONTS[T.font_body] || FONTS.hind).stack;
  const vars = o => Object.entries(o).filter(([k, v]) => /^--[a-z0-9-]+$/.test(k) && /^[#a-z0-9(),.%\s\-/'"]+$/i.test(String(v))).map(([k, v]) => `${k}:${v}`).join(';');
  return `:root{${vars(tokens)};--radius:${radius}px;--radius-sm:${Math.max(8, Math.round(radius / 2.2))}px;--font-head:${fh};--font-body:${fb}}\n` +
    `html.dark{${vars({ ...BASE, ...DARK_OVERRIDE })}}\n`;
}

module.exports = { PRESETS, FONTS, css };

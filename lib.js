// Admin helpers: DOM, API, forms, modal, toast, formatters
import { mdToHtml, htmlToMd, isSimple, previewHtml } from './rich.js';
// make append() ignore null/false so conditional children never print "null"
{ const _a = Element.prototype.append; Element.prototype.append = function (...k) { return _a.apply(this, k.flat(Infinity).filter(x => x != null && x !== false)); }; }
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, ''); else el.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const dt = s => s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
export const d0 = s => s ? new Date(s).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '';
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const ago = s => { const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; if (m < 1440) return Math.floor(m / 60) + ' h ago'; return Math.floor(m / 1440) + ' d ago'; };
export const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
export const setp = (o, path, v) => { const ks = path.split('.'); let c = o; ks.slice(0, -1).forEach(k => { c = c[k] ||= {}; }); c[ks.at(-1)] = v; };

/* ---- loading feedback (same gold + glass look as the shop) ---- */
let ldN = 0, ldLine, ldSince = 0;
export function ldSet(on) {
  ldLine ||= document.body.appendChild(h('div', { class: 'ldline', 'aria-hidden': 'true' }));
  if (on) { if (!ldLine.classList.contains('on')) { ldLine.classList.remove('fin'); ldLine.classList.add('on'); ldSince = Date.now(); } }
  else if (ldLine.classList.contains('on')) { const long = Date.now() - ldSince > 160; ldLine.classList.remove('on'); if (long) { ldLine.classList.add('fin'); setTimeout(() => ldLine.classList.remove('fin'), 600); } }
}
const mbs = n => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';
let upTray;
/* One card per upload: ring + percent, MB sent, Cancel. Every api() call with a form uses this, so every upload in the admin shows progress. */
export function uploadCard(form) {
  upTray ||= document.body.appendChild(h('div', { class: 'uptray' }));
  let names = [], total = 0; try { for (const [, v] of form.entries()) if (v && v.name !== undefined) { names.push(v.name); total += v.size || 0; } } catch { /* */ }
  const pct = h('b', null, '0%'), sz = h('span', { class: 'upsz' }, mbs(0) + ' / ' + mbs(total)), bar = h('i'), ring = h('div', { class: 'upring', style: { '--p': 0 } }, pct);
  const title = h('b', { class: 'upt' }, names.length > 1 ? `Uploading ${names.length} files…` : `Uploading ${names[0] || 'file'}…`);
  const cancel = h('button', { class: 'btn sm', type: 'button', onclick: () => c.abort && c.abort() }, 'Cancel');
  const el = h('div', { class: 'upcard', role: 'status' }, ring, h('div', { class: 'upi' }, title, h('div', { class: 'upbar' }, bar), sz), cancel);
  upTray.append(el); requestAnimationFrame(() => el.classList.add('on'));
  const gone = ms => setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); }, ms);
  const c = {
    abort: null,
    set(l, t) { const p = Math.min(100, Math.round(l / (t || 1) * 100)); pct.textContent = p + '%'; ring.style.setProperty('--p', p); bar.style.width = p + '%'; sz.textContent = mbs(l) + ' / ' + mbs(t); },
    done() { pct.textContent = '✓'; ring.style.setProperty('--p', 100); bar.style.width = '100%'; title.textContent = 'Uploaded ✓'; cancel.remove(); gone(1200); },
    fail(msg) { el.classList.add('bad'); title.textContent = msg || 'Upload failed. Check your connection and try again.'; cancel.remove(); gone(5000); },
  };
  return c;
}
function xhrSend(method, url, form) {
  const up = uploadCard(form);
  return new Promise(ok => {
    const x = new XMLHttpRequest(); up.abort = () => x.abort();
    x.open(method, url); x.withCredentials = true; x.setRequestHeader('x-sy-csrf', '1');
    x.upload.onprogress = e => e.lengthComputable && up.set(e.loaded, e.total);
    x.onload = () => { x.status >= 200 && x.status < 300 ? up.done() : up.fail('Upload failed. ' + ((() => { try { return JSON.parse(x.responseText).error; } catch { return ''; } })() || 'Please try again.')); ok({ ok: x.status >= 200 && x.status < 300, status: x.status, json: async () => JSON.parse(x.responseText) }); };
    x.onerror = () => { up.fail(); ok(null); };
    x.onabort = () => { up.fail('Upload cancelled.'); ok(null); };
    x.send(form);
  });
}
export async function api(path, { method = 'GET', body, form } = {}) {
  const opt = { method, headers: { 'x-sy-csrf': '1' }, credentials: 'same-origin' };
  if (form) opt.body = form; else if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  ldN++; ldSet(true);
  let res;
  try { res = form ? await xhrSend(method, 'api' + path, form) : await fetch('api' + path, opt); if (!res) throw new Error('x'); } catch { throw Object.assign(new Error(form ? 'Upload failed. Check your connection and try again.' : 'Cannot reach the server. Is it running?'), { offline: true }); }
  finally { ldN = Math.max(0, ldN - 1); if (!ldN) ldSet(false); }
  let data = null; try { data = await res.json(); } catch { /* */ }
  if (res.status === 401 && !path.startsWith('/login') && path !== '/me') { location.hash = '#/login'; location.reload(); }
  if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Something went wrong.'), { status: res.status, data });
  return data;
}

let tbox;
export function toast(msg, err) {
  tbox ||= document.body.appendChild(h('div', { class: 'toasts', role: 'status' }));
  const el = h('div', { class: 'toast' + (err ? ' err' : '') }, msg); tbox.append(el); setTimeout(() => el.remove(), err ? 6000 : 3000);
}
export function modal(title, content, { wide, onClose } = {}) {
  const wrap = h('div', { class: 'mwrap' }), box = h('div', { class: 'mbox' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'mhead' }, h('b', null, title), h('button', { class: 'x', 'aria-label': 'Close', onclick: () => api_.close() }, '×')), h('div', { class: 'mbody' }, content));
  wrap.append(box); const esc = e => { if (e.key === 'Escape') api_.close(); };
  const api_ = { box, close() { wrap.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); } };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) api_.close(); }); document.addEventListener('keydown', esc); document.body.append(wrap);
  return api_;
}
export const confirmBox = (msg, okText = 'Yes, do it') => new Promise(res => { const m = modal('Please confirm', h('div', { class: 'stack' }, h('p', null, msg), h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => { res(false); m.close(); } }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { res(true); m.close(); } }, okText))), { onClose: () => res(false) }); });
export const promptBox = (title, label, { multiline, ok = 'Save', value = '' } = {}) => new Promise(res => { const inp = multiline ? h('textarea', { class: 'inp', rows: 3 }) : h('input', { class: 'inp' }); inp.value = value; const m = modal(title, h('div', { class: 'stack' }, h('label', { class: 'fld' }, h('span', null, label), inp), h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => { res(null); m.close(); } }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { res(inp.value); m.close(); } }, ok))), { onClose: () => res(null) }); setTimeout(() => inp.focus(), 50); });
export async function busy(btn, fn) { btn.disabled = true; btn.classList.add('busy'); let ok = false; try { const r = await fn(); ok = true; return r; } finally { btn.disabled = false; btn.classList.remove('busy'); if (ok && btn.isConnected) { btn.classList.add('okflash'); setTimeout(() => btn.classList.remove('okflash'), 1100); } } }
export const badge = (text, kind = '') => h('span', { class: 'badge ' + kind }, text);
export const STATUS_KIND = { placed: 'info', payment_pending: 'warn', cod_confirm: 'warn', confirmed: 'info', packed: 'info', shipped: 'info', delivered: 'ok', cancelled: 'bad', returned: 'bad', published: 'ok', draft: '', scheduled: 'info', green: 'ok', yellow: 'warn', red: 'bad', amber: 'warn' };
export const statusBadge = s => badge(String(s || '').replace('_', ' '), STATUS_KIND[s] || '');

/* ---------- schema-driven form ---------- */
/** spec: [{k:'a.b', l:'Label', t:'text|textarea|number|select|check|color|date|image|tags|list|html', h:'help', opts:[[v,label]], sub:[specs], ph:'placeholder', w:'half'}] */
export function buildForm(spec, values, { onChange } = {}) {
  const data = JSON.parse(JSON.stringify(values || {})), root = h('div', { class: 'form' }), getters = [];
  const ch = () => onChange && onChange(data);
  for (const f of spec) {
    if (f.t === 'heading') { root.append(h('h3', { class: 'fh' }, f.l), f.h ? h('p', { class: 'muted small fhelp' }, f.h) : null); continue; }
    if (f.t === 'services') { let ready = false; const sp = servicesPanel('product', data, o => { if (ready) { Object.assign(data, o); ch(); } }); Object.assign(data, sp.get()); ready = true; root.append(h('div', { class: 'fld' }, sp.el)); continue; }
    const cur = get(data, f.k);
    let input, wrapper;
    const set = v => { setp(data, f.k, v); ch(); };
    if (f.t === 'rich') { input = richField(f, cur, set); }
    else if (f.t === 'textarea' || f.t === 'html') { input = h('textarea', { class: 'inp', rows: f.rows || (f.t === 'html' ? 10 : 3), placeholder: f.ph || '', oninput: e => set(e.target.value) }); input.value = cur == null ? '' : cur; }
    else if (f.t === 'select') { input = h('select', { class: 'inp', onchange: e => set(f.num ? Number(e.target.value) : e.target.value) }, (f.opts || []).map(([v, l]) => h('option', { value: v, selected: String(v) === String(cur ?? '') }, l))); }
    else if (f.t === 'check') { input = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!cur, onchange: e => set(e.target.checked) }), h('span', null, f.l)); wrapper = h('div', { class: 'fld' + (f.w === 'half' ? ' half' : '') }, input, f.h ? h('small', { class: 'muted' }, f.h) : null); root.append(wrapper); continue; }
    else if (f.t === 'number') { input = h('input', { class: 'inp', type: 'number', step: f.step || 'any', min: f.min, max: f.max, placeholder: f.ph || '', oninput: e => set(e.target.value === '' ? '' : Number(e.target.value)) }); input.value = cur == null ? '' : cur; }
    else if (f.t === 'color') { input = h('div', { class: 'row' }, h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#000000', oninput: e => { set(e.target.value); txt.value = e.target.value; } }), (() => { const txt = h('input', { class: 'inp', value: cur || '', placeholder: 'Leave empty for default', oninput: e => set(e.target.value) }); return txt; })()); const txt = input.querySelector('.inp'); }
    else if (f.t === 'date') { input = h('input', { class: 'inp', type: f.time ? 'datetime-local' : 'date', onchange: e => set(e.target.value) }); input.value = cur ? new Date(cur).toISOString().slice(0, f.time ? 16 : 10) : ''; }
    else if (f.t === 'tags') {
      const inp = h('input', { class: 'inp', placeholder: f.ph || 'Separate with commas', oninput: e => set(e.target.value.split(',').map(s => s.trim()).filter(Boolean)) }); inp.value = Array.isArray(cur) ? cur.join(', ') : '';
      if (f.prompt) {
        const note = h('small', { class: 'muted' }, '');
        const copy = async () => {
          const text = f.prompt(data); let ok = false;
          try { await navigator.clipboard.writeText(text); ok = true; } catch { const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = text; document.body.append(ta); ta.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove(); }
          note.textContent = ok ? 'Copied. Paste it in any AI (ChatGPT, Gemini…), then paste the AI\'s answer in the box above.' : 'Could not copy. Select the text in the box that opened and copy it yourself.';
          if (!ok) window.prompt('Copy this prompt:', text);
        };
        input = h('div', { class: 'stack', style: { gap: '6px' } }, inp, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm', onclick: copy }, 'Copy prompt for AI'), h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { inp.value = ''; set([]); } }, 'Clear')), note);
      } else input = inp;
    }
    else if (f.t === 'image') { input = imageField(cur, v => set(v), f); }
    else if (f.t === 'list') { input = listField(f, Array.isArray(cur) ? cur : [], v => set(v)); }
    else { input = h('input', { class: 'inp', type: f.t === 'password' ? 'password' : f.t === 'email' ? 'email' : 'text', placeholder: f.ph || '', maxlength: f.max, autocomplete: 'off', oninput: e => set(e.target.value) }); input.value = cur == null ? '' : cur; }
    wrapper = h('label', { class: 'fld' + (f.w === 'half' ? ' half' : '') }, h('span', null, f.l), input, f.h ? h('small', { class: 'muted' }, f.h) : null);
    if (f.t === 'list' || f.t === 'image') wrapper = h('div', { class: 'fld' }, h('span', { class: 'lbl' }, f.l), input, f.h ? h('small', { class: 'muted' }, f.h) : null);
    root.append(wrapper);
  }
  return { el: root, data, get: () => data };
}
function imageField(cur, set, f) {
  const prev = h('img', { class: 'imgprev', alt: '' }), box = h('div', { class: 'row' });
  const show = v => { prev.src = v ? (/^(\/|https?:)/.test(v) ? v : `/media/${v}-img.webp`) : ''; prev.style.display = v ? '' : 'none'; };
  show(cur);
  const file = h('input', { type: 'file', accept: 'image/*', class: 'hide', onchange: async e => { const fl = e.target.files[0]; if (!fl) return; const fd = new FormData(); fd.append('image', fl); if (f.maxw) fd.append('max_w', f.maxw); try { const r = await api('/upload', { method: 'POST', form: fd }); const v = f.url ? r.url : r.file; set(v); show(r.url); toast('Uploaded'); } catch (x) { toast(x.message, true); } } });
  box.append(prev, h('button', { type: 'button', class: 'btn sm', onclick: () => file.click() }, 'Choose image'), h('button', { type: 'button', class: 'btn sm', onclick: () => { set(''); show(''); } }, 'Remove'), file);
  return box;
}
/* Plain-text editor with a live preview. Stores HTML (so the website does not change). "Advanced" shows raw HTML. */
function richField(f, cur, set) {
  const keys = f.keys || ['brand', 'email', 'phone', 'address', 'return_days'];
  let html = cur == null ? '' : String(cur), advanced = !isSimple(html);
  const ta = h('textarea', { class: 'inp rich-ta', rows: f.rows || 12, spellcheck: 'true' });
  const prev = h('div', { class: 'rte rich-prev' }), note = h('small', { class: 'muted' });
  const adv = h('input', { type: 'checkbox', checked: advanced });
  const refresh = () => { prev.innerHTML = previewHtml(html) || ''; if (!html) prev.append(h('span', { class: 'muted' }, 'Preview appears here as you type.')); };
  const load = () => { ta.value = advanced ? html : htmlToMd(html); ta.placeholder = advanced ? '<p>HTML here</p>' : 'Write normally. Leave a blank line between paragraphs.'; adv.checked = advanced; note.textContent = advanced ? (isSimple(html) ? 'HTML mode. Untick "Advanced" to write in plain text.' : 'This page uses special formatting, so it opens in HTML mode to keep it safe.') : 'Tips: "# Heading", "- list item", "1. numbered", "**bold**", "[text](https://link)".'; };
  const changed = () => { html = advanced ? ta.value : mdToHtml(ta.value); set(html); refresh(); };
  ta.addEventListener('input', changed);
  adv.addEventListener('change', () => {
    if (adv.checked) { advanced = true; }
    else if (isSimple(html)) { advanced = false; }
    else { adv.checked = true; toast('This page has formatting plain text cannot keep, so it stays in HTML mode.', true); return; }
    load();
  });
  const put = (before, after = '') => { const a = ta.selectionStart, b = ta.selectionEnd, sel = ta.value.slice(a, b); ta.setRangeText(before + sel + after, a, b, 'end'); ta.focus(); changed(); };
  const linePrefix = pre => { const a = ta.selectionStart, st = ta.value.lastIndexOf('\n', a - 1) + 1; ta.setRangeText(pre, st, st, 'end'); ta.focus(); changed(); };
  const btn = (label, title, fn) => h('button', { type: 'button', class: 'btn sm', title, onclick: () => { if (advanced) { toast('Untick "Advanced" to use these buttons.', true); return; } fn(); } }, label);
  const ins = h('select', { class: 'inp rich-ins', onchange: e => { const k = e.target.value; e.target.value = ''; if (k) put('{{' + k + '}}'); } }, h('option', { value: '' }, 'Insert…'), keys.map(k => h('option', { value: k }, { brand: 'Brand name', email: 'Email', phone: 'Phone', address: 'Address', return_days: 'Return days' }[k] || k)));
  const bar = h('div', { class: 'row rich-bar' }, btn('Heading', 'Big heading', () => linePrefix('# ')), btn('Bold', 'Bold', () => put('**', '**')), btn('• List', 'Bullet list', () => linePrefix('- ')), btn('Link', 'Link', () => put('[', '](https://)')), ins, h('label', { class: 'chk', style: { marginLeft: 'auto' } }, adv, h('span', null, 'Advanced (HTML)')));
  load(); refresh();
  return h('div', { class: 'rich stack', style: { gap: '8px' } }, bar, ta, note, h('div', { class: 'small muted' }, 'How it will look:'), prev);
}
function listField(f, items, set) {
  const box = h('div', { class: 'listf' });
  const paint = () => {
    clear(box);
    items.forEach((it, i) => {
      const sub = buildForm(f.sub, it, { onChange: d => { items[i] = d; set(items); } });
      box.append(h('div', { class: 'listrow' }, h('div', { class: 'grow' }, sub.el), h('div', { class: 'col' }, h('button', { type: 'button', class: 'btn sm', title: 'Move up', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; set(items); paint(); } }, '↑'), h('button', { type: 'button', class: 'btn sm', title: 'Move down', disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; set(items); paint(); } }, '↓'), h('button', { type: 'button', class: 'btn sm bad', title: 'Remove', onclick: () => { items.splice(i, 1); set(items); paint(); } }, '×'))));
    });
    if (!f.fixed) box.append(h('button', { type: 'button', class: 'btn sm', onclick: () => { items.push(JSON.parse(JSON.stringify(f.blank || {}))); set(items); paint(); } }, '+ ' + (f.add || 'Add')));
  };
  paint(); return box;
}

/* ---------- table helper ---------- */
export function table(cols, rows, { onRow, empty = 'Nothing here yet.' } = {}) {
  if (!rows.length) return h('div', { class: 'empty' }, empty);
  return h('div', { class: 'tw' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, cols.map(c => h('th', { class: c.r ? 'r' : '' }, c.l)))),
    h('tbody', null, rows.map(r => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? e => { if (!e.target.closest('a,button,input,select,label')) onRow(r); } : null }, cols.map(c => h('td', { class: (c.r ? 'r ' : '') + (c.cls || ''), 'data-l': c.l }, c.f ? c.f(r) : r[c.k])))))));
}
export const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'muted' }, k), h('b', null, v));
export const card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h3', null, title) : null, ...kids);
export const pageHead = (title, ...actions) => h('div', { class: 'ph' }, h('h1', null, title), h('div', { class: 'row' }, ...actions));
export function tabs(items, active, onPick) { const bar = h('div', { class: 'tabs', role: 'tablist' }, items.map(([k, l, n]) => h('button', { class: k === active ? 'on' : '', onclick: () => onPick(k) }, l, n != null && n !== '' ? h('span', { class: 'cnt' }, n) : null))); return bar; }

/* ===== Services panel: the same 6 questions for a product and for the store default (Settings > Payments) ===== */
const SVC_RET = [['replacement', 'Replacement only'], ['refund', 'Refund only'], ['either', 'Replacement or refund'], ['exchange', 'Exchange only'], ['none', 'No return']];
const SVC_RET_LABEL = Object.fromEntries(SVC_RET);
const numOr = (v, d = '') => (v === '' || v == null || Number.isNaN(Number(v)) ? d : Number(v));
export function servicesPanel(mode, init, onChange) {
  const isP = mode === 'product', root = h('div', { class: 'svc' });
  let st = {}, store = null;
  if (isP) {
    const d = init || {};
    st.cod = d.pay_rule === 'upi_only' ? 'off' : d.pay_rule === 'cod' ? 'cod' : d.pay_rule === 'cod_advance' ? 'advance' : (d.adv_type === 'fixed' || d.adv_type === 'percent') ? 'advance' : d.adv_type === 'none' ? 'cod' : 'store';
    st.adv = d.adv_type === 'percent' ? '' : numOr(d.adv_value);
    st.fee = d.cod_fee_rule === 'none' ? 'none' : d.cod_fee_rule === 'fixed' ? 'fixed' : 'store'; st.feeV = numOr(d.cod_fee_value);
    st.gift = d.gift_rule === 'yes' ? 'yes' : d.gift_rule === 'no' ? 'no' : 'store'; st.giftV = numOr(d.gift_price);
    st.ship = d.ship_rule === 'free' ? 'free' : (d.ship_rule === 'own' || d.ship_rule === 'paid') ? 'own' : 'store'; st.shipV = numOr(d.ship_value);
    st.ret = SVC_RET_LABEL[d.ret_rule] ? d.ret_rule : 'store'; st.days = numOr(d.ret_days);
  } else {
    const p = init.payments || {}, s = init.shipping || {}, r = init.returns || {};
    st.cod = !p.cod_enabled ? 'off' : p.cod_advance_on ? 'advance' : 'cod';
    st.adv = numOr(p.cod_advance_value, 99); st.feeV = numOr(p.cod_fee, 0);
    st.gift = s.gift_enabled ? 'yes' : 'no'; st.giftV = numOr(s.gift_price, 29);
    st.flat = numOr(s.flat, 49); st.freeAbove = numOr(s.free_above, 0);
    st.ret = SVC_RET_LABEL[r.default_rule] ? r.default_rule : 'either'; st.days = numOr(r.window_days, 7);
  }
  const storeNow = () => {
    if (!store) return {};
    const p = store.payments || {}, s = store.shipping || {}, r = store.returns || {};
    return {
      cod: !p.cod_enabled ? 'Off' : p.cod_advance_on ? `On, ₹${p.cod_advance_value} advance` : 'On, no advance',
      fee: Number(p.cod_fee) > 0 ? `₹${p.cod_fee}` : 'No charge',
      gift: s.gift_enabled ? `Yes, ₹${s.gift_price}` : 'No',
      ship: `₹${s.flat}${Number(s.free_above) > 0 ? `, free above ₹${s.free_above}` : ''}`,
      ret: `${SVC_RET_LABEL[r.default_rule] || 'Replacement or refund'}, ${r.window_days} days`,
    };
  };
  const patch = () => {
    if (isP) {
      const o = {
        pay_rule: { store: '', off: 'upi_only', cod: 'cod', advance: 'cod_advance' }[st.cod], adv_type: '', adv_value: st.cod === 'advance' ? st.adv : '',
        cod_fee_rule: st.fee === 'store' ? '' : st.fee, cod_fee_value: st.fee === 'fixed' ? st.feeV : '',
        gift_rule: st.gift === 'store' ? '' : st.gift, gift_price: st.gift === 'yes' ? st.giftV : '',
        ship_rule: st.ship === 'store' ? '' : st.ship, ship_value: st.ship === 'own' ? st.shipV : '',
        ret_rule: st.ret === 'store' ? '' : st.ret, ret_days: st.ret === 'none' ? '' : st.days,
      };
      onChange && onChange(o); return o;
    }
    const o = {
      payments: { cod_enabled: st.cod !== 'off', cod_advance_on: st.cod === 'advance', cod_advance_value: numOr(st.adv, 99), cod_advance_mode: 'fixed', cod_advance_min_total: 0, cod_advance_for: 'all', cod_fee: numOr(st.feeV, 0) },
      shipping: { gift_enabled: st.gift === 'yes', gift_price: numOr(st.giftV, 0), flat: numOr(st.flat, 0), free_above: numOr(st.freeAbove, 0) },
      returns: { default_rule: st.ret, window_days: numOr(st.days, 7) },
    };
    onChange && onChange(o); return o;
  };
  const seg = (key, opts, after) => h('div', { class: 'seg', role: 'group' }, opts.map(([v, l]) => h('button', { type: 'button', class: 'segb' + (st[key] === v ? ' on' : ''), 'aria-pressed': st[key] === v ? 'true' : 'false', onclick: () => { st[key] = v; patch(); draw(); } }, l)), after);
  const num = (key, ph, w) => h('label', { class: 'svc-num' }, h('span', null, '₹'), h('input', { class: 'inp', type: 'number', min: 0, step: 'any', inputmode: 'decimal', placeholder: ph || '', value: st[key], style: w ? { width: w } : null, oninput: e => { st[key] = e.target.value === '' ? '' : Math.max(0, Number(e.target.value)); patch(); sum(); } }));
  const q = (n, title, ...kids) => h('div', { class: 'svc-q' }, h('div', { class: 'svc-t' }, h('b', null, `${n}. ${title}`)), ...kids);
  const hint = k => (isP && store && storeNow()[k] ? h('div', { class: 'svc-hint' }, 'Same as store = ', h('b', null, storeNow()[k])) : null);
  const sumEl = h('div', { class: 'svc-sum' });
  function sum() {
    if (!isP) { clear(sumEl); return; }
    const sn = storeNow(), parts = [];
    parts.push('Cash on delivery: ' + (st.cod === 'store' ? (sn.cod || 'as store') : st.cod === 'off' ? 'Off' : st.cod === 'cod' ? 'On, no advance' : `On, ₹${st.adv || '?'} advance`));
    if (st.cod !== 'off') parts.push('COD charge: ' + (st.fee === 'store' ? (sn.fee || 'as store') : st.fee === 'none' ? 'No charge' : `₹${st.feeV || 0}`));
    parts.push('Gift wrap: ' + (st.gift === 'store' ? (sn.gift || 'as store') : st.gift === 'no' ? 'No' : `Yes, ₹${st.giftV || 0}`));
    parts.push('Delivery: ' + (st.ship === 'store' ? (sn.ship || 'as store') : st.ship === 'free' ? 'Free' : `₹${st.shipV || 0}`));
    parts.push('Return: ' + (st.ret === 'store' ? (sn.ret || 'as store') : st.ret === 'none' ? 'No return' : `${SVC_RET_LABEL[st.ret]}${st.days !== '' ? ', ' + st.days + ' days' : ''}`));
    clear(sumEl).append(h('b', null, 'On this product: '), parts.join(' · '));
  }
  function draw() {
    clear(root);
    const S0 = isP ? [['store', 'Same as store']] : [];
    root.append(
      q(1, 'Cash on delivery', seg('cod', [...S0, ['off', 'Off'], ['cod', 'On, no advance'], ['advance', 'On, advance needed']]), hint('cod')),
      st.cod === 'advance' ? q(2, 'How much advance?', h('div', { class: 'row' }, num('adv', '99', '110px'), h('span', { class: 'muted small' }, 'Customer pays this by UPI when choosing cash on delivery. The rest is paid on delivery.'))) : null,
      st.cod !== 'off' ? q(3, 'Cash on delivery charge', isP ? [seg('fee', [['store', 'Same as store'], ['none', 'No charge'], ['fixed', 'Charge']], st.fee === 'fixed' ? num('feeV', '50', '110px') : null), hint('fee')] : h('div', { class: 'row' }, num('feeV', '0', '110px'), h('span', { class: 'muted small' }, '0 = no charge'))) : null,
      q(4, 'Gift wrap', seg('gift', [...S0, ['no', 'No'], ['yes', 'Yes']], st.gift === 'yes' ? num('giftV', '29', '110px') : null), hint('gift')),
      q(5, 'Delivery', isP ? [seg('ship', [['store', 'Same as store'], ['free', 'Always free'], ['own', 'Own charge']], st.ship === 'own' ? num('shipV', '49', '110px') : null), hint('ship')]
        : h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Charge'), num('flat', '49', '110px'), h('span', { class: 'muted small' }, 'Free above'), num('freeAbove', '499', '110px'), h('span', { class: 'muted small' }, '(0 = never free)'))),
      q(6, 'Return', seg('ret', [...S0, ...SVC_RET]), st.ret !== 'none' ? h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'muted small' }, 'Days'), h('input', { class: 'inp', type: 'number', min: 0, max: 90, inputmode: 'numeric', placeholder: isP ? 'store days' : '7', value: st.days, style: { width: '110px' }, oninput: e => { st.days = e.target.value === '' ? '' : Math.max(0, Math.min(90, Number(e.target.value))); patch(); sum(); } }), isP ? h('span', { class: 'muted small' }, 'empty = store days') : null) : null, hint('ret')),
      isP ? sumEl : null);
    sum();
  }
  draw();
  if (isP) api('/settings').then(r => { store = r.values; draw(); }).catch(() => {});
  return { el: root, get: patch };
}

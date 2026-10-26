// Admin helpers: DOM, API, forms, modal, toast, formatters
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

export async function api(path, { method = 'GET', body, form } = {}) {
  const opt = { method, headers: { 'x-sy-csrf': '1' }, credentials: 'same-origin' };
  if (form) opt.body = form; else if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let res; try { res = await fetch('/api' + path, opt); } catch { throw Object.assign(new Error('Cannot reach the server. Is it running?'), { offline: true }); }
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
export const confirmBox = (msg, okText = 'Yes, do it') => new Promise(res => { const m = modal('Please confirm', h('div', { class: 'stack' }, h('p', null, msg), h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => { m.close(); res(false); } }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { m.close(); res(true); } }, okText))), { onClose: () => res(false) }); });
export const promptBox = (title, label, { multiline, ok = 'Save', value = '' } = {}) => new Promise(res => { const inp = multiline ? h('textarea', { class: 'inp', rows: 3 }) : h('input', { class: 'inp' }); inp.value = value; const m = modal(title, h('div', { class: 'stack' }, h('label', { class: 'fld' }, h('span', null, label), inp), h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => { m.close(); res(null); } }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { m.close(); res(inp.value); } }, ok))), { onClose: () => res(null) }); setTimeout(() => inp.focus(), 50); });
export async function busy(btn, fn) { btn.disabled = true; btn.classList.add('busy'); try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('busy'); } }
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
    const cur = get(data, f.k);
    let input, wrapper;
    const set = v => { setp(data, f.k, v); ch(); };
    if (f.t === 'textarea' || f.t === 'html') { input = h('textarea', { class: 'inp', rows: f.rows || (f.t === 'html' ? 10 : 3), placeholder: f.ph || '', oninput: e => set(e.target.value) }); input.value = cur == null ? '' : cur; }
    else if (f.t === 'select') { input = h('select', { class: 'inp', onchange: e => set(f.num ? Number(e.target.value) : e.target.value) }, (f.opts || []).map(([v, l]) => h('option', { value: v, selected: String(v) === String(cur ?? '') }, l))); }
    else if (f.t === 'check') { input = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!cur, onchange: e => set(e.target.checked) }), h('span', null, f.l)); wrapper = h('div', { class: 'fld' + (f.w === 'half' ? ' half' : '') }, input, f.h ? h('small', { class: 'muted' }, f.h) : null); root.append(wrapper); continue; }
    else if (f.t === 'number') { input = h('input', { class: 'inp', type: 'number', step: f.step || 'any', min: f.min, max: f.max, placeholder: f.ph || '', oninput: e => set(e.target.value === '' ? '' : Number(e.target.value)) }); input.value = cur == null ? '' : cur; }
    else if (f.t === 'color') { input = h('div', { class: 'row' }, h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#000000', oninput: e => { set(e.target.value); txt.value = e.target.value; } }), (() => { const txt = h('input', { class: 'inp', value: cur || '', placeholder: 'Leave empty for default', oninput: e => set(e.target.value) }); return txt; })()); const txt = input.querySelector('.inp'); }
    else if (f.t === 'date') { input = h('input', { class: 'inp', type: f.time ? 'datetime-local' : 'date', onchange: e => set(e.target.value) }); input.value = cur ? new Date(cur).toISOString().slice(0, f.time ? 16 : 10) : ''; }
    else if (f.t === 'tags') { input = h('input', { class: 'inp', placeholder: f.ph || 'Separate with commas', oninput: e => set(e.target.value.split(',').map(s => s.trim()).filter(Boolean)) }); input.value = Array.isArray(cur) ? cur.join(', ') : ''; }
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

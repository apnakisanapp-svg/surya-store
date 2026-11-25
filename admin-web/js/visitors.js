import { h, $, $$, clear, api, toast, money, ago, dt, card, pageHead, table, badge, busy, kv, tabs, confirmBox, modal } from './lib.js';
import { reg, S } from './router.js';

const RANGES = [[0, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']];
const PLAT = { instagram: ['Instagram', '📸'], youtube: ['YouTube', '▶️'], whatsapp: ['WhatsApp', '💬'], facebook: ['Facebook', '👥'], google: ['Google', '🔎'], direct: ['Direct (typed or saved link)', '🔗'], other: ['Other websites', '🌐'], unknown: ['Not tracked', '❔'] };
const pl = k => { const p = PLAT[k] || [k, '🌐']; return `${p[1]} ${p[0]}`; };
const fmt = n => Number(n || 0).toLocaleString('en-IN');
const dur = s => { s = Math.round(s || 0); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60 ? (s % 60) + 's' : ''); };
const delta = n => { if (n == null || n === 100 && false) return null; const up = n >= 0; return h('span', { class: 'vdelta ' + (up ? 'up' : 'down'), title: 'Compared with the same number of days before' }, (up ? '▲ ' : '▼ ') + Math.abs(Math.round(n)) + '%'); };
const stat = (label, value, sub, change) => card('', h('div', { class: 'stat' }, h('div', { class: 'l' }, label), h('div', { class: 'v' }, value), h('div', { class: 'muted small' }, sub || '', change != null ? [' ', delta(change)] : null)));
const dayName = d => { const t = new Date(d + 'T00:00:00'); return t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
async function copy(text, label) { try { await navigator.clipboard.writeText(text); toast((label || 'Link') + ' copied'); } catch { const t = h('textarea', { value: text, style: { position: 'fixed', opacity: 0 } }); document.body.append(t); t.select(); try { document.execCommand('copy'); toast('Copied'); } catch { toast('Press and hold the link to copy it.', true); } t.remove(); } }

function infoBar() {
  return h('div', { class: 'note vinfo' }, h('b', null, 'Ginti kaise hoti hai: '), 'sirf unhi visitors ki jo cookie banner par Accept dabate hain. Isliye asli visitors se ginti kam dikhegi. Jo Reject dabate hain, unhe kabhi nahi ginte. Reject na karne wale sabko ginna ho to ', h('a', { href: '#/settings/store' }, 'Store options'), ' me "Count every visitor" on karo. Apne phone par ginti rokne ke liye site ke link ke aakhir me ', h('code', null, '?notrack=1'), ' lagakar ek baar kholo.');
}

function bars(items, key, { fmtLabel, color } = {}) {
  const max = Math.max(1, ...items.map(i => i[key] || 0));
  return h('div', { class: 'bars vbars' }, items.map(i => h('div', { style: { height: Math.max(2, (i[key] || 0) / max * 100) + '%', background: color || '' }, 'data-t': `${i.label}: ${fmt(i[key])}` })));
}
function emptyState() {
  return h('div', { class: 'empty' }, h('b', null, 'Abhi koi visit record nahi hua.'), h('div', { class: 'small', style: { marginTop: '6px' } }, 'Site kholo, cookie banner par Accept dabao, aur 2–3 page dekho. Phir yahan ginti dikhne lagegi. (Ek baar apne naye tab me khol kar dekho, ?notrack=1 laga hua na ho.)'));
}

async function overview(box, days) {
  const d = await api('/visitors/overview?days=' + days), c = d.cur;
  clear(box);
  if (!d.any_data) { box.append(infoBar(), emptyState()); return; }
  box.append(h('div', { class: 'grid g4', style: { marginBottom: '14px' } },
    stat('Visitors', fmt(c.visitors), `${fmt(c.visits)} visits`, d.prev.visitors ? d.change.visitors : null),
    stat('Page views', fmt(c.page_views), `${(c.visits ? c.page_views / c.visits : 0).toFixed(1)} per visit`, d.prev.page_views ? d.change.page_views : null),
    stat('Orders', fmt(c.orders), 'Placed in this time', d.prev.orders ? d.change.orders : null),
    stat('Order value', money(c.revenue), 'Without cancelled', d.prev.revenue ? d.change.revenue : null)));
  const live = h('div', { class: 'vlive' }, h('span', { class: 'vdot' }), h('b', null, `${d.live} abhi site par`), d.live_pages.length ? h('span', { class: 'muted small' }, ' · ' + d.live_pages.map(p => `${p.path === '/' ? 'Home' : p.path} (${p.c})`).join(', ')) : null);
  box.append(h('div', { style: { marginBottom: '14px' } }, live));
  box.append(h('div', { class: 'grid g4', style: { marginBottom: '14px' } },
    stat('Avg time on site', dur(d.avg_dur), 'Per visit'),
    stat('Left after 1 page', d.bounce_pct + '%', 'Lower is better'),
    stat('New visitors', d.new_pct + '%', 'First time here'),
    card('', h('div', { class: 'stat' }, h('div', { class: 'l' }, 'Phone or computer'), h('div', { class: 'small', style: { marginTop: '8px' } }, d.devices.length ? d.devices.map(x => h('div', { class: 'kv' }, h('span', { class: 'muted' }, x.device || '?'), h('b', null, fmt(x.c)))) : '—')))));
  const s = d.series.map(x => ({ ...x, label: dayName(x.d) }));
  box.append(h('div', { class: 'grid g2', style: { marginBottom: '14px' } },
    card('Visitors per day', s.length ? bars(s, 'visitors') : h('div', { class: 'muted' }, '—'), s.length ? h('div', { class: 'row small muted', style: { justifyContent: 'space-between', marginTop: '6px' } }, h('span', null, s[0].label), h('span', null, s[s.length - 1].label)) : null),
    card('Orders per day', s.length ? bars(s, 'orders', { color: 'var(--ok)' }) : h('div', { class: 'muted' }, '—'))));
  const hrs = d.hours.map((n, i) => ({ label: `${String(i).padStart(2, '0')}:00`, n })), top = hrs.reduce((a, b) => b.n > a.n ? b : a, hrs[0]);
  box.append(h('div', { class: 'grid g2', style: { marginBottom: '14px' } },
    card('Kab zyada log aate hain (India time)', bars(hrs, 'n', { color: 'var(--info)' }), h('div', { class: 'row small muted', style: { justifyContent: 'space-between', marginTop: '6px' } }, h('span', null, '12 AM'), h('span', null, '12 PM'), h('span', null, '11 PM')), top.n ? h('div', { class: 'small', style: { marginTop: '8px' } }, 'Sabse zyada: ', h('b', null, top.label)) : null),
    card('Dekha se order tak (sirf ginti wale visits)', h('div', { class: 'vfun' }, d.funnel.map(([l, n], i) => { const base = d.funnel[0][1] || 1; return h('div', { class: 'vf-row' }, h('div', { class: 'vf-top' }, h('span', null, l), h('b', null, fmt(n) + (i ? ` · ${base ? Math.round(n / base * 100) : 0}%` : ''))), h('div', { class: 'pbar' }, h('i', { style: { width: Math.max(2, Math.min(100, n / base * 100)) + '%' } }))); })))));
  box.append(card('Log sabse pehle kaunse page par aate hain', d.landing.length ? table([{ l: 'Page', f: r => r.path === '/' ? 'Home' : r.path }, { l: 'Visits', k: 'c', r: 1 }], d.landing) : h('div', { class: 'muted' }, '—')));
  box.append(infoBar());
}

async function sources(box, days) {
  const d = await api('/visitors/sources?days=' + days); clear(box);
  if (!d.rows.length) { box.append(infoBar(), emptyState()); return; }
  box.append(table([
    { l: 'Kahan se', f: r => h('b', null, pl(r.src)) }, { l: 'Visitors', f: r => fmt(r.visitors), r: 1 }, { l: 'Visits', f: r => fmt(r.visits), r: 1 }, { l: 'Avg time', f: r => dur(r.avg_dur), r: 1 },
    { l: 'Left after 1 page', f: r => r.bounce_pct + '%', r: 1 }, { l: 'Cart', f: r => fmt(r.atc), r: 1 }, { l: 'Orders', f: r => fmt(r.orders), r: 1 }, { l: 'Order value', f: r => money(r.revenue), r: 1 }, { l: 'Visit → order', f: r => r.conv_pct + '%', r: 1 }], d.rows));
  box.lastChild.querySelector('table').classList.add('stackm');
  box.append(h('p', { class: 'muted small', style: { marginTop: '10px' } }, '"Not tracked" = order aaye jinka source pata nahi (cookie Accept nahi kiya tha). Reel ya Short se aane wale log "Reels & Shorts" tab me alag dikhte hain.'), infoBar());
}

async function campaigns(box, days) {
  const [d, prods] = await Promise.all([api('/visitors/campaigns?days=' + days), api('/products?per=100').catch(() => ({ items: [] }))]);
  clear(box);
  const name = h('input', { class: 'inp', placeholder: 'Reel ya Short ka naam, jaise: Gloves reel', maxlength: 60 });
  const plat = h('select', { class: 'inp' }, [['instagram', 'Instagram'], ['youtube', 'YouTube'], ['whatsapp', 'WhatsApp'], ['facebook', 'Facebook'], ['other', 'Other']].map(([k, l]) => h('option', { value: k }, l)));
  const tg = h('select', { class: 'inp' }, h('option', { value: '/' }, 'Home page'), (prods.items || []).filter(p => p.status === 'live' || p.status === 'active' || p.status === 'published' || true).map(p => h('option', { value: '/p/' + p.slug }, p.name)));
  const out = h('div', { class: 'stack' });
  box.append(card('Naya reel / Short ka link banao',
    h('p', { class: 'muted small', style: { marginBottom: '10px' } }, 'Har reel ya Short ke liye alag link banao aur use bio / comment / description me lagao. Phir yahin dikhega kitne log aaye aur kitne ne order kiya.'),
    h('div', { class: 'grid g3' }, h('label', { class: 'fld' }, h('span', null, 'Naam'), name), h('label', { class: 'fld' }, h('span', null, 'Kahan dalna hai'), plat), h('label', { class: 'fld' }, h('span', null, 'Kaunsa page khulna chahiye'), tg)),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: async e => { try { const r = await busy(e.currentTarget, () => api('/visitors/campaigns', { method: 'POST', body: { name: name.value, platform: plat.value, target: tg.value } })); toast('Link ban gaya'); await campaigns(box, days); } catch (x) { toast(x.message, true); } } }, 'Link banao')), out));
  const list = d.rows;
  if (!list.length) { box.append(h('div', { class: 'empty', style: { marginTop: '14px' } }, 'Abhi koi reel ya Short ka link nahi bana. Upar se pehla banao.')); box.append(infoBar()); return; }
  box.append(h('div', { class: 'vcamps' }, list.map(c => h('section', { class: 'card vcamp' },
    h('div', { class: 'vc-head' }, h('div', null, h('b', null, c.name), h('div', { class: 'small muted' }, `${pl(c.platform)} · tag: `, h('code', null, c.code))),
      c.id ? h('button', { class: 'btn sm', onclick: async () => { if (await confirmBox(`"${c.name}" ko list se hata dein? Purani ginti save rahegi.`)) { await api('/visitors/campaigns/' + c.id, { method: 'DELETE' }); await campaigns(box, days); } } }, 'Hatao') : null),
    h('div', { class: 'vc-nums' }, [['Visits', c.visits], ['Product dekha', c.saw_product], ['Cart', c.atc], ['Orders', c.orders]].map(([l, n]) => h('div', null, h('b', null, fmt(n)), h('span', { class: 'muted small' }, l)))),
    h('div', { class: 'small muted' }, `${money(c.revenue)} order value · ${c.conv_pct}% visits ne order kiya · avg ${dur(c.avg_dur)}`),
    c.id ? h('div', { class: 'vc-links' },
      h('div', { class: 'vc-link' }, h('span', { class: 'small muted' }, 'Chhota link'), h('input', { class: 'inp', readonly: true, value: c.short, onfocus: e => e.target.select() }), h('button', { class: 'btn sm', onclick: () => copy(c.short, 'Chhota link') }, 'Copy')),
      c.short !== c.link ? h('div', { class: 'vc-link' }, h('span', { class: 'small muted' }, 'Poora link'), h('input', { class: 'inp', readonly: true, value: c.link, onfocus: e => e.target.select() }), h('button', { class: 'btn sm', onclick: () => copy(c.link, 'Poora link') }, 'Copy')) : null) : h('div', { class: 'small muted' }, 'Ye tag kisi link me use hua par yahan save nahi hai.')))));
  box.append(infoBar());
}

async function products(box, days) {
  const d = await api('/visitors/products?days=' + days); clear(box);
  if (!d.rows.length) { box.append(infoBar(), emptyState()); return; }
  const flag = r => r.flag === 'looked_not_bought' ? badge('Dekha, khareeda nahi', 'warn') : r.flag === 'looked_not_carted' ? badge('Dekha, cart me nahi daala', 'warn') : null;
  box.append(table([
    { l: 'Product', f: r => h('div', null, h('a', { href: '#/products/' + r.id }, h('b', null, r.name)), h('div', { class: 'small' }, flag(r))) },
    { l: 'Views', f: r => fmt(r.views), r: 1 }, { l: 'Avg time', f: r => r.avg_sec ? dur(r.avg_sec) : '—', r: 1 }, { l: 'Scrolled', f: r => r.scroll ? r.scroll + '%' : '—', r: 1 },
    { l: 'Wishlist', f: r => fmt(r.wish), r: 1 }, { l: 'Cart', f: r => fmt(r.atc), r: 1 }, { l: 'Checkout', f: r => fmt(r.checkout), r: 1 }, { l: 'Orders', f: r => fmt(r.orders), r: 1 }, { l: 'Order value', f: r => money(r.revenue), r: 1 }, { l: 'View → order', f: r => r.conv_pct + '%', r: 1 }], d.rows));
  box.lastChild.querySelector('table').classList.add('stackm');
  box.append(h('p', { class: 'muted small', style: { marginTop: '10px' } }, '"Dekha, khareeda nahi" = kam se kam 8 baar dekha gaya par ek bhi order nahi. Photo, price ya description me kuch badalna chahiye ho sakta hai.'));
}

const KIND = { home: 'Home', product: 'Product pages', cart: 'Cart', checkout: 'Checkout', order: 'Order / track', shop: 'Shop & search', other: 'Other pages' };
const csvBtn = (type, days) => h('a', { class: 'btn sm', href: `api/visitors/export/csv?type=${type}&days=${days}`, download: `surya-${type}.csv` }, 'CSV download');
const when = t => ago(t);

async function pagesTab(box, days) {
  const d = await api('/visitors/pages?days=' + days); clear(box);
  if (!d.pages.length) { box.append(infoBar(), emptyState()); return; }
  box.append(card('Kaun sa type ka page kitna dekha gaya', table([
    { l: 'Page type', f: r => h('b', null, KIND[r.kind] || r.kind) }, { l: 'Views', f: r => fmt(r.views), r: 1 }, { l: 'Avg time', f: r => r.avg_sec ? dur(r.avg_sec) : '—', r: 1 }, { l: 'Scrolled', f: r => r.scroll ? r.scroll + '%' : '—', r: 1 }, { l: 'Yahan se chale gaye', f: r => `${fmt(r.exits)} (${r.exit_pct}%)`, r: 1 }], d.kinds)));
  box.lastChild.querySelector('table').classList.add('stackm');
  box.append(h('div', { style: { height: '14px' } }), h('div', { class: 'tw-title' }, h('b', null, 'Sabse zyada dekhe gaye page')));
  box.append(table([{ l: 'Page', f: r => h('div', null, h('b', null, r.label), r.label !== r.path ? h('div', { class: 'small muted' }, r.path) : null) }, { l: 'Views', f: r => fmt(r.views), r: 1 }, { l: 'Sabse pehle yahin aaye', f: r => fmt(r.entries), r: 1 }, { l: 'Avg time', f: r => r.avg_sec ? dur(r.avg_sec) : '—', r: 1 }, { l: 'Scrolled', f: r => r.scroll ? r.scroll + '%' : '—', r: 1 }, { l: 'Yahan se chale gaye', f: r => `${fmt(r.exits)} (${r.exit_pct}%)`, r: 1 }], d.pages));
  box.lastChild.querySelector('table').classList.add('stackm');
  box.append(h('p', { class: 'muted small', style: { marginTop: '10px' } }, '"Yahan se chale gaye" = us visit ka aakhri page. Checkout ya cart par zyada % ho to wahan dikkat ho sakti hai.'), infoBar());
}

const JF = [['all', 'Sab'], ['ordered', 'Order wale'], ['carted', 'Cart chhoda'], ['new', 'Naye'], ['login', 'Login wale']];
async function journeysTab(box, days, st) {
  st.jf ||= 'all'; st.jp ||= 1;
  const d = await api(`/visitors/journeys?days=${days}&filter=${st.jf}&page=${st.jp}`); clear(box);
  box.append(h('div', { class: 'row vrange' }, JF.map(([k, l]) => h('button', { class: 'segb' + (k === st.jf ? ' on' : ''), onclick: () => { st.jf = k; st.jp = 1; journeysTab(box, days, st); } }, l)), h('span', { class: 'grow' }), csvBtn('visits', days)));
  if (!d.items.length) { box.append(d.total === 0 && st.jf === 'all' ? emptyState() : h('div', { class: 'empty' }, 'Is filter me koi visit nahi.'), infoBar()); return; }
  box.append(h('div', { class: 'vjl' }, d.items.map(v => h('div', { class: 'vj', onclick: () => journeyModal(v.id) },
    h('div', { class: 'vj-top' }, h('b', null, v.who), h('span', { class: 'muted small' }, when(v.started_at))),
    h('div', { class: 'vj-meta small muted' }, `${pl(v.src)}${v.campaign ? ' · ' + v.campaign : ''} · ${v.device || '?'} · ${v.pages} page · ${dur(v.dur)}`),
    h('div', { class: 'vj-badges' }, v.ordered ? badge('Order kiya', 'ok') : v.checkout ? badge('Checkout chhoda', 'warn') : v.atc ? badge('Cart chhoda', 'warn') : null, v.is_new ? badge('Naya', 'info') : null, v.login ? badge('Login', '') : null)))));
  if (d.pages > 1) box.append(h('div', { class: 'row end', style: { marginTop: '12px' } }, h('span', { class: 'muted' }, `Page ${d.page} of ${d.pages}`), h('button', { class: 'btn sm', disabled: d.page <= 1, onclick: () => { st.jp--; journeysTab(box, days, st); } }, 'Previous'), h('button', { class: 'btn sm', disabled: d.page >= d.pages, onclick: () => { st.jp++; journeysTab(box, days, st); } }, 'Next')));
  box.append(infoBar());
}
async function journeyModal(id) {
  const d = await api('/visitors/journeys/' + id), v = d.visit;
  const ic = { page: '📄', atc: '🛒', checkout: '💳', wish: '❤️', order: '✅' };
  const t = x => new Date(x).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  modal(v.who, h('div', { class: 'stack' },
    h('div', { class: 'small muted' }, `${dt(v.started_at)} · ${pl(v.src)}${v.campaign ? ' · ' + v.campaign : ''}${v.ref_host ? ' · ' + v.ref_host : ''} · ${v.device || '?'}${v.is_new ? ' · naya visitor' : ''}`),
    h('ul', { class: 'tl vjt' }, d.steps.map(s => h('li', null, h('span', { class: 'muted small' }, t(s.at) + ' '), `${ic[s.type] || '•'} `, h('b', null, s.label), s.type === 'page' && s.sec ? h('span', { class: 'muted small' }, ` · ${dur(s.sec)}${s.scroll ? ' · ' + s.scroll + '% scroll' : ''}`) : null, s.total ? h('span', { class: 'muted small' }, ' · ' + money(s.total)) : null)))), { wide: true });
}

async function cartsTab(box, days) {
  const d = await api('/visitors/abandoned?days=' + days); clear(box);
  box.append(h('div', { class: 'grid g2', style: { marginBottom: '14px' } }, stat('Cart me daal kar chale gaye', fmt(d.total), 'Visits jinhone order nahi kiya'), stat('Checkout shuru karke chhoda', fmt(d.left_checkout), 'Ye sabse garam log hain')));
  box.append(d.rows.length ? table([{ l: 'Product', f: r => r.product_id ? h('a', { href: '#/products/' + r.product_id }, h('b', null, r.name)) : r.name }, { l: 'Kitne visits ne cart me daala aur order nahi kiya', f: r => fmt(r.visits), r: 1 }, { l: 'Aakhri baar', f: r => when(r.last_at), r: 1 }], d.rows) : h('div', { class: 'empty' }, 'Is time me koi cart nahi chhoda gaya.'));
  box.lastChild.querySelector && box.lastChild.querySelector('table') && box.lastChild.querySelector('table').classList.add('stackm');
  box.append(h('p', { class: 'muted small', style: { marginTop: '10px' } }, 'Ye sirf unka hai jinhone Accept kiya. Price, shipping charge ya delivery time ki wajah se log yahan chhodte hain, to un par dhyan do.'), infoBar());
}

async function searchesTab(box, days) {
  const d = await api('/visitors/searches?days=' + days); clear(box);
  if (!d.rows.length) { box.append(h('div', { class: 'empty' }, 'Is time me kisi ne search nahi kiya.')); return; }
  box.append(h('div', { class: 'grid g2' },
    card('Sabse zyada search hua', table([{ l: 'Shabd', f: r => h('b', null, r.term) }, { l: 'Kitni baar', f: r => fmt(r.n), r: 1 }, { l: 'Mile', f: r => r.results ? badge(r.results + ' product', 'ok') : badge('kuch nahi', 'bad'), r: 1 }], d.rows.slice(0, 20))),
    card('Search kiya par kuch nahi mila', d.nothing.length ? h('div', null, h('p', { class: 'muted small', style: { marginBottom: '8px' } }, 'Ye product add karne ke idea hain:'), table([{ l: 'Shabd', f: r => h('b', null, r.term) }, { l: 'Kitni baar', f: r => fmt(r.n), r: 1 }], d.nothing)) : h('div', { class: 'muted' }, 'Sab search me kuch na kuch mila.'))));
}

async function peopleTab(box, days) {
  const d = await api('/visitors/people?days=' + days); clear(box);
  box.append(card('Login wale', d.logins.length ? table([
    { l: 'Customer', f: r => h('div', null, h('b', null, r.name), h('div', { class: 'small muted' }, r.email)) }, { l: 'Visits', f: r => fmt(r.visits), r: 1 }, { l: 'Pages', f: r => fmt(r.pages), r: 1 }, { l: 'Time', f: r => dur(r.dur), r: 1 },
    { l: 'Kya dekha', f: r => r.seen.length ? r.seen.join(', ') : '—' }, { l: 'Orders', f: r => fmt(r.orders), r: 1 }, { l: 'Total kharcha', f: r => money(r.spent), r: 1 }, { l: 'Aakhri baar', f: r => when(r.last_at), r: 1 }], d.logins, { onRow: r => { location.hash = '#/customers/' + r.id; } }) : h('div', { class: 'muted' }, 'Is time me koi login wala customer nahi aaya.')));
  box.lastChild.querySelectorAll('table').forEach(t => t.classList.add('stackm'));
  box.append(h('div', { style: { height: '14px' } }), card('Bina login wale (naam nahi, sirf anonymous ID)', d.guests.length ? table([
    { l: 'Visitor', f: r => h('b', null, r.who) }, { l: 'Visits', f: r => fmt(r.visits), r: 1 }, { l: 'Pages', f: r => fmt(r.pages), r: 1 }, { l: 'Kahan se', f: r => pl(r.src) }, { l: 'Device', f: r => r.device || '?' }, { l: 'Cart', f: r => r.atc ? 'Haan' : '—' }, { l: 'Order', f: r => r.ordered ? badge('Haan', 'ok') : '—' }, { l: 'Aakhri baar', f: r => when(r.last_at), r: 1 }], d.guests) : h('div', { class: 'muted' }, 'Koi nahi.')));
  box.lastChild.querySelectorAll('table').forEach(t => t.classList.add('stackm'));
  box.append(h('p', { class: 'muted small', style: { marginTop: '10px' } }, 'Agar koi pehle bina login dekhe aur baad me login kare, to uski purani visits bhi us customer me jud jati hain.'), infoBar());
}

async function monthlyTab(box) {
  const d = await api('/visitors/monthly'); clear(box);
  if (!d.rows.length) { box.append(emptyState()); return; }
  const mn = m => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const ch = x => x == null ? '' : delta(x);
  box.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('span', { class: 'grow' }), csvBtn('monthly', 0)));
  box.append(table([
    { l: 'Mahina', f: r => h('b', null, mn(r.month)) }, { l: 'Visitors', f: r => h('span', null, fmt(r.visitors), ' ', r.change ? ch(r.change.visitors) : null), r: 1 }, { l: 'Page views', f: r => fmt(r.page_views), r: 1 },
    { l: 'Orders', f: r => h('span', null, fmt(r.orders), ' ', r.change ? ch(r.change.orders) : null), r: 1 }, { l: 'Order value', f: r => h('span', null, money(r.revenue), ' ', r.change ? ch(r.change.revenue) : null), r: 1 },
    { l: 'Top source', f: r => r.top_source ? pl(r.top_source) : '—' }, { l: 'Top reel / Short', f: r => r.top_reel || '—' }, { l: 'Top product', f: r => r.top_product || '—' }], d.rows));
  box.lastChild.querySelector('table').classList.add('stackm');
  box.append(h('p', { class: 'muted small', style: { marginTop: '10px' } }, 'Har mahina India time ke hisaab se alag ginta hai. ▲▼ pichhle mahine se tulna hai.'), infoBar());
}

async function policyNote(slot) {
  try {
    const s = await api('/visitors/policy'); clear(slot);
    if (s.cookies === false || s.privacy === false) slot.append(h('div', { class: 'note warn', style: { marginBottom: '14px' } }, h('b', null, 'Policy: '), 'Cookie Policy ya Privacy Policy me "visit counting" ka hissa abhi nahi hai. ', h('button', { class: 'btn sm', style: { marginLeft: '8px' }, onclick: async e => { try { await busy(e.currentTarget, () => api('/visitors/policy', { method: 'POST' })); toast('Policy me hissa jod diya'); policyNote(slot); } catch (x) { toast(x.message, true); } } }, 'Policy me jodo'), h('span', { class: 'small muted', style: { marginLeft: '8px' } }, 'Jodne ke baad policy ka version badal jata hai. Ek baar vakil ya CA se dikhwa lena.')));
  } catch { /* ignore */ }
}

const TABS = [['overview', 'Overview'], ['sources', 'Kahan se aaye'], ['campaigns', 'Reels & Shorts'], ['products', 'Products'], ['pages', 'Pages'], ['journeys', 'Journeys'], ['carts', 'Cart chhode'], ['searches', 'Search'], ['people', 'Log'], ['monthly', 'Mahina']];
reg(/^\/visitors$/, async (v, m, q) => {
  const st = { tab: q.get('tab') || 'overview', days: [0, 7, 30, 90].includes(+q.get('days')) ? +q.get('days') : 7 };
  const bar = h('div'), range = h('div', { class: 'row vrange' }), box = h('div'), pol = h('div');
  v.append(pageHead('Visitors & reels'), pol, range, bar, box); policyNote(pol);
  const draw = async () => {
    clear(range).append(...(st.tab === 'monthly' ? [] : RANGES).map(([k, l]) => h('button', { class: 'segb' + (k === st.days ? ' on' : ''), onclick: () => { st.days = k; draw(); } }, l)));
    clear(bar).append(tabs(TABS.map(([k, l]) => [k, l]), st.tab, k => { st.tab = k; draw(); }));
    box.style.opacity = '.55';
    try { await ({ overview, sources, campaigns, products, pages: pagesTab, journeys: (b, d2) => journeysTab(b, d2, st), carts: cartsTab, searches: searchesTab, people: peopleTab, monthly: monthlyTab }[st.tab])(box, st.days); } catch (x) { clear(box).append(h('div', { class: 'note bad' }, x.message)); }
    box.style.opacity = '';
  };
  await draw();
});

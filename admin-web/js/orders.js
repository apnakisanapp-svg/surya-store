import { h, $, $$, clear, api, toast, money, dt, ago, card, pageHead, table, statusBadge, badge, busy, kv, tabs, modal, confirmBox, promptBox, buildForm } from './lib.js';
import { reg, go, S } from './router.js';

const TABS = [['action', 'Needs action'], ['payment_pending', 'Awaiting payment'], ['cod_confirm', 'COD to confirm'], ['confirmed', 'To pack'], ['packed', 'To ship'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['', 'All']];
reg(/^\/orders$/, async (v, m, q) => {
  const st = { status: q.get('status') ?? 'action', q: q.get('q') || '', method: '', page: 1, risky: q.get('risky') || '' };
  const box = h('div'), tabBar = h('div'), sel = new Set();
  const search = h('input', { class: 'inp', placeholder: 'Order no., phone, name, UTR…', value: st.q, style: { maxWidth: '320px' }, onkeydown: e => { if (e.key === 'Enter') { st.q = e.target.value; st.page = 1; load(); } } });
  const meth = h('select', { class: 'inp', style: { maxWidth: '160px' }, onchange: e => { st.method = e.target.value; st.page = 1; load(); } }, h('option', { value: '' }, 'All payments'), h('option', { value: 'upi' }, 'UPI'), h('option', { value: 'cod' }, 'COD'));
  v.append(pageHead('Orders', h('a', { class: 'btn', href: '/api/orders/export/csv', download: 'orders.csv' }, 'Export CSV')), h('div', { class: 'row', style: { marginBottom: '12px' } }, search, meth), tabBar, box);
  async function load() {
    const p = new URLSearchParams({ page: st.page, per: 25 }); if (st.status) p.set('status', st.status); if (st.q) p.set('q', st.q); if (st.method) p.set('method', st.method); if (st.risky) p.set('risky', st.risky);
    const r = await api('/orders?' + p);
    clear(tabBar).append(tabs(TABS.map(([k, l]) => [k, l, k === '' ? '' : (k === 'action' ? '' : r.counts[k] || '')]), st.status, k => { st.status = k; st.page = 1; sel.clear(); load(); }));
    clear(box); sel.clear();
    const bulk = h('div', { class: 'row hide', style: { margin: '0 0 10px' } }), cnt = h('b');
    const upd = () => { bulk.classList.toggle('hide', !sel.size); cnt.textContent = `${sel.size} selected`; };
    const nextOf = { payment_pending: 'confirmed', cod_confirm: 'confirmed', confirmed: 'packed', packed: 'shipped', shipped: 'delivered' };
    bulk.append(cnt, h('button', { class: 'btn sm', onclick: async () => { const to = nextOf[st.status]; if (!to) return toast('Pick a status tab first.', true); const out = await api('/orders/bulk', { method: 'POST', body: { ids: [...sel], to } }); toast(`${out.done.length} updated${out.failed.length ? `, ${out.failed.length} could not change` : ''}`, !!out.failed.length); load(); } }, 'Move to next step'),
      h('button', { class: 'btn sm bad', onclick: async () => { const reason = await promptBox('Cancel selected orders', 'Reason (shown to customers)'); if (!reason) return; const out = await api('/orders/bulk', { method: 'POST', body: { ids: [...sel], to: 'cancelled', reason } }); toast(`${out.done.length} cancelled`); load(); } }, 'Cancel'));
    box.append(bulk, table([
      { l: '', f: r => h('input', { type: 'checkbox', onchange: e => { e.target.checked ? sel.add(r.id) : sel.delete(r.id); upd(); } }) },
      { l: 'Order', f: r => h('div', null, h('a', { href: '#/orders/' + r.id }, h('b', null, r.number)), h('div', { class: 'small muted' }, ago(r.placed_at))) },
      { l: 'Customer', f: r => h('div', null, r.name, h('div', { class: 'small muted' }, `${r.phone}${r.city ? ' · ' + r.city : ''}`)) },
      { l: 'Items', f: r => h('span', { class: 'small' }, r.summary.slice(0, 70)) },
      { l: 'Payment', f: r => h('div', null, r.payment_method.toUpperCase(), h('div', { class: 'small' }, r.payment_status === 'submitted' ? badge('UTR ' + r.utr, 'warn') : badge(r.payment_status.replace('_', ' '), r.payment_status === 'verified' || r.payment_status === 'cod_collected' ? 'ok' : ''))) },
      { l: 'Total', f: r => money(r.total), r: 1 },
      { l: 'Status', f: r => h('div', { class: 'col' }, statusBadge(r.status), r.risky ? badge('risky COD', 'bad') : null, r.has_battery ? badge('battery', 'info') : null) },
    ], r.items, { onRow: r => go('/orders/' + r.id), empty: 'No orders in this tab.' }));
    if (r.pages > 1) box.append(h('div', { class: 'row end', style: { marginTop: '12px' } }, h('span', { class: 'muted' }, `Page ${r.page} of ${r.pages}`), h('button', { class: 'btn sm', disabled: r.page <= 1, onclick: () => { st.page--; load(); } }, 'Previous'), h('button', { class: 'btn sm', disabled: r.page >= r.pages, onclick: () => { st.page++; load(); } }, 'Next')));
  }
  await load();
});

const LABEL = { confirmed: 'Confirm order', packed: 'Mark packed', shipped: 'Add courier & ship', delivered: 'Mark delivered', cancelled: 'Cancel order', returned: 'Mark returned' };
reg(/^\/orders\/(\d+)$/, async (v, m) => {
  const id = m[1];
  async function paint() {
    const r = await api('/orders/' + id), o = r.order; clear(v);
    const reload = async () => { await paint(); };
    const act = (label, fn, cls = '') => h('button', { class: 'btn ' + cls, onclick: async e => { try { await busy(e.currentTarget, fn); await reload(); } catch (x) { toast(x.message, true); } } }, label);
    const actions = h('div', { class: 'row' });
    if (o.payment_method === 'upi' && o.payment_status === 'submitted') actions.append(act('Payment received ✓', () => api(`/orders/${id}/verify`, { method: 'POST', body: { ok: true } }), 'ok'), act('Payment not found', async () => { const n = await promptBox('Payment not found', 'Note to customer (optional)', { ok: 'Reject payment' }); if (n === null) return; await api(`/orders/${id}/verify`, { method: 'POST', body: { ok: false, note: n } }); }, 'bad'));
    for (const to of r.next) {
      if (to === 'cancelled') actions.append(act(LABEL[to], async () => { const reason = await promptBox('Cancel this order', 'Reason (the customer will see it)', { ok: 'Cancel order' }); if (!reason) throw new Error('Cancel stopped.'); await api(`/orders/${id}/status`, { method: 'POST', body: { to, reason } }); }, 'bad'));
      else if (to === 'shipped') actions.append(h('button', { class: 'btn primary', onclick: () => shipModal(o, reload) }, LABEL[to]));
      else if (to === 'confirmed' && o.status === 'payment_pending' && o.payment_status !== 'verified') actions.append(act('Confirm without UTR', async () => { if (!(await confirmBox('Confirm this order without verifying a UPI payment?'))) throw new Error('Stopped.'); await api(`/orders/${id}/status`, { method: 'POST', body: { to, force: true, note: 'Confirmed manually' } }); }));
      else actions.append(act(LABEL[to] || to, () => api(`/orders/${id}/status`, { method: 'POST', body: { to } }), to === 'returned' ? '' : 'primary'));
    }
    const a = o.address;
    v.append(pageHead(`Order ${o.number}`, h('a', { class: 'btn', href: `/api/orders/${id}/slip`, target: '_blank' }, 'Packing slip'), h('a', { class: 'btn', href: `/api/orders/${id}/invoice`, target: '_blank' }, 'Invoice')),
      h('div', { class: 'row', style: { marginBottom: '14px' } }, statusBadge(o.status), badge(o.payment_method.toUpperCase()), o.risky ? badge('Risky: ' + (o.risk_reason || ''), 'bad') : null, o.has_battery ? badge('Battery: check courier', 'info') : null, h('span', { class: 'muted small' }, dt(o.placed_at))));
    if (o.status === 'payment_pending' && o.expires_at) v.append(h('div', { class: 'note', style: { marginBottom: '12px' } }, `Unpaid UPI orders cancel automatically at ${dt(o.expires_at)} and the stock is released.`));
    if (o.payment_method === 'cod' && o.status === 'cod_confirm') v.append(h('div', { class: 'note warn', style: { marginBottom: '12px' } }, `Call ${o.phone} to confirm this COD order before packing.`));
    v.append(card('Next step', actions.childNodes.length ? actions : h('span', { class: 'muted' }, 'Nothing to do on this order.')));
    // payment panel
    if (o.payment_method === 'upi') {
      v.append(card('UPI payment', kv('Amount to receive', money(o.total)), kv('Status', o.payment_status), kv('UTR from customer', o.utr || '—'),
        o.payment_screenshot ? h('div', { style: { marginTop: '10px' } }, h('a', { href: `/api/orders/${id}/file/payment`, target: '_blank' }, h('img', { src: `/api/orders/${id}/file/payment`, alt: 'Payment screenshot', style: { maxWidth: '260px', borderRadius: '10px', border: '1px solid var(--line)' } }))) : null,
        h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'Open your bank or UPI app and match the amount and UTR before pressing "Payment received".')));
    }
    v.append(h('div', { class: 'grid g21', style: { marginTop: '14px' } },
      h('div', { class: 'stack-lg' },
        card('Items', table([{ l: '', f: i => i.image_url ? h('img', { src: i.image_url, width: 44, height: 44, alt: '', style: { borderRadius: '8px', objectFit: 'cover' } }) : null }, { l: 'Product', f: i => h('div', null, i.name, i.variant_name ? h('div', { class: 'small muted' }, i.variant_name) : null) }, { l: 'Qty', k: 'qty', r: 1 }, { l: 'Price', f: i => money(i.price), r: 1 }, { l: 'Cost', f: i => money(i.cost), r: 1 }], r.items),
          h('div', { style: { marginTop: '12px' } }, kv('Subtotal', money(o.subtotal)), o.discount ? kv(`Discount ${o.coupon_code || ''}`, '−' + money(o.discount)) : null, kv('Shipping', money(o.shipping)), o.cod_fee ? kv('COD fee', money(o.cod_fee)) : null, o.gift_fee ? kv('Gift wrap', money(o.gift_fee)) : null, kv('Total', money(o.total)))),
        r.requests.length ? card('Return / replacement requests', ...r.requests.map(q => h('div', { class: 'stack', style: { borderBottom: '1px solid var(--line)', paddingBottom: '10px' } }, h('div', { class: 'row' }, h('b', null, q.type === 'refund' ? 'Refund' : 'Replacement'), statusBadge(q.status), h('span', { class: 'muted small' }, dt(q.created_at))), h('p', null, q.reason), h('div', { class: 'row' }, q.photos.map((_, k) => h('a', { href: `/api/orders/${id}/file/req-${q.id}-${k}`, target: '_blank' }, h('img', { src: `/api/orders/${id}/file/req-${q.id}-${k}`, alt: '', width: 72, height: 72, style: { objectFit: 'cover', borderRadius: '8px' } })))),
          q.status === 'open' || q.status === 'approved' ? h('div', { class: 'row' }, q.status === 'open' ? act('Approve', () => api(`/orders/${id}/requests/${q.id}`, { method: 'POST', body: { action: 'approve' } }), 'ok') : null, act('Reject', async () => { const n = await promptBox('Reject request', 'Reason'); if (n === null) throw new Error('Stopped.'); await api(`/orders/${id}/requests/${q.id}`, { method: 'POST', body: { action: 'reject', note: n } }); }, 'bad'), q.status === 'approved' ? act('Mark completed', () => api(`/orders/${id}/requests/${q.id}`, { method: 'POST', body: { action: 'complete' } })) : null, q.type === 'refund' ? h('button', { class: 'btn', onclick: () => refundModal(o, reload) }, 'Record refund') : null) : null))) : null,
        card('History', h('ul', { class: 'tl' }, r.events.map(e => h('li', null, h('b', null, (e.status || '').replace('_', ' ')), e.note ? ' · ' + e.note : '', h('div', { class: 'small muted' }, `${dt(e.created_at)} · ${e.actor}`))))),
        r.refunds.length ? card('Refunds', table([{ l: 'Date', f: x => dt(x.created_at) }, { l: 'Amount', f: x => money(x.amount), r: 1 }, { l: 'Method', k: 'method' }, { l: 'Reference', k: 'ref' }], r.refunds)) : null),
      h('div', { class: 'stack-lg' },
        card('Customer', h('b', null, o.name), h('div', null, h('a', { href: 'tel:' + o.phone }, o.phone), ' · ', h('a', { href: `https://wa.me/91${o.phone}`, target: '_blank', rel: 'noopener' }, 'WhatsApp')), o.email ? h('div', null, o.email) : null,
          h('p', { style: { marginTop: '8px' } }, a.line1, a.line2 ? ', ' + a.line2 : '', h('br'), `${a.city}, ${a.state} - ${a.pincode}`), h('button', { class: 'btn sm', onclick: () => { navigator.clipboard.writeText(`${a.name}\n${a.phone}\n${a.line1}${a.line2 ? ', ' + a.line2 : ''}\n${a.city}, ${a.state} - ${a.pincode}`).then(() => toast('Address copied')); } }, 'Copy address'),
          o.customer_note ? h('div', { class: 'note', style: { marginTop: '8px' } }, 'Customer note: ' + o.customer_note) : null, o.gift ? h('div', { class: 'note', style: { marginTop: '8px' } }, 'Gift wrap. Message: ' + (o.gift.message || '—')) : null,
          h('div', { class: 'muted small', style: { marginTop: '8px' } }, `Earlier orders from this phone: ${r.history.total} (delivered ${r.history.delivered || 0}, cancelled/returned ${r.history.bad || 0})`)),
        card('Shipping', kv('Courier', o.courier || '—'), kv('Tracking no.', o.tracking_no || '—'), kv('Your shipping cost', o.ship_cost != null ? money(o.ship_cost) : 'not entered'), o.tracking_url ? h('a', { href: o.tracking_url, target: '_blank', rel: 'noopener' }, 'Open tracking') : null, h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onclick: () => shipModal(o, reload, true) }, 'Edit courier details'))),
        card('Profit on this order', kv('Revenue (without GST)', money(r.profit.revenue)), kv('Product cost', money(r.profit.cost)), kv('Shipping cost' + (r.profit.ship_estimated ? ' (estimated)' : ''), money(r.profit.ship_cost)), kv('Profit', h('span', { style: { color: r.profit.profit >= 0 ? 'var(--ok)' : 'var(--bad)' } }, `${money(r.profit.profit)} (${r.profit.margin}%)`)), h('p', { class: 'muted small' }, 'Does not include ads or packaging.')),
        card('Messages', r.outbox.length ? r.outbox.map(x => h('div', { class: 'row between' }, h('span', { class: 'small' }, `${x.channel} · ${x.kind}`), x.link ? h('a', { class: 'btn sm', href: x.link, target: '_blank', rel: 'noopener', onclick: () => api(`/outbox/${x.id}/sent`, { method: 'POST' }) }, 'Send on WhatsApp') : badge(x.status))) : h('span', { class: 'muted' }, 'No messages.')),
        card('Private note', (() => { const t = h('textarea', { class: 'inp', rows: 3 }); t.value = o.internal_note || ''; return h('div', { class: 'stack' }, t, h('button', { class: 'btn sm', onclick: async () => { await api('/orders/' + id, { method: 'PATCH', body: { internal_note: t.value } }); toast('Saved'); } }, 'Save note')); })()),
        card('Policies accepted', r.consents.length ? h('ul', { style: { margin: 0, paddingLeft: '18px' } }, r.consents.map(c => h('li', { class: 'small' }, `${c.policy_slug || c.kind} v${c.policy_version || '-'} · ${dt(c.created_at)}`))) : h('span', { class: 'muted' }, 'No record.')))));
  }
  await paint();
});
function shipModal(o, done, edit) {
  const f = buildForm([{ k: 'courier', l: 'Courier', t: 'text', ph: 'Delhivery, India Post…' }, { k: 'tracking_no', l: 'Tracking / AWB number', t: 'text' }, { k: 'tracking_url', l: 'Tracking link (optional)', t: 'text' }, { k: 'ship_cost', l: 'What the courier charged you (₹)', t: 'number', h: 'Used for exact profit.' }], { courier: o.courier || '', tracking_no: o.tracking_no || '', tracking_url: o.tracking_url || '', ship_cost: o.ship_cost ?? '' });
  const m = modal(edit ? 'Courier details' : 'Ship order ' + o.number, h('div', null, o.has_battery ? h('div', { class: 'note warn', style: { marginBottom: '10px' } }, 'This parcel has a lithium battery. Use a courier that carries it.') : null, f.el, h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async e => { try { await busy(e.currentTarget, () => api(`/orders/${o.id}/${edit ? '' : 'ship'}`, { method: edit ? 'PATCH' : 'POST', body: f.get() })); m.close(); toast('Saved'); done(); } catch (x) { toast(x.message, true); } } }, edit ? 'Save' : 'Mark shipped'))));
}
function refundModal(o, done) {
  const f = buildForm([{ k: 'amount', l: 'Amount refunded (₹)', t: 'number' }, { k: 'method', l: 'How you paid it back', t: 'text', ph: 'UPI' }, { k: 'ref', l: 'UPI reference / note', t: 'text' }], { amount: o.total, method: 'UPI' });
  const m = modal('Record refund', h('div', null, f.el, h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => { try { await api(`/orders/${o.id}/refund`, { method: 'POST', body: f.get() }); m.close(); toast('Refund recorded'); done(); } catch (x) { toast(x.message, true); } } }, 'Save'))));
}

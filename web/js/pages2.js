import { BOOT, h, $, $$, clear, icon, t, tr, lang, bus, api, money, cart, wish, me, ls, toast, modal, nav, route, setTitle, reveal, sid } from './core.js';
import { productCard, skeletons, lineEl, shipBar, priceNow, syncFromPrice } from './ui.js';
import { faqList } from './pages1.js';

const gwrap = (...k) => h('div', { class: 'wrap gpage', style: { paddingTop: '28px', paddingBottom: '20px' } }, h('i', { class: 'g-orb a' }), h('i', { class: 'g-orb b' }), ...k);
const wrap = (...k) => h('div', { class: 'wrap', style: { paddingTop: '28px', paddingBottom: '20px' } }, ...k);
const field = (label, input, err) => h('label', { class: 'field' }, h('span', null, label), input, err);
const busy = async (btn, fn) => { btn.classList.add('is-busy'); try { return await fn(); } finally { btn.classList.remove('is-busy'); } };

/* ================= CART PAGE ================= */
route(/^\/cart$/, async view => {
  setTitle(t('cart'));
  const box = h('div'); view.append(wrap(h('h1', { class: 'h1', style: { fontSize: 'clamp(1.8rem,5vw,2.8rem)', marginBottom: '20px' } }, t('cart')), box));
  let coupon = ls.get('sy_coupon', '');
  async function refresh() {
    clear(box);
    if (!cart.items.length) { box.append(h('div', { class: 'empty' }, icon('bag'), h('h3', null, t('empty_cart')), h('p', { style: { marginTop: '16px' } }, h('a', { class: 'btn', href: '/shop' }, t('continue'))))); return; }
    box.append(skeletons(1));
    const p = await priceNow({ coupon }); syncFromPrice(p); clear(box);
    const inp = h('input', { class: 'inp', placeholder: t('coupon'), value: coupon, 'aria-label': t('coupon') });
    const msg = h('div', { class: 'small', style: { marginTop: '6px', color: p.coupon && p.coupon.ok ? 'var(--ok)' : 'var(--err)' } }, coupon && p.coupon ? (p.coupon.ok ? `${p.coupon.code} applied` : p.coupon.message) : '');
    box.append(h('div', { class: 'co' }, h('div', null, shipBar(p), ...p.lines.map(l => lineEl(l, refresh))),
      h('aside', { class: 'card stack' }, h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('div', { class: 'grow' }, inp), h('button', { class: 'btn ghost', onclick: () => { coupon = inp.value.trim(); ls.set('sy_coupon', coupon); refresh(); } }, t('apply'))), msg,
        totals(p), h('a', { class: 'btn block', href: '/checkout' }, `${t('checkout')}`), h('a', { class: 'link center small', href: '/shop' }, t('continue')))));
  }
  bus.on('cart', function once() { if (!view.isConnected) bus.off('cart', once); });
  await refresh();
});
function totals(p, method) {
  return h('div', { class: 'tot' }, h('div', null, h('span', null, t('subtotal')), h('span', null, money(p.subtotal))), p.discount ? h('div', { class: 'g' }, h('span', null, `${t('coupon')} ${p.coupon && p.coupon.code || ''}`), h('span', null, '−' + money(p.discount))) : null,
    h('div', null, h('span', null, t('shipping')), h('span', null, p.shipping + p.packaging ? money(p.shipping + p.packaging) : t('free'))), p.gift_fee ? h('div', null, h('span', null, t('gift')), h('span', null, money(p.gift_fee))) : null, p.cod_fee ? h('div', null, h('span', null, 'COD fee'), h('span', null, money(p.cod_fee))) : null,
    p.gst && p.gst.enabled && p.gst.amount ? h('div', { class: 'muted small' }, h('span', null, 'GST included'), h('span', null, money(p.gst.amount))) : null,
    h('div', { class: 'big' }, h('span', null, t('total')), h('span', null, money(p.total))), p.savings > 0 ? h('div', { class: 'g small' }, h('span', null, 'You save'), h('span', null, money(p.savings))) : null);
}

/* ================= CHECKOUT ================= */
route(/^\/checkout$/, async view => {
  setTitle(t('checkout'));
  if (!cart.items.length) { view.append(wrap(h('div', { class: 'empty' }, icon('bag'), h('h3', null, t('empty_cart')), h('p', { style: { marginTop: '16px' } }, h('a', { class: 'btn', href: '/shop' }, t('continue')))))); return; }
  const saved = ls.get('sy_addr', {});
  const F = { name: saved.name || (me.customer && me.customer.name) || '', phone: saved.phone || (me.customer && me.customer.phone) || '', email: saved.email || (me.customer && me.customer.email) || '', line1: saved.line1 || '', line2: saved.line2 || '', pincode: saved.pincode || ls.get('sy_pin', ''), city: saved.city || '', state: saved.state || '', method: BOOT.payments.upi ? 'upi' : 'cod', gift: false, gift_message: '', note: '', terms: false, safety: false, marketing: false, save_address: true };
  let step = 1, price = null, coupon = ls.get('sy_coupon', '');
  const body = h('div'), side = h('aside', { class: 'card stack' }), stepsEl = h('div', { class: 'steps' });
  view.append(wrap(h('h1', { class: 'h1', style: { fontSize: 'clamp(1.8rem,5vw,2.8rem)', marginBottom: '20px' } }, t('checkout')), stepsEl, h('div', { class: 'co' }, body, side)));
  const errs = {};
  async function reprice() {
    try { price = await priceNow({ coupon, pincode: /^\d{6}$/.test(F.pincode) ? F.pincode : undefined, method: F.method, gift: F.gift, email: F.email, phone: F.phone }); } catch (e) { toast(e.message, { err: true }); return; }
    syncFromPrice(price);
    if (!cart.items.length) return nav('/cart');
    clear(side).append(h('b', null, t('review')), ...price.lines.map(l => h('div', { class: 'row', style: { flexWrap: 'nowrap', gap: '10px' } }, l.image ? h('img', { src: l.image, alt: '', width: 48, height: 48, style: { width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover' } }) : null, h('div', { class: 'grow small' }, (lang() === 'hi' && l.name_hi) || l.name, h('span', { class: 'muted' }, ` × ${l.qty}`)), h('b', { class: 'small' }, money(l.line_total)))), totals(price),
      price.pincode && !price.pincode.ok ? h('p', { class: 'err-text' }, price.pincode.message) : price.pincode && price.pincode.ok ? h('p', { class: 'small', style: { color: 'var(--ok)' } }, `${t('delivery_by')} ${price.pincode.eta.text}`) : null);
    if (step === 2) paintPay();
  }
  const paintSteps = () => { clear(stepsEl); ['contact', 'payment', 'review'].forEach((k, i) => stepsEl.append(h('div', { class: i + 1 === step ? 'on' : i + 1 < step ? 'done' : '' }, `${i + 1}. ${t(k === 'contact' ? 'delivery' : k)}`))); };
  const inp = (key, label, props = {}) => { const el = h('input', { class: 'inp' + (errs[key] ? ' bad' : ''), value: F[key], 'aria-label': label, oninput: e => { F[key] = e.target.value; }, ...props }); return field(label, el, errs[key] ? h('div', { class: 'err-text' }, errs[key]) : null); };
  function stepContact() {
    paintSteps(); clear(body);
    const addrBtns = h('div', { class: 'row' });
    if (me.customer) api('/account/addresses').then(list => { list.slice(0, 3).forEach(a => addrBtns.append(h('button', { class: 'chip', onclick: () => { Object.assign(F, { name: a.name, phone: a.phone, line1: a.line1, line2: a.landmark || '', pincode: a.pincode, city: a.city, state: a.state }); stepContact(); reprice(); } }, `${a.label || a.name}, ${a.pincode}`))); }).catch(() => {});
    body.append(h('div', { class: 'card stack' }, h('h3', null, t('contact')), addrBtns,
      h('div', { class: 'grid2' }, inp('name', t('name'), { autocomplete: 'name' }), inp('phone', t('phone'), { inputmode: 'numeric', maxlength: 10, autocomplete: 'tel-national' })), inp('email', t('email'), { type: 'email', autocomplete: 'email' }),
      h('h3', { style: { marginTop: '8px' } }, t('delivery')), inp('line1', t('addr1'), { autocomplete: 'address-line1' }), inp('line2', t('addr2')),
      h('div', { class: 'grid2' }, inp('pincode', t('pincode'), { inputmode: 'numeric', maxlength: 6, autocomplete: 'postal-code', onchange: async e => { F.pincode = e.target.value.trim(); await reprice(); if (/^\d{6}$/.test(F.pincode) && !F.city) lookupPin(); } }), inp('city', t('city'), { autocomplete: 'address-level2' })), inp('state', t('state'), { autocomplete: 'address-level1' }),
      h('button', { class: 'btn block', onclick: () => { if (validate()) { step = 2; stepPay(); } } }, t('next'))));
  }
  async function lookupPin() { /* city/state are typed by the customer; no third-party lookup is used */ }
  function validate() {
    for (const k of Object.keys(errs)) delete errs[k];
    const ph = F.phone.replace(/\D/g, '').slice(-10);
    if (F.name.trim().length < 2) errs.name = 'Enter your full name'; if (!/^[6-9]\d{9}$/.test(ph)) errs.phone = 'Enter a valid 10-digit mobile number'; if (F.email && !/^\S+@\S+\.\S+$/.test(F.email)) errs.email = 'Enter a valid email';
    if (F.line1.trim().length < 5) errs.line1 = 'Enter your house / street address'; if (!/^[1-9]\d{5}$/.test(F.pincode)) errs.pincode = 'Enter a valid 6-digit pincode'; if (F.city.trim().length < 2) errs.city = 'Enter your city'; if (F.state.trim().length < 2) errs.state = 'Enter your state';
    if (Object.keys(errs).length) { stepContact(); const first = $('.inp.bad'); first && first.focus(); return false; }
    F.phone = ph; ls.set('sy_addr', { name: F.name, phone: F.phone, email: F.email, line1: F.line1, line2: F.line2, pincode: F.pincode, city: F.city, state: F.state }); ls.set('sy_pin', F.pincode); return true;
  }
  function paintPay() {
    const box = $('#paybox'); if (!box || !price) return; clear(box);
    const cod = price.cod, upiOk = price.upi_ok && BOOT.payments.upi;
    const pm = (id, ok, title, sub, extra) => h('label', { class: 'pm' + (F.method === id ? ' on' : '') + (!ok ? ' off' : '') }, h('input', { type: 'radio', name: 'pm', checked: F.method === id, disabled: !ok, onchange: () => { F.method = id; reprice().then(paintPay); } }), h('div', { class: 'grow' }, h('b', null, title), h('div', { class: 'muted small' }, sub)), extra);
    box.append(pm('upi', upiOk, t('upi'), upiOk ? 'GPay, PhonePe, Paytm or any UPI app. Order is confirmed after we check your payment.' : 'UPI is not available right now.'),
      pm('cod', cod.ok, t('cod'), cod.ok ? (cod.advance > 0 ? `Pay ${money(cod.advance)} now by UPI to confirm your order. The rest is paid when your parcel arrives.` : 'Pay when your parcel arrives.') : cod.message, cod.ok && price.cod.fee ? h('b', null, '+' + money(price.cod.fee)) : null));
    if (F.method === 'cod' && !cod.ok) F.method = upiOk ? 'upi' : 'cod';
  }
  function stepPay() {
    paintSteps(); clear(body); reprice();
    const gift = BOOT.shipping.gift_enabled ? h('div', { class: 'stack' }, h('label', { class: 'check sw' }, h('input', { type: 'checkbox', role: 'switch', checked: F.gift, onchange: e => { F.gift = e.target.checked; gm.classList.toggle('hide', !F.gift); reprice(); } }), `${t('gift')} (+${money(BOOT.shipping.gift_price)})`)) : null;
    const gm = h('textarea', { class: 'inp' + (F.gift ? '' : ' hide'), maxlength: 200, placeholder: 'Gift message (optional)', value: F.gift_message, oninput: e => { F.gift_message = e.target.value; } }); gm.value = F.gift_message;
    const cin = h('input', { class: 'inp', placeholder: t('coupon'), value: coupon, 'aria-label': t('coupon') }), cmsg = h('div', { class: 'small' });
    const applyC = async () => { coupon = cin.value.trim(); ls.set('sy_coupon', coupon); await reprice(); if (coupon && price.coupon) { cmsg.style.color = price.coupon.ok ? 'var(--ok)' : 'var(--err)'; cmsg.textContent = price.coupon.ok ? `${price.coupon.code} applied` : price.coupon.message; } else cmsg.textContent = ''; };
    body.append(h('div', { class: 'card stack' }, h('h3', null, t('payment')), h('div', { class: 'stack', id: 'paybox' }), h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('div', { class: 'grow' }, cin), h('button', { class: 'btn ghost', onclick: applyC }, t('apply'))), cmsg, gift, gm, field('Order note (optional)', h('input', { class: 'inp', maxlength: 300, value: F.note, oninput: e => { F.note = e.target.value; } })),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => { step = 1; stepContact(); } }, t('back')), h('button', { class: 'btn grow', onclick: () => { if (!price || (price.errors && price.errors.length)) return toast((price && price.errors[0]) || '…', { err: true }); step = 3; stepReview(); } }, t('next')))));
    paintPay();
  }
  function stepReview() {
    paintSteps(); clear(body);
    const pol = (s, label) => h('a', { class: 'link', href: `/policy/${s}`, target: '_blank', rel: 'noopener' }, label);
    const termsErr = h('div', { class: 'err-text hide' }), btn = h('button', { class: 'btn block', onclick: async () => {
      F.terms = true;
      if (price.needs_safety_ack && !F.safety) { toast('Please confirm the safety instructions.', { err: true }); return; }
      try { await busy(btn, async () => {
        const r = await api('/orders', { method: 'POST', body: { items: cart.payload(), coupon, method: F.method, gift: F.gift, gift_message: F.gift_message, note: F.note, lang: lang(), email: F.email || undefined, save_address: !!me.customer, address: { name: F.name, phone: F.phone, line1: F.line1, line2: F.line2, landmark: F.line2, pincode: F.pincode, city: F.city, state: F.state }, consents: { terms: true, safety: F.safety, marketing: !!(me.customer && me.customer.marketing_optin) } } });
        cart.clear(); ls.del('sy_coupon'); ls.set('sy_last_order', { n: r.number, t: r.token });
        nav(`/order/${r.number}?t=${r.token}&new=1`);
      }); } catch (e) { toast(e.message, { err: true }); if (e.data && e.data.out_of_stock) { step = 1; reprice(); } }
    } }, `${t('place')} · ${money(price.total)}`);
    const a = F;
    body.append(h('div', { class: 'card stack' }, h('h3', null, t('review')),
      h('div', { class: 'row between', style: { alignItems: 'start' } }, h('div', { class: 'small' }, h('b', null, a.name), h('br'), a.line1, a.line2 ? ', ' + a.line2 : '', h('br'), `${a.city}, ${a.state} - ${a.pincode}`, h('br'), a.phone), h('button', { class: 'link', style: { background: 'none', border: 0, cursor: 'pointer' }, onclick: () => { step = 1; stepContact(); } }, 'Edit')),
      h('div', { class: 'row between' }, h('span', null, F.method === 'cod' ? t('cod') : t('upi')), h('button', { class: 'link', style: { background: 'none', border: 0, cursor: 'pointer' }, onclick: () => { step = 2; stepPay(); } }, 'Edit')),
      price.has_battery ? h('div', { class: 'box-note warn' }, icon('warn'), h('span', null, price.battery_notice)) : null,
      price.needs_safety_ack || price.has_battery ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: F.safety, onchange: e => { F.safety = e.target.checked; } }), h('span', null, t('safety_ok'), ' (', pol('safety', 'Safety'), ').')) : null,
      h('p', { class: 'muted small' }, `Easy ${BOOT.returns.window_days || 7}-day replacement on damaged or defective items.`),
      h('p', { class: 'muted small co-fine' }, 'By placing the order you agree to our ', pol('terms', 'Terms'), ', ', pol('privacy', 'Privacy Policy'), ' and ', pol('returns', 'Return Policy'), '.'),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => { step = 2; stepPay(); } }, t('back'))), btn));
  }
  // polyfill small helper: pol(slug) returns an <a> factory
  stepContact(); await reprice();
});

/* ================= ORDER PAGE ================= */

/* an order line: photo, name, qty x price; clicking opens the product page (only while it is on sale) */
const itemRow = i => {
  const img = i.image_url ? h('img', { class: 'oi-img', src: i.image_url, alt: '', width: 56, height: 56, loading: 'lazy' }) : h('div', { class: 'oi-img ph' });
  const parts = [img, h('div', { class: 'oi-body' }, h('div', { class: 'oi-name' }, i.name), i.variant_name ? h('div', { class: 'muted small' }, i.variant_name) : null, h('div', { class: 'muted small' }, `Qty ${i.qty} × ${money(i.price)}`)), h('b', { class: 'small' }, money(i.price * i.qty))];
  return i.slug ? h('a', { class: 'oi link', href: `/p/${i.slug}`, title: 'Open product' }, ...parts) : h('div', { class: 'oi' }, ...parts);
};
const STEPS = [['placed', 'Order placed'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered']];
route(/^\/order\/([A-Za-z0-9-]+)$/, async (view, m, q) => {
  const num = m[1].toUpperCase(), tok = q.get('t') || (ls.get('sy_last_order') || {}).t || '';
  setTitle('Order ' + num);
  let timerId; const box = h('div'); view.append(wrap(box));
  const gone = new MutationObserver(() => { if (!view.isConnected) { clearInterval(timerId); gone.disconnect(); } }); gone.observe(document.body, { childList: true, subtree: true });
  async function load() {
    let r;
    try { r = await api(`/orders/${num}?t=${encodeURIComponent(tok)}`); } catch (e) { clear(box).append(h('div', { class: 'empty' }, icon('box'), h('h2', null, 'Order not found'), h('p', { class: 'muted' }, e.message), h('p', { style: { marginTop: '16px' } }, h('a', { class: 'btn', href: '/track' }, t('track'))))); return; }
    paint(r.order, r.token);
  }
  async function paint(o, token) {
    clear(box); clearInterval(timerId);
    const isNew = q.get('new') === '1'; if (isNew) { history.replaceState({}, '', `/order/${num}?t=${token}`); q.delete('new'); }
    const cancelled = o.status === 'cancelled', idx = STEPS.findIndex(s => s[0] === (o.status === 'payment_pending' || o.status === 'cod_confirm' ? 'placed' : o.status));
    const needsPay = (o.payment_method === 'upi' || o.advance > 0) && o.status === 'payment_pending';
    const unpaid = needsPay;
    const head = h('div', { class: 'center stack' }, isNew && !cancelled && !unpaid ? successMark() : null, h('h1', { style: { fontSize: 'clamp(1.6rem,4vw,2.4rem)' } }, cancelled ? 'Order cancelled' : unpaid ? (o.payment_status === 'submitted' ? 'Payment being checked' : (o.advance > 0 ? `Pay ${money(o.pay_now)} to confirm your order` : 'Almost done: complete your payment')) : isNew ? 'Thank you!' : `Order ${o.number}`), h('p', { class: 'muted' }, `${o.number} · ${new Date(o.placed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`));
    if (isNew && !cancelled && !unpaid) confetti();
    box.append(head);
    // payment panel
    if (needsPay) await upiPanel(o, token);
    else if (o.status === 'cod_confirm') box.append(h('div', { class: 'card box-note', style: { marginTop: '22px' } }, icon('info'), h('span', null, 'Your order is placed. We may call you to confirm it before packing. Please keep your phone nearby.')));
    // timeline
    box.append(h('div', { class: 'co', style: { marginTop: '24px' } }, h('div', { class: 'stack-lg' },
      !cancelled ? h('div', { class: 'card' }, h('ul', { class: 'tl' }, STEPS.map((s, i) => h('li', { class: i < idx ? 'done' : i === idx ? 'done now' : '' }, (i === 0 && unpaid ? 'Waiting for payment' : s[1]), o.events.filter(e => e.status === s[0]).slice(-1).map(e => h('div', { class: 'small muted' }, new Date(e.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))))))) : h('div', { class: 'card box-note warn' }, icon('warn'), h('span', null, o.cancel_reason || 'This order was cancelled.')),
      o.courier || o.tracking_no ? h('div', { class: 'card' }, h('b', null, 'Courier'), h('p', null, `${o.courier || ''} ${o.tracking_no || ''}`), o.tracking_url ? h('a', { class: 'btn sm', href: o.tracking_url, target: '_blank', rel: 'noopener' }, 'Track parcel') : null) : null,
      needsPay && o.payment_status === 'submitted' ? h('div', { class: 'card box-note' }, icon('info'), h('span', null, `We received your transaction ID ${o.utr}. We are checking your payment.`)) : null,
      o.advance > 0 && o.advance_status === 'verified' && !['cancelled', 'delivered', 'returned'].includes(o.status) ? h('div', { class: 'card box-note' }, icon('info'), h('span', null, `We received your advance of ${money(o.advance)}. Please keep ${money(o.due_on_delivery)} ready to pay when your parcel arrives.`)) : null,
      o.advance > 0 && o.advance_status === 'refund_due' ? h('div', { class: 'card box-note' }, icon('info'), h('span', null, `This order was cancelled. Your advance of ${money(o.advance)} will be sent back to you.`)) : null,
      actions(o, token)),
      h('aside', { class: 'card stack' }, h('b', null, 'Items'), ...o.items.map(itemRow),
        totals({ subtotal: o.subtotal, discount: o.discount, coupon: { code: o.coupon_code }, shipping: o.shipping, packaging: 0, gift_fee: o.gift_fee, cod_fee: o.cod_fee, total: o.total, gst: { enabled: false } }),
        h('div', { class: 'small muted' }, h('b', null, 'Delivering to'), h('br'), o.address.name, h('br'), `${o.address.line1}, ${o.address.city}, ${o.address.state} - ${o.address.pincode}`), h('div', { class: 'small muted' }, `Payment: ${o.payment_method === 'cod' ? t('cod') : t('upi')}`),
        h('a', { class: 'btn ghost sm', href: '/contact?order=' + o.number }, 'Need help?'))));
    if (!['cancelled', 'delivered'].includes(o.status) && !needsPay) setTimeout(() => view.isConnected && load(), 60000);
  }
  function actions(o, token) {
    const out = h('div', { class: 'stack' });
    if (['placed', 'payment_pending', 'cod_confirm', 'confirmed'].includes(o.status)) out.append(h('button', { class: 'btn ghost', onclick: async e => { if (!confirm('Cancel this order?')) return; try { await busy(e.currentTarget, () => api(`/orders/${o.number}/cancel?t=${token}`, { method: 'POST', body: { reason: 'Cancelled by customer' } })); toast('Order cancelled'); load(); } catch (x) { toast(x.message, { err: true }); } } }, t('cancel_order')));
    if (o.can_request) out.append(h('button', { class: 'btn', onclick: () => requestForm(o, token) }, t('request')));
    for (const r of o.requests || []) out.append(h('div', { class: 'card small' }, h('b', null, r.type === 'refund' ? 'Refund request' : 'Replacement request'), ` · ${r.status}`, h('div', { class: 'muted' }, r.reason)));
    if (o.status === 'delivered') out.append(h('p', { class: 'muted small' }, `Damaged or defective? You can ask for a replacement or refund within ${o.return_window_days} days of delivery.`));
    return out;
  }
  function requestForm(o, token) {
    const type = h('select', { class: 'inp' }, h('option', { value: 'replace' }, 'Replacement'), h('option', { value: 'refund' }, 'Refund')), reason = h('textarea', { class: 'inp', placeholder: 'What is wrong? (damaged, not working, wrong item…)', maxlength: 800 }), files = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'inp' });
    const m = modal(h('div', { class: 'stack' }, h('h3', null, t('request')), h('p', { class: 'muted small' }, 'Add clear photos. An unboxing video link can be written in the message.'), type, reason, files, h('button', { class: 'btn', onclick: async e => { const f = new FormData(); f.append('type', type.value); f.append('reason', reason.value); [...files.files].slice(0, 3).forEach(x => f.append('photos', x)); try { const r = await busy(e.currentTarget, () => api(`/orders/${o.number}/request?t=${token}`, { method: 'POST', form: f })); m.close(); toast(r.message); load(); } catch (x) { toast(x.message, { err: true }); } } }, t('send'))));
  }
  async function upiPanel(o, token) {
    let pay; try { pay = await api(`/orders/${o.number}/pay?t=${token}`); } catch (e) { box.append(h('div', { class: 'card box-note warn' }, icon('warn'), h('span', null, e.message))); return; }
    const timer = h('div', { class: 'timer' }), left = () => Math.max(0, new Date(pay.pay_by).getTime() - Date.now());
    const tick = () => { const s = Math.floor(left() / 1000); timer.textContent = s > 0 ? `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : 'Please pay as soon as possible'; timer.classList.toggle('low', s < 120); }; tick(); timerId = setInterval(tick, 1000);
    const utr = h('input', { class: 'inp', placeholder: t('utr'), maxlength: 24, 'aria-label': t('utr'), autocapitalize: 'characters', value: o.payment_status === 'rejected' ? '' : (o.utr || '') }), shot = pay.screenshot ? h('input', { type: 'file', accept: 'image/*', class: 'inp', 'aria-label': 'Payment screenshot (optional)' }) : null;
    const sub = h('button', { class: 'btn block', onclick: async e => { const f = new FormData(); f.append('utr', utr.value.trim()); if (shot && shot.files[0]) f.append('screenshot', shot.files[0]); try { const r = await busy(e.currentTarget, () => api(`/orders/${o.number}/utr?t=${token}`, { method: 'POST', form: f })); toast(r.message); load(); } catch (x) { toast(x.message, { err: true }); } } }, t('have_paid'));
    box.append(h('div', { class: 'card upi-box', style: { marginTop: '22px' } }, h('h3', null, `${t('pay_now')} ${money(pay.amount)}`), pay.advance ? h('div', { class: 'box-note' }, icon('info'), h('span', null, `This is the advance for your cash-on-delivery order. After we check it, your order is confirmed and you pay ${money(pay.advance.due_on_delivery)} when the parcel arrives. ${pay.advance.note || ''}`)) : null, pay.advance && pay.amount !== pay.advance.amount ? h('p', { class: 'small muted', style: { margin: '0' } }, `Please pay exactly ${money(pay.amount)}. It counts as your full ${money(pay.advance.amount)} advance. The exact amount helps us confirm your payment faster.`) : null, o.payment_status === 'rejected' ? h('div', { class: 'box-note warn' }, icon('warn'), h('span', null, 'We could not find that payment. Please send the correct transaction ID.')) : null,
      pay.adjust ? h('p', { class: 'small muted', style: { margin: '0' } }, `Please pay exactly ${money(pay.amount)} (we took ${money(pay.adjust)} off your total). The exact amount helps us confirm your payment faster.`) : null, h('div', { class: 'muted small' }, 'Time left to pay'), timer, h('img', { src: pay.qr, alt: 'UPI QR code', width: 240, height: 240 }), h('a', { class: 'btn', href: pay.link }, 'Open UPI app'),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('span', { class: 'muted small' }, 'UPI ID'), h('button', { class: 'copy', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(pay.upi_id).then(() => toast(t('copied'))).catch(() => {}); } }, pay.upi_id, ' ⧉')),
      h('div', { class: 'stack', style: { width: '100%', maxWidth: '420px', textAlign: 'left' } }, h('p', { class: 'small muted' }, 'After paying, enter the transaction ID (UTR) from your UPI app. It is 12 digits or letters.'), utr, shot ? field('Payment screenshot (optional)', shot) : null, sub)));
  }
  await load();
});
function successMark() { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 92 92'); s.setAttribute('class', 'okmark'); s.innerHTML = '<circle cx="46" cy="46" r="41"/><path d="M27 48l13 13 25-29"/>'; return s; }
function confetti() {
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const c = h('div', { class: 'confetti', 'aria-hidden': 'true' }), colors = ['#e8a92b', '#1f8a4c', '#3b5bdb', '#d6336c', '#1d1d1f'];
  for (let i = 0; i < 46; i++) c.append(h('i', { style: { left: Math.random() * 100 + '%', background: colors[i % colors.length], animationDuration: 1.8 + Math.random() * 1.8 + 's', animationDelay: Math.random() * .5 + 's', '--dx': (Math.random() * 160 - 80) + 'px' } }));
  document.body.append(c); setTimeout(() => c.remove(), 4500);
}

/* ================= TRACK ================= */
/* ---------- glass segmented tabs (sliding pill) ---------- */
function segTabs(items, active, onPick) {
  const pill = h('span', { class: 'seg-pill', 'aria-hidden': 'true' });
  const btns = items.map(([k, l]) => h('button', { class: 'seg-b' + (k === active ? ' on' : ''), type: 'button', 'data-k': k, onclick: () => pick(k) }, l));
  const el = h('div', { class: 'seg', role: 'tablist' }, pill, ...btns);
  const place = animate => { const b = btns.find(x => x.classList.contains('on')); if (!b || !el.isConnected) return; if (!animate) pill.style.transition = 'none'; pill.style.width = b.offsetWidth + 'px'; pill.style.transform = `translateX(${b.offsetLeft}px)`; if (!animate) { void pill.offsetWidth; pill.style.transition = ''; } b.scrollIntoView && el.scrollTo && el.scrollTo({ left: Math.max(0, b.offsetLeft - 20), behavior: 'smooth' }); };
  const pick = k => { btns.forEach(x => x.classList.toggle('on', x.dataset.k === k)); place(true); history.replaceState({}, '', location.pathname + location.search + (k === items[0][0] ? '' : '#' + k)); onPick(k); };
  requestAnimationFrame(() => requestAnimationFrame(() => place(false))); window.addEventListener('resize', () => place(false));
  el.pick = pick; return el;
}
const pageHead = (title, sub, extra) => h('div', { class: 'pg-head' }, h('div', null, h('h1', null, title), sub ? h('p', { class: 'muted' }, sub) : null), extra || null);
const swap = (body, node) => { clear(body).append(node); body.classList.remove('swap-in'); void body.offsetWidth; body.classList.add('swap-in'); };

function trackCard(q) {
  const last = ls.get('sy_last_order') || {};
  const n = h('input', { class: 'inp', placeholder: 'SY-000000-XXXX', value: (q && q.get('order')) || last.n || '', autocapitalize: 'characters' }), ph = h('input', { class: 'inp', inputmode: 'numeric', maxlength: 10, placeholder: t('phone'), value: (ls.get('sy_addr') || {}).phone || (me.customer && me.customer.phone) || '' });
  return h('div', { class: 'card stack glass-card', style: { maxWidth: '480px' } }, h('h3', null, t('track')), h('p', { class: 'muted small' }, 'Enter your order number and the mobile number used for the order.'), field(t('order_no'), n), field(t('phone'), ph),
    h('button', { class: 'btn', onclick: async e => { try { const r = await busy(e.currentTarget, () => api('/track', { method: 'POST', body: { number: n.value, phone: ph.value } })); nav(`/order/${r.order.number}?t=${r.token}`); } catch (x) { toast(x.message, { err: true }); } } }, t('find')));
}
const ordersList = list => list.length ? h('div', { class: 'stack' }, list.map(o => h('div', { class: 'card ocard glass-card' }, h('a', { class: 'row between ohead', href: `/order/${o.number}?t=${o.token}`, style: { textDecoration: 'none' } }, h('div', null, h('b', null, o.number), h('div', { class: 'muted small' }, new Date(o.placed_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }))), h('div', { style: { textAlign: 'right' } }, h('b', null, money(o.total)), h('div', { class: 'badge soft st-' + o.status }, o.status.replace(/_/g, ' ')))), h('div', { class: 'oitems' }, o.items.map(itemRow))))) : h('div', { class: 'empty' }, icon('box'), h('p', null, 'No orders yet.'));

/* /orders : My orders + Track order tabs (guests only see Track) */
async function ordersPage(view, q, forceTrack) {
  setTitle(t('orders'));
  const body = h('div', { class: 'seg-body' }); let tab = forceTrack || location.hash === '#track' || !me.customer ? 'track' : 'orders';
  const show = async k => { if (k === 'track') return swap(body, trackCard(q)); swap(body, skeletons(1)); try { swap(body, ordersList(await api('/account/orders'))); } catch (e) { swap(body, h('p', { class: 'muted' }, e.message)); } };
  const items = me.customer ? [['orders', 'My orders'], ['track', 'Track order']] : [['track', 'Track order']];
  view.append(gwrap(pageHead('Orders', me.customer ? 'Your orders and tracking in one place.' : 'Track your order. Log in to see all your orders.', me.customer ? null : h('a', { class: 'btn ghost sm', href: '/login' }, 'Log in')), segTabs(items, tab, show), body)); show(tab);
}
route(/^\/orders$/, async (view, m, q) => ordersPage(view, q));
route(/^\/track$/, async (view, m, q) => ordersPage(view, q, true));

/* /wishlist */
route(/^\/wishlist$/, async view => {
  setTitle(t('wishlist')); if (!me.customer) return loginView(view);
  const body = h('div', { class: 'seg-body swap-in' }, skeletons(1)); view.append(gwrap(pageHead('Wishlist', 'Products you saved for later.'), body));
  try { const list = await api('/account/wishlist'); swap(body, list.length ? h('div', { class: 'pgrid' }, list.map(p => productCard(p))) : h('div', { class: 'empty' }, icon('heart'), h('p', null, 'Nothing saved yet.'))); } catch (e) { swap(body, h('p', { class: 'muted' }, e.message)); }
});

/* /account and /login: log in, or send a logged-in person to the right page */
route(/^\/(account|login)$/, async view => {
  if (!me.customer) { setTitle(t('account')); return loginView(view); }
  const hs = location.hash.slice(1); const to = hs === 'wishlist' ? '/wishlist' : hs === 'profile' || hs === 'addresses' ? '/profile' + (hs === 'addresses' ? '#addresses' : '') : '/orders';
  nav(to, true);
});

/* /profile : Profile + Addresses tabs */
route(/^\/profile$/, async view => {
  setTitle(t('profile')); if (!me.customer) return loginView(view);
  const body = h('div', { class: 'seg-body' });
  const logout = h('button', { class: 'btn ghost sm', onclick: async () => { await api('/auth/logout', { method: 'POST' }); me.customer = null; ls.del('sy_wish'); wish.ids.clear(); location.href = '/'; } }, t('logout'));
  const show = async k => {
    if (k === 'addresses') addresses();
    else { profile(); }
  };
  const first = me.customer.first_name || (me.customer.name || '').split(' ')[0] || '';
  view.append(gwrap(pageHead(first ? `Hi ${first}` : 'Profile', me.customer.email, logout), segTabs([['profile', 'Profile'], ['addresses', 'Addresses']], location.hash === '#addresses' ? 'addresses' : 'profile', show), body));
  function profile() {
    const c = me.customer, val = { fn: c.first_name || '', ln: c.last_name || '', ph: c.phone || '', mk: !!c.marketing_optin };
    const fn = h('input', { class: 'inp', value: val.fn }), ln = h('input', { class: 'inp', value: val.ln }), phone = h('input', { class: 'inp', value: val.ph, inputmode: 'numeric', maxlength: 10 });
    const mk = h('input', { type: 'checkbox', role: 'switch', checked: val.mk });
    const old = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password' }), np = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' });
    const saveBtn = h('button', { class: 'btn sv-btn', disabled: true }, t('save')), cancelBtn = h('button', { class: 'btn ghost sm sv-cancel', disabled: true }, 'Undo'), hint = h('span', { class: 'sv-hint' }, 'No changes yet');
    const dirty = () => fn.value !== val.fn || ln.value !== val.ln || phone.value !== val.ph || mk.checked !== val.mk;
    const check = () => { const d = dirty(); saveBtn.disabled = !d; cancelBtn.disabled = !d; bar.classList.toggle('dirty', d); hint.textContent = d ? 'You have unsaved changes' : 'No changes yet'; };
    [fn, ln, phone].forEach(x => x.addEventListener('input', check)); mk.addEventListener('change', check);
    cancelBtn.addEventListener('click', () => { fn.value = val.fn; ln.value = val.ln; phone.value = val.ph; mk.checked = val.mk; check(); });
    saveBtn.addEventListener('click', async () => { try { const r = await busy(saveBtn, () => api('/account/me', { method: 'PATCH', body: { first_name: fn.value, last_name: ln.value, phone: phone.value, marketing_optin: mk.checked, complete: true } })); me.customer = r.customer; val.fn = fn.value; val.ln = ln.value; val.ph = phone.value; val.mk = mk.checked; check(); toast('Saved'); } catch (x) { toast(x.message, { err: true }); } });
    const bar = h('div', { class: 'savebar' }, hint, h('div', { class: 'row', style: { gap: '8px' } }, cancelBtn, saveBtn));
    swap(body, h('div', { class: 'co' }, h('div', { class: 'stack-lg' },
      h('div', { class: 'card stack glass-card' }, h('h3', null, t('profile')), h('div', { class: 'fl-two' }, field('First name', fn), field('Last name', ln)), field(t('phone'), phone), h('p', { class: 'muted small' }, 'Email: ' + c.email), h('label', { class: 'check sw' }, mk, h('span', null, t('marketing_ok')))),
      h('div', { class: 'card stack glass-card' }, h('h3', null, c.has_password ? 'Change password' : 'Set a password (optional)'), h('p', { class: 'muted small' }, c.has_password ? 'We will email you a confirmation when it changes.' : 'You can log in with an email code anyway. A password is optional.'), c.has_password ? field('Current password', old) : null, field('New password (8+ characters)', np), h('button', { class: 'btn ghost', onclick: async e => { try { await busy(e.currentTarget, () => api('/account/password', { method: 'POST', body: { old: old.value, password: np.value } })); toast('Password changed. We emailed you a confirmation.'); me.customer.has_password = true; old.value = np.value = ''; } catch (x) { toast(x.message, { err: true }); } } }, 'Change password')),
      h('div', { class: 'card stack glass-card' }, h('h3', null, 'Your data'), h('p', { class: 'muted small' }, 'Download what we hold about you, or delete your account. Order records needed for tax and law are kept without your login.'), h('a', { class: 'btn ghost', href: '/api/account/export', download: 'my-data.json' }, 'Download my data'), h('button', { class: 'btn ghost', style: { color: 'var(--err)' }, onclick: () => { const pw = h('input', { class: 'inp', type: c.has_password ? 'password' : 'text', placeholder: c.has_password ? 'Your password' : 'Type DELETE to confirm' }); const m = modal(h('div', { class: 'stack' }, h('h3', null, 'Delete account?'), h('p', { class: 'muted' }, c.has_password ? 'This cannot be undone. Enter your password to confirm.' : 'This cannot be undone. Type the word DELETE below to confirm.'), pw, h('button', { class: 'btn', onclick: async () => { try { const r = await api('/account/delete', { method: 'POST', body: { password: pw.value } }); me.customer = null; m.close(); toast(r.message); nav('/'); } catch (x) { toast(x.message, { err: true }); } } }, 'Delete my account'))); } }, 'Delete account')),
      bar)));
  }
  async function addresses() {
    swap(body, skeletons(1));
    const openForm = a => {
      const v = a || {}, f = {};
      const mk = (k, label, extra) => { f[k] = h('input', Object.assign({ class: 'inp', value: v[k] || '' }, extra || {})); return field(label, f[k]); };
      let m; const save = async btn => { const payload = {}; Object.keys(f).forEach(k => { payload[k] = f[k].value; });
        try { await busy(btn, () => api(a ? '/account/addresses/' + a.id : '/account/addresses', { method: a ? 'PUT' : 'POST', body: payload })); m.close(); toast('Address saved'); addresses(); } catch (x) { toast(x.message, { err: true }); } };
      m = modal(h('div', { class: 'stack' }, h('h3', null, a ? 'Edit address' : 'Add a new address'), mk('name', 'Full name', { autocomplete: 'name', value: v.name || [me.customer.first_name, me.customer.last_name].filter(Boolean).join(' ') }), mk('phone', 'Mobile number', { inputmode: 'numeric', maxlength: 10, value: v.phone || me.customer.phone || '' }), mk('line1', 'House no., street, area'), mk('line2', 'Landmark (optional)'),
        h('div', { class: 'fl-two' }, mk('pincode', 'Pincode', { inputmode: 'numeric', maxlength: 6 }), mk('city', 'City')), mk('state', 'State'), h('button', { class: 'btn', onclick: e => save(e.currentTarget) }, 'Save address')));
    };
    try {
      const list = await api('/account/addresses');
      swap(body, h('div', { class: 'stack' }, h('div', { class: 'row between' }, h('p', { class: 'muted small', style: { margin: 0 } }, list.length ? `${list.length} saved address${list.length > 1 ? 'es' : ''}` : 'No saved address yet'), h('button', { class: 'btn sm', onclick: () => openForm(null) }, '+ Add new address')),
        list.map(a => h('div', { class: 'card glass-card addr' }, h('div', { class: 'small' }, h('div', { class: 'row', style: { gap: '8px' } }, h('b', null, a.name), a.is_default ? h('span', { class: 'badge soft' }, 'Default') : null), h('div', null, `${a.line1}${a.line2 ? ', ' + a.line2 : ''}, ${a.city}, ${a.state} - ${a.pincode}`), h('div', { class: 'muted' }, a.phone)),
          h('div', { class: 'row', style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } }, h('button', { class: 'btn ghost sm', onclick: () => openForm(a) }, 'Edit'), a.is_default ? null : h('button', { class: 'btn ghost sm', onclick: async () => { await api('/account/addresses/' + a.id + '/default', { method: 'POST' }); addresses(); } }, 'Make default'), h('button', { class: 'btn ghost sm', style: { color: 'var(--err)' }, onclick: async () => { await api('/account/addresses/' + a.id, { method: 'DELETE' }); addresses(); } }, t('remove')))))));
    } catch (e) { swap(body, h('p', { class: 'muted' }, e.message)); }
  }
  show(location.hash === '#addresses' ? 'addresses' : 'profile');
});
function loginView(view) {
  // 4 steps: 1 email -> 2 code -> 3 name + mobile -> 4 address (can be skipped). Each step has its own glass card.
  let step = 1, tick = null; const keep = { email: '' };
  const wrapEl = h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-orb o1' }), h('div', { class: 'auth-orb o2' }));
  const card = h('div', { class: 'auth-card' }); const prog = h('div', { class: 'auth-prog' });
  wrapEl.append(h('div', { class: 'auth-col' }, prog, card));
  const finish = () => { nav('/orders', true); location.reload(); };
  const afterAuth = async r => { me.customer = r.customer; await wish.sync(); const c = r.customer; if (!c.first_name || !c.phone) { step = 3; paint(); } else finish(); };
  const bar = () => { clear(prog); for (let k = 1; k <= 4; k++) prog.append(h('i', { class: k < step ? 'done' : k === step ? 'on' : '' })); };
  const head = (title, sub) => h('div', { class: 'auth-head' }, h('div', { class: 'auth-mark' }, icon('user')), h('h2', null, title), sub ? h('p', { class: 'muted' }, sub) : null);
  const fld = (label, input) => h('label', { class: 'fl' }, input, h('span', null, label));
  const mk = (type, ph, extra) => h('input', Object.assign({ class: 'fl-in', type, placeholder: ' ' }, extra || {}));
  const paint = () => {
    clear(card); if (tick) { clearInterval(tick); tick = null; } bar(); card.className = 'auth-card gl' + step; card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    if (step === 1) {
      const email = mk('email', '', { autocomplete: 'email', inputmode: 'email', value: keep.email });
      const send = async btn => { keep.email = email.value.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(keep.email)) return toast('Enter a valid email address.', { err: true });
        try { await busy(btn, () => api('/auth/otp/send', { method: 'POST', body: { email: keep.email } })); step = 2; paint(); } catch (x) { toast(x.message, { err: true }); } };
      card.append(head('Welcome to ' + BOOT.brand.name, 'Log in or create your account with just your email. No password needed.'), fld('Email address', email),
        h('button', { class: 'btn auth-btn', onclick: e => send(e.currentTarget) }, 'Continue'),
        h('p', { class: 'auth-fine' }, 'By continuing you agree to our ', h('a', { class: 'link', href: '/policy/terms', target: '_blank' }, 'Terms'), ' and ', h('a', { class: 'link', href: '/policy/privacy', target: '_blank' }, 'Privacy Policy'), '.'));
      email.addEventListener('keydown', e => { if (e.key === 'Enter') send(card.querySelector('.auth-btn')); }); setTimeout(() => email.focus(), 60);
    } else if (step === 2) {
      const boxes = Array.from({ length: 6 }, () => h('input', { class: 'otp-b', inputmode: 'numeric', maxlength: 1, autocomplete: 'one-time-code' }));
      const row = h('div', { class: 'otp-row' }, boxes); let busyNow = false;
      const value = () => boxes.map(b => b.value).join('');
      const verify = async () => { if (busyNow || value().length !== 6) return; busyNow = true;
        try { afterAuth(await api('/auth/otp/verify', { method: 'POST', body: { email: keep.email, code: value(), terms: true } })); } catch (x) { toast(x.message, { err: true }); boxes.forEach(b => { b.value = ''; }); boxes[0].focus(); busyNow = false; } };
      boxes.forEach((b, k) => {
        b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(-1); if (b.value && boxes[k + 1]) boxes[k + 1].focus(); verify(); });
        b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && boxes[k - 1]) boxes[k - 1].focus(); });
        b.addEventListener('paste', e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (!d) return; e.preventDefault(); d.split('').forEach((c, q) => { boxes[q].value = c; }); (boxes[Math.min(d.length, 5)]).focus(); verify(); });
      });
      const resend = h('button', { class: 'link auth-link', disabled: true }, 'Resend code'); let left = 45;
      const upd = () => { resend.disabled = left > 0; resend.textContent = left > 0 ? `Resend code in ${left}s` : 'Resend code'; }; upd();
      tick = setInterval(() => { if (!card.isConnected) { clearInterval(tick); return; } left = Math.max(0, left - 1); upd(); }, 1000);
      resend.addEventListener('click', async () => { try { await api('/auth/otp/send', { method: 'POST', body: { email: keep.email } }); left = 45; upd(); toast('A new code is on its way.'); } catch (x) { toast(x.message, { err: true }); } });
      card.append(head('Check your email', `We sent a 6-digit code to ${keep.email}. It works for 10 minutes. Check Spam if you do not see it.`), row,
        h('button', { class: 'btn auth-btn', onclick: verify }, 'Verify'), h('div', { class: 'row between' }, resend, h('button', { class: 'link auth-link', onclick: () => { step = 1; paint(); } }, 'Change email')));
      setTimeout(() => boxes[0].focus(), 60);
    } else if (step === 3) {
      const c = me.customer || {};
      const fn = mk('text', '', { autocomplete: 'given-name', value: c.first_name || '' }), ln = mk('text', '', { autocomplete: 'family-name', value: c.last_name || '' }), ph = mk('tel', '', { autocomplete: 'tel-national', inputmode: 'numeric', maxlength: 10, value: c.phone || '' });
      const save = async btn => { const phone = ph.value.replace(/\D/g, '');
        if (fn.value.trim().length < 2) return toast('Please enter your first name.', { err: true }); if (!/^[6-9]\d{9}$/.test(phone)) return toast('Enter a valid 10-digit mobile number.', { err: true });
        try { const r = await busy(btn, () => api('/account/me', { method: 'PATCH', body: { first_name: fn.value, last_name: ln.value, phone, complete: true } })); me.customer = r.customer; step = 4; paint(); } catch (x) { toast(x.message, { err: true }); } };
      card.append(head('Tell us about you', 'So we can deliver your orders and reach you if needed.'), h('div', { class: 'fl-two' }, fld('First name', fn), fld('Last name', ln)),
        h('div', { class: 'fl-phone' }, h('span', { class: 'cc' }, '+91'), fld('Mobile number', ph)), h('button', { class: 'btn auth-btn', onclick: e => save(e.currentTarget) }, 'Continue'));
      setTimeout(() => fn.focus(), 60);
    } else {
      const l1 = mk('text', '', { autocomplete: 'address-line1' }), l2 = mk('text', '', { autocomplete: 'address-line2' }), pin = mk('text', '', { inputmode: 'numeric', maxlength: 6, autocomplete: 'postal-code' }), city = mk('text', '', { autocomplete: 'address-level2' }), st = mk('text', '', { autocomplete: 'address-level1' });
      const save = async btn => { const a = { name: [me.customer.first_name, me.customer.last_name].filter(Boolean).join(' '), phone: me.customer.phone, line1: l1.value, line2: l2.value, pincode: pin.value.trim(), city: city.value, state: st.value, is_default: 1 };
        try { await busy(btn, () => api('/account/addresses', { method: 'POST', body: a })); finish(); } catch (x) { toast(x.message, { err: true }); } };
      card.append(head('Where should we deliver?', 'You can skip this now and add it when you place your first order.'), fld('House no., street, area', l1), fld('Landmark (optional)', l2),
        h('div', { class: 'fl-two' }, fld('Pincode', pin), fld('City', city)), fld('State', st),
        h('button', { class: 'btn auth-btn', onclick: e => save(e.currentTarget) }, 'Save and continue'), h('button', { class: 'link auth-link center', onclick: finish }, 'Skip for now'));
      setTimeout(() => l1.focus(), 60);
    }
  };
  if (me.customer && (!me.customer.first_name || !me.customer.phone)) step = 3;
  paint(); view.append(wrapEl);
}
route(/^\/reset$/, async (view, m, q) => {
  const pw = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' });
  view.append(wrap(h('div', { class: 'card stack', style: { maxWidth: '440px', margin: '0 auto' } }, h('h2', null, 'Choose a new password'), field('New password (8+ characters)', pw), h('button', { class: 'btn', onclick: async e => { try { await busy(e.currentTarget, () => api('/auth/reset', { method: 'POST', body: { token: q.get('token'), password: pw.value } })); toast('Password changed. Please log in.'); nav('/account'); } catch (x) { toast(x.message, { err: true }); } } }, t('save')))));
});

/* ================= INFO PAGES ================= */
route(/^\/policy\/([a-z0-9-]+)$/, async (view, m) => {
  const p = await api('/policies/' + m[1]); setTitle(tr(p, 'title'));
  view.append(wrap(h('div', { style: { maxWidth: '760px', margin: '0 auto' } }, h('h1', { style: { fontSize: 'clamp(1.8rem,5vw,2.6rem)' } }, tr(p, 'title')), h('p', { class: 'muted small', style: { margin: '8px 0 24px' } }, `Version ${p.version} · Updated ${new Date(p.updated_at).toLocaleDateString('en-IN', { dateStyle: 'long' })}`), h('div', { class: 'rte', html: (lang() === 'hi' && p.body_hi) || p.body }))));
});
route(/^\/about$/, (view) => nav('/policy/about', true));
route(/^\/faq$/, async view => { setTitle('FAQ'); const f = await api('/faqs'); view.append(wrap(h('div', { style: { maxWidth: '760px', margin: '0 auto' } }, h('h1', { style: { fontSize: 'clamp(1.8rem,5vw,2.6rem)', marginBottom: '16px' } }, 'FAQ'), f.length ? faqList(f) : h('p', { class: 'muted' }, 'No questions yet.'), h('p', { style: { marginTop: '20px' } }, h('a', { class: 'btn', href: '/contact' }, t('support')))))); });
function contactForm(kind, q) {
  const B = BOOT.brand, c = me.customer || {};
  const f = { name: h('input', { class: 'inp', value: c.name || '', autocomplete: 'name' }), email: h('input', { class: 'inp', type: 'email', value: c.email || '', autocomplete: 'email' }), phone: h('input', { class: 'inp', inputmode: 'numeric', maxlength: 10, value: c.phone || '' }), order: h('input', { class: 'inp', value: q.get('order') || '' }), subject: h('input', { class: 'inp' }), message: h('textarea', { class: 'inp', maxlength: 3000, rows: 5 }) };
  const out = h('div');
  return h('div', { class: 'card stack' }, field(t('name'), f.name), h('div', { class: 'grid2' }, field('Email', f.email), field(t('phone'), f.phone)), h('div', { class: 'grid2' }, field(t('order_no') + ' (optional)', f.order), field('Subject', f.subject)), field(t('msg'), f.message),
    h('button', { class: 'btn', onclick: async e => { try { const r = await busy(e.currentTarget, () => api('/contact', { method: 'POST', body: { kind, name: f.name.value, email: f.email.value, phone: f.phone.value, order_number: f.order.value, subject: f.subject.value, message: f.message.value } })); clear(out).append(h('div', { class: 'box-note' }, icon('check'), h('span', null, r.message + ' Reference: ', h('b', null, r.ref)))); Object.values(f).forEach(x => { x.value = ''; }); } catch (x) { toast(x.message, { err: true }); } } }, t('send')), out);
}
route(/^\/contact$/, async (view, m, q) => {
  setTitle(t('support')); const B = BOOT.brand;
  view.append(wrap(h('div', { class: 'co' }, h('div', null, h('h1', { style: { fontSize: 'clamp(1.8rem,5vw,2.6rem)', marginBottom: '16px' } }, t('support')), contactForm('contact', q)),
    h('aside', { class: 'card stack' }, h('h3', null, 'Talk to us'), B.phone ? h('p', null, h('a', { href: 'tel:' + B.phone }, B.phone)) : null, B.whatsapp ? h('a', { class: 'btn', style: { background: '#25a244', color: '#fff' }, href: `https://wa.me/91${B.whatsapp.replace(/\D/g, '').slice(-10)}`, target: '_blank', rel: 'noopener' }, 'WhatsApp') : null, B.email ? h('p', null, h('a', { href: 'mailto:' + B.email }, B.email)) : null,
      B.support_hours ? h('p', { class: 'muted small' }, B.support_hours) : null, B.holiday_notice ? h('p', { class: 'box-note warn' }, B.holiday_notice) : null, h('p', { class: 'small muted' }, [B.legal_name, B.address, B.city, B.state, B.pincode].filter(Boolean).join(', '))))));
});
route(/^\/grievance$/, async (view, m, q) => {
  setTitle(t('grievance')); const g = BOOT.brand.grievance || {};
  view.append(wrap(h('div', { class: 'co' }, h('div', null, h('h1', { style: { fontSize: 'clamp(1.8rem,5vw,2.6rem)', marginBottom: '8px' } }, t('grievance')), h('p', { class: 'muted', style: { marginBottom: '16px' } }, 'If you are not happy with an order, product or our service, write to us here. We acknowledge your complaint within 48 hours and aim to resolve it within one month.'), contactForm('grievance', q)),
    h('aside', { class: 'card stack' }, h('h3', null, 'Grievance Officer'), g.name ? h('p', null, h('b', null, g.name), g.designation ? `, ${g.designation}` : '') : h('p', { class: 'muted' }, 'Details will be shown here.'), g.email ? h('p', null, h('a', { href: 'mailto:' + g.email }, g.email)) : null, g.phone ? h('p', null, h('a', { href: 'tel:' + g.phone }, g.phone)) : null, g.address ? h('p', { class: 'small muted' }, g.address) : null))));
});

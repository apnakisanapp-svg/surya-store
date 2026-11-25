// End-to-end checks against running servers. Usage: PUB=http://localhost:3111 ADM=http://127.0.0.1:4111 ADMIN_EMAIL=.. ADMIN_PASSWORD=.. node test/run.js
const PUB = process.env.PUB || 'http://localhost:3111', ADM = process.env.ADM || 'http://127.0.0.1:4111';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const pj = async (p, o = {}) => { const r = await fetch(PUB + '/api' + p, { method: o.method || 'GET', headers: { 'content-type': 'application/json', 'x-sy-csrf': '1', ...(o.headers || {}) }, body: o.body ? JSON.stringify(o.body) : undefined }); let d; try { d = await r.json(); } catch { } return [r.status, d]; };
let cookie = '';
const aj = async (p, o = {}) => { const r = await fetch(ADM + '/api' + p, { method: o.method || 'GET', headers: { 'content-type': 'application/json', 'x-sy-csrf': '1', cookie }, body: o.body ? JSON.stringify(o.body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; let d; try { d = await r.json(); } catch { } return [r.status, d]; };
const addr = { name: 'Test User', phone: '9876543210', line1: '12 Test Street', pincode: '110001', city: 'Delhi', state: 'Delhi' };
let seq = 0; const phone = () => '98' + String(Date.now() % 1e6).padStart(6, '0') + String(10 + (seq++ % 90));
const order = (pid, qty, method = 'upi') => pj('/orders', { method: 'POST', body: { items: [{ product_id: pid, qty }], method, consents: { terms: true, safety: true }, address: { ...addr, phone: phone() } } });
(async () => {
  const l = await aj('/login', { method: 'POST', body: { email: process.env.ADMIN_EMAIL || 'owner@surya.local', password: process.env.ADMIN_PASSWORD || 'Test12345678' } });
  ok(l[0] === 200, 'admin login');
  ok((await aj('/dashboard'))[0] === 200, 'dashboard loads');
  const bad = await fetch(ADM + '/api/dashboard'); ok(bad.status === 401, 'admin API blocked without login');
  const pub = await fetch(PUB + '/api/orders', { method: 'GET' }); ok(pub.status !== 200, 'public site has no admin data');
  const adminOnPublic = await fetch(PUB + '/api/dashboard'); ok(adminOnPublic.status === 404 || adminOnPublic.status === 401, 'admin routes not exposed on public port');
  const list = (await pj('/products?limit=50'))[1]; const prods = list.items || list; const p = prods.find(x => /Steel Water Bottle/.test(x.name)) || prods.find(x => x.stock >= 3) || prods[0]; // a product without colour/size choices, so the test needs no variant
  ok(!!p, 'storefront lists products');
  // Release 3: checkout needs login unless the owner switches guest checkout on
  const sv0 = (await aj('/settings'))[1].values.store;
  ok(sv0.guest_checkout === false, 'guest checkout is OFF by default');
  const gate = await order(p.id, 1); ok(gate[0] === 401, `guest order refused while login is required (got ${gate[0]})`);
  await aj('/settings/store', { method: 'PUT', body: { guest_checkout: true } });
  await aj('/products/' + p.id, { method: 'PUT', body: { stock: 10 } });
  const stock = async () => (await aj('/products/' + p.id))[1].stock;
  const s0 = await stock();
  const o1 = await order(p.id, 1); ok(o1[0] === 200 && o1[1].number, 'UPI order placed');
  const s1 = await stock(); ok(s1 === s0 - 1, `stock locked (${s0} -> ${s1})`);
  const tk = o1[1].token || o1[1].t;
  const c = await pj(`/orders/${o1[1].number}/cancel?t=${tk}`, { method: 'POST', body: { reason: 'test' } });
  ok(c[0] === 200, 'customer cancel works'); ok(await stock() === s0, 'stock released after cancel');
  const price = await pj('/cart/price', { method: 'POST', body: { items: [{ product_id: p.id, qty: 9999 }], pincode: '110001', method: 'cod' } });
  ok(price[1] && price[1].lines && price[1].lines[0].issue, 'over-stock quantity flagged');
  await aj('/products/' + p.id, { method: 'PUT', body: { stock: 1 } }); ok(await stock() === 1, 'stock set to 1');
  const race = await Promise.all([order(p.id, 1), order(p.id, 1), order(p.id, 1)]);
  const wins = race.filter(r => r[0] === 200).length; ok(wins === 1, `last-piece race: exactly 1 order wins (got ${wins})`);
  ok(await stock() === 0, 'stock is 0 after race');
  const win = race.find(r => r[0] === 200)[1]; await pj(`/orders/${win.number}/cancel?t=${win.token || win.t}`, { method: 'POST', body: { reason: 'test' } });
  ok(await stock() === 1, 'stock restored'); await aj('/products/' + p.id, { method: 'PUT', body: { stock: 10 } });
  const o3 = await order(p.id, 1, 'cod'); ok(o3[0] === 200, 'COD order placed');
  const noCons = await pj('/orders', { method: 'POST', body: { items: [{ product_id: p.id, qty: 1 }], method: 'cod', consents: {}, address: addr } }); ok(noCons[0] >= 400, 'order refused without policy consent');
  const tamper = await pj('/orders', { method: 'POST', body: { items: [{ product_id: p.id, qty: 1, price: 1 }], total: 1, method: 'cod', consents: { terms: true, safety: true }, address: addr } });
  ok(tamper[0] === 200 && tamper[1].total > 1, 'client price tampering ignored');
  // exact-amount UPI + payment matching
  const u1 = await order(p.id, 1), u2 = await order(p.id, 1), u3 = await order(p.id, 1);
  const t1 = u1[1].total, t2 = u2[1].total, t3 = u3[1].total;
  ok(new Set([t1, t2, t3]).size === 3, `three waiting UPI orders have different exact amounts (${t1}, ${t2}, ${t3})`);
  await pj(`/orders/${u1[1].number}/utr?t=${u1[1].token}`, { method: 'POST', body: { utr: '412345678901' } });
  const text = `Date  Details  Credit\n01 Nov  UPI/412345678901/CUSTOMER  ${t1.toFixed(2)}\n01 Nov  UPI/999999999999/SOMEONE  ${t2.toFixed(2)}\n01 Nov  Salary  50,000.00`;
  const mm = await aj('/orders/match-payments', { method: 'POST', body: { text } });
  const m1 = mm[1].matches.find(x => x.number === u1[1].number), m2 = mm[1].matches.find(x => x.number === u2[1].number);
  ok(m1 && m1.level === 'certain', 'amount + transaction ID match is marked sure');
  ok(m2 && m2.level === 'probable', 'amount-only match is marked check');
  ok(!mm[1].matches.some(x => x.number === u3[1].number), 'unpaid order is not matched');
  const ver = await aj(`/orders/${m1.id}/verify`, { method: 'POST', body: { ok: true } });
  ok(ver[0] === 200, 'matched order can be confirmed');
  for (const x of [u2, u3]) await pj(`/orders/${x[1].number}/cancel?t=${x[1].token}`, { method: 'POST', body: { reason: 'test' } });

  // ---- COD advance ----
  const pay0 = (await aj('/settings/payments'))[1]; const pv = pay0.value || pay0;
  await aj('/settings/payments', { method: 'PUT', body: { ...pv, upi_id: pv.upi_id || 'test@upi', upi_enabled: true, cod_enabled: true, cod_advance_on: true, cod_advance_min_total: 100, cod_advance_mode: 'fixed', cod_advance_value: 99, cod_advance_for: 'all' } });
  await new Promise(r => setTimeout(r, 1800));
  const bp = (await pj('/products?limit=50'))[1]; const bpl = (bp.items || bp).find(x => /Steel Water Bottle/.test(x.name)) || p;
  await aj('/products/' + bpl.id, { method: 'PUT', body: { stock: 20 } });
  const quote = await pj('/cart/price', { method: 'POST', body: { items: [{ product_id: bpl.id, qty: 1 }], method: 'cod', pincode: '110001' } });
  ok(quote[0] === 200 && quote[1].cod && quote[1].cod.advance === 99, 'checkout shows the COD advance (99)');
  const ca = await order(bpl.id, 1, 'cod');
  ok(ca[0] === 200 && ca[1].status === 'payment_pending' && ca[1].advance === 99, 'COD order with advance waits for the advance');
  const payI = await pj(`/orders/${ca[1].number}/pay?t=${ca[1].token}`);
  ok(payI[0] === 200 && payI[1].amount <= 99 && payI[1].amount > 98 && payI[1].advance && payI[1].advance.amount === 99, 'pay page asks for about 99 (unique paise)');
  const caDetail0 = (await aj('/orders?status=action'))[1]; ok(!JSON.stringify(caDetail0).includes(ca[1].number), 'unpaid advance order is not in "Needs action"');
  const su = await pj(`/orders/${ca[1].number}/utr?t=${ca[1].token}`, { method: 'POST', body: { utr: 'ADV' + Date.now().toString().slice(-9) } }); ok(su[0] === 200, 'customer submits advance UTR');
  const caId = (await aj('/orders?q=' + ca[1].number))[1].items[0].id;
  const vv = await aj(`/orders/${caId}/verify`, { method: 'POST', body: { ok: true } }); ok(vv[0] === 200, 'admin confirms the advance');
  const cd = (await aj('/orders/' + caId))[1].order; ok(['cod_confirm', 'confirmed'].includes(cd.status) && cd.advance_status === 'verified' && cd.payment_status === 'cod_due', 'order accepted after advance');
  ok(Math.abs(cd.due_on_delivery - (cd.total - 99)) < 0.01, 'collect on delivery = total minus advance');
  const cs = await pj(`/orders/${ca[1].number}?t=${ca[1].token}`); ok(cs[1].order.advance === 99 && Math.abs(cs[1].order.due_on_delivery - (cd.total - 99)) < 0.01, 'customer sees advance and amount due');
  const cx = await aj(`/orders/${caId}/status`, { method: 'POST', body: { to: 'cancelled', reason: 'test cancel' } }); ok(cx[0] === 200, 'cancel order with advance');
  const cd2 = (await aj('/orders/' + caId))[1].order; ok(cd2.advance_status === 'refund_due', 'cancelled order marks the advance as refund due');
  const rf = await aj(`/orders/${caId}/advance-refunded`, { method: 'POST', body: {} }); ok(rf[0] === 200 && (await aj('/orders/' + caId))[1].order.advance_status === 'refunded', 'admin records the advance refund');
  const small = await order(bpl.id, 1, 'cod'); ok(small[0] === 200, 'second advance order can be placed (unique amounts)');
  await pj(`/orders/${small[1].number}/cancel?t=${small[1].token}`, { method: 'POST', body: { reason: 'test' } });
  await aj('/settings/payments', { method: 'PUT', body: { ...pv, cod_advance_on: false } });
  await new Promise(r => setTimeout(r, 1800));
  const plain = await order(bpl.id, 1, 'cod'); ok(plain[0] === 200 && ['cod_confirm', 'confirmed'].includes(plain[1].status) && !plain[1].advance, 'COD without the advance rule is accepted at once');
  await pj(`/orders/${plain[1].number}/cancel?t=${plain[1].token}`, { method: 'POST', body: { reason: 'test' } });
  // ---- per-product payment rule ----
  await aj('/products/' + bpl.id, { method: 'PUT', body: { pay_rule: 'upi_only' } });
  const qU = await pj('/cart/price', { method: 'POST', body: { items: [{ product_id: bpl.id, qty: 1 }], method: 'cod', pincode: '110001' } });
  ok(qU[1].cod.ok === false && qU[1].upi_only === true, 'UPI-only product turns off cash on delivery');
  const oU = await order(bpl.id, 1, 'cod'); ok(oU[0] >= 400, 'COD order is refused for a UPI-only product');
  await aj('/products/' + bpl.id, { method: 'PUT', body: { pay_rule: 'cod_advance' } });
  const qA = await pj('/cart/price', { method: 'POST', body: { items: [{ product_id: bpl.id, qty: 1 }], method: 'cod', pincode: '110001' } });
  ok(qA[1].cod.ok === true && qA[1].cod.advance === 99, 'advance-compulsory product asks for the advance even when the global rule is off');
  const oA = await order(bpl.id, 1, 'cod'); ok(oA[0] === 200 && oA[1].status === 'payment_pending' && oA[1].advance === 99, 'its COD order waits for the advance');
  await pj(`/orders/${oA[1].number}/cancel?t=${oA[1].token}`, { method: 'POST', body: { reason: 'test' } });
  await aj('/products/' + bpl.id, { method: 'PUT', body: { pay_rule: '' } });
  // ---- per-product services & rules ----
  let p2 = p; for (const x of prods) { if (x.id === bpl.id) continue; await aj('/products/' + x.id, { method: 'PUT', body: { stock: 10 } }); const t = await pj('/cart/price', { method: 'POST', body: { items: [{ product_id: x.id, qty: 1 }], method: 'cod', pincode: '110001' } }); if (t[1].lines && t[1].lines[0] && t[1].lines[0].ok) { p2 = x; break; } }
  const cp = (items, extra = {}) => pj('/cart/price', { method: 'POST', body: { items, method: 'cod', pincode: '110001', ...extra } }).then(r => r[1]);
  const L = [{ product_id: bpl.id, qty: 1 }], L2 = [{ product_id: bpl.id, qty: 1 }, { product_id: p2.id, qty: 1 }];
  await aj('/products/' + bpl.id, { method: 'PUT', body: { adv_type: 'fixed', adv_value: 99 } });
  ok((await cp(L)).cod.advance === 99, 'product advance: fixed 99 asked even when the global rule is off');
  await aj('/products/' + p2.id, { method: 'PUT', body: { adv_type: 'fixed', adv_value: 49 } });
  ok((await cp(L2)).cod.advance === 148, 'advances of two products are added (99 + 49)');
  await aj('/products/' + p2.id, { method: 'PUT', body: { pay_rule: 'cod_advance', adv_type: '', adv_value: 25 } });
  const pp = await cp([{ product_id: p2.id, qty: 1 }]); ok(pp.cod.advance === 25, 'advance rupees set in the Services form are used');
  await aj('/products/' + bpl.id, { method: 'PUT', body: { pay_rule: 'cod' } }); await aj('/products/' + p2.id, { method: 'PUT', body: { pay_rule: 'cod' } });
  ok((await cp(L2)).cod.advance === 0, 'advance "none" on every product asks nothing');
  const bad1 = await aj('/products/' + bpl.id, { method: 'PUT', body: { adv_type: 'percent', adv_value: 95 } }); ok(bad1[0] >= 400, 'advance over 90% is refused');
  await aj('/products/' + bpl.id, { method: 'PUT', body: { pay_rule: '', adv_type: '', adv_value: '' } }); await aj('/products/' + p2.id, { method: 'PUT', body: { pay_rule: '', adv_type: '', adv_value: '' } });
  await aj('/products/' + bpl.id, { method: 'PUT', body: { ship_rule: 'free' } });
  ok((await cp(L)).shipping === 0, 'free-delivery product has no delivery charge');
  await aj('/products/' + bpl.id, { method: 'PUT', body: { ship_rule: 'own', ship_value: 30 } });
  const shp = await cp([{ product_id: bpl.id, qty: 9 }]); ok(shp.subtotal > 0 && shp.shipping > 0, 'always-charged product pays delivery even above the free limit');
  await aj('/products/' + bpl.id, { method: 'PUT', body: { ship_rule: '' } });
  await aj('/products/' + bpl.id, { method: 'PUT', body: { gift_rule: 'no' } });
  const gq = await cp(L, { gift: true }); ok(gq.gift.ok === false && gq.gift_fee === 0, 'gift wrap off for a product removes the gift charge');
  await aj('/products/' + bpl.id, { method: 'PUT', body: { gift_rule: 'yes', gift_price: 77 } });
  const gq2 = await cp(L, { gift: true }); ok(gq2.gift.ok === true && gq2.gift_fee === 77, 'own gift price is used');
  await aj('/products/' + bpl.id, { method: 'PUT', body: { gift_rule: '', gift_price: '' } });
  await aj('/products/' + bpl.id, { method: 'PUT', body: { ret_rule: 'none', ret_days: 3 } });
  const pd = (await pj('/products/' + (await aj('/products/' + bpl.id))[1].slug))[1]; const rr = (pd.product || pd).rules;
  ok(rr && rr.ret_rule === 'none' && /No return/.test(rr.ret_text), 'product page data carries the return rule');
  await aj('/products/' + bpl.id, { method: 'PUT', body: { ret_rule: 'refund', ret_days: 10 } });
  const pd2 = (await pj('/products/' + (await aj('/products/' + bpl.id))[1].slug))[1]; const rr2 = (pd2.product || pd2).rules; ok(rr2.ret_rule === 'refund' && rr2.ret_days === 10, 'refund-only rule for 10 days saved');
  await aj('/products/' + bpl.id, { method: 'PUT', body: { ret_rule: '', ret_days: '' } });
  // ---- district + pincode helper ----
  const pinR = await pj('/pincode-info/110001'); ok(pinR[0] === 200 && typeof pinR[1].found === 'boolean', 'pincode helper answers (found or not)');
  const pinBad = await pj('/pincode-info/12'); ok(pinBad[0] >= 400, 'pincode helper refuses a bad pincode');
  const dOrd = await pj('/orders', { method: 'POST', body: { items: [{ product_id: bpl.id, qty: 1 }], method: 'upi', consents: { terms: true, safety: true }, address: { ...addr, phone: phone(), district: 'Central Delhi' } } });
  ok(dOrd[0] === 200, 'order with district is placed');
  const dView = await pj(`/orders/${dOrd[1].number}?t=${dOrd[1].token}`); ok(dView[1].order.address.district === 'Central Delhi', 'district is saved with the order');
  await pj(`/orders/${dOrd[1].number}/cancel?t=${dOrd[1].token}`, { method: 'POST', body: { reason: 'test' } });
  // ---- unpaid UPI order is not counted as a real order ----
  const un = await order(bpl.id, 1, 'upi'); const dsh = (await aj('/dashboard'))[1];
  const actList = JSON.stringify((await aj('/orders?status=action'))[1]); ok(!actList.includes(un[1].number), 'unpaid UPI order is not in "Needs action"');
  await pj(`/orders/${un[1].number}/cancel?t=${un[1].token}`, { method: 'POST', body: { reason: 'test' } });
  // ---- email login code ----
  const fs = require('fs'), LOG = process.env.OTP_LOG_FILE;
  if (LOG) {
    const em = `otp${Date.now()}@test.in`; fs.writeFileSync(LOG, '');
    const sd = await pj('/auth/otp/send', { method: 'POST', body: { email: em } }); ok(sd[0] === 200, 'login code is sent');
    const again = await pj('/auth/otp/send', { method: 'POST', body: { email: em } }); ok(again[0] === 400, 'asking again too soon is refused');
    const code = (fs.readFileSync(LOG, 'utf8').trim().split('\n').pop() || '').split(' ')[1];
    const wrong = await pj('/auth/otp/verify', { method: 'POST', body: { email: em, code: code === '000000' ? '111111' : '000000', terms: true } }); ok(wrong[0] === 400, 'wrong code is refused');
    const noTerms = await pj('/auth/otp/verify', { method: 'POST', body: { email: em, code } }); ok(noTerms[0] === 400, 'new account needs the terms ticked');
    const good = await pj('/auth/otp/verify', { method: 'POST', body: { email: em, code, terms: true, phone: '9812345670' } }); ok(good[0] === 200 && good[1].is_new && good[1].customer.email === em, 'right code creates the account and logs in');
    const reuse = await pj('/auth/otp/verify', { method: 'POST', body: { email: em, code, terms: true } }); ok(reuse[0] === 400, 'a code cannot be used twice');
    ok(!JSON.stringify((await aj('/outbox'))[1]).includes(code + ''), 'login codes are never stored in the outbox');
  } else console.log('SKIP email login code tests (set OTP_LOG_FILE to run them)');
  // ---- uploaded banner picture reaches the website ----
  const probe = (await pj('/bootstrap'))[1]; ok(!!probe, 'bootstrap works');
  const ao = await aj('/orders'); ok(ao[0] === 200, 'admin sees orders');
  const sv = await aj('/settings/brand', { method: 'PUT', body: { support_hours: '9 AM - 9 PM TEST' } }); ok(sv[0] === 200, 'admin saves settings');
  await new Promise(r => setTimeout(r, 1800));
  const bs = await pj('/bootstrap'); ok(JSON.stringify(bs[1]).includes('9 AM - 9 PM TEST'), 'admin setting reaches website');
  // ---- release 2: phone notifications, VIP messages, Sab Done, list data ----
  const A = async (p, o) => (await aj(p, o))[1];
  const pi = await A('/push/info');
  ok(pi.key && pi.key.length > 60 && pi.prefs.order !== false, 'push: signing key is made and event switches exist');
  const sub = { endpoint: 'https://example.invalid/push/abc123', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
  const ps = await A('/push/subscribe', { method: 'POST', body: { subscription: sub } });
  ok(ps && ps.ok && ps.devices >= 1, 'push: a phone can be registered');
  const badSub = await aj('/push/subscribe', { method: 'POST', body: { subscription: { endpoint: 'http://x', keys: {} } } });
  ok(badSub[0] === 400, 'push: a bad registration is refused');
  const pt = await A('/push/test', { method: 'POST', body: {} });
  ok(pt && pt.ok === true, 'push: test notification call never crashes, even if the phone is unreachable');
  const pu = await A('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
  ok(pu && pu.ok === true, 'push: a phone can be removed');
  await A('/settings/push', { method: 'PUT', body: { lock_hide: true, stock: false } });
  const pi2 = await A('/push/info'); ok(pi2.prefs.lock_hide === true && pi2.prefs.stock === false, 'push: switches are saved');
  await A('/settings/push', { method: 'PUT', body: { lock_hide: false, stock: true } });
  const ob = await A('/outbox'); const rowW = ob.find(x => x.channel === 'whatsapp' && x.order_id);
  ok(rowW && /Hi \w+/.test(rowW.body) && !/\{\{/.test(rowW.body), 'messages: customer message is queued with the new warm wording');
  ok(rowW && /\/s\/[A-Za-z0-9]{6,}/.test(rowW.body) && !/[?&]t=/.test(rowW.body), 'messages: links are short and never show the order token');
  const sl = rowW && rowW.body.match(/https?:\/\/[^\s]+\/s\/([A-Za-z0-9]+)/); const rd = sl ? await fetch(PUB + '/s/' + sl[1], { redirect: 'manual' }) : null;
  ok(rd && rd.status === 302 && /^\/(order|p)\//.test(rd.headers.get('location') || ''), 'messages: a short link opens the right page');
  ok((await fetch(PUB + '/s/nope1234', { redirect: 'manual' })).status === 404, 'messages: an unknown short link shows a friendly 404');
  if (rowW) {
    const done = await A('/outbox/done-all', { method: 'POST', body: { ids: [rowW.id] } });
    ok(done.done === 1, 'Sab Done: marks the chosen messages as sent');
    const od = await A('/orders/' + rowW.order_id); ok(od.events.some(e => /Message sent to customer/.test(e.note || '')), 'Sab Done: the order keeps a record that the message was sent');
  }
  const lst = await A('/orders?status=');
  ok(lst.items.length && lst.items.every(x => 'image_url' in x && 'first_name' in x && 'item_count' in x), 'orders list carries photo and product name for the cards');

  // ---- Release 10: visitor insights + orders archive ----
  const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
  const tp = async (url, body, h = {}) => { const r = await fetch(PUB + '/api' + url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sy-csrf': '1', 'user-agent': UA, ...h }, body: JSON.stringify(body) }); return [r.status, await r.json().catch(() => ({}))]; };
  const vid = 'tv' + Math.random().toString(36).slice(2, 12), vk = 'tk' + Math.random().toString(36).slice(2, 12);
  const camp = await A('/visitors/campaigns', { method: 'POST', body: { name: 'Test reel', platform: 'instagram', target: '/p/' + p.slug } });
  ok(camp.ok && /^ig-test-reel/.test(camp.code) && /[?&]src=ig-test-reel/.test(camp.link), 'insights: a reel link gets its own tag (src=ig-test-reel)');
  const sl2 = camp.short && camp.short.match(/\/s\/([A-Za-z0-9]+)$/); const rd2 = sl2 ? await fetch(PUB + '/s/' + sl2[1], { redirect: 'manual' }) : null;
  ok(rd2 && rd2.status === 302 && /src=ig-test-reel/.test(rd2.headers.get('location') || ''), 'insights: the short link keeps the tag');
  const bot10 = await fetch(PUB + '/api/t/pv', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sy-csrf': '1', 'user-agent': 'Googlebot/2.1' }, body: JSON.stringify({ vid: 'botvid12345', vk: 'botvk123456', pk: 'botpk1234', path: '/' }) });
  ok(bot10.status === 200, 'insights: bot visit is accepted but ignored');
  const pv1 = await tp('/t/pv', { vid, vk, pk: 'pk1' + vk, path: '/', ref: 'https://l.instagram.com/', camp: camp.code, w: 390 });
  ok(pv1[0] === 200 && pv1[1].src === 'instagram' && pv1[1].campaign === camp.code, `insights: a visit from the tagged link is read as Instagram (${pv1[1].src})`);
  const pv2 = await tp('/t/pv', { vid, vk, pk: 'pk2' + vk, path: '/p/' + p.slug, w: 390 });
  ok(pv2[0] === 200, 'insights: second page of the same visit is recorded');
  const lv10 = await tp('/t/leave', { pk: 'pk2' + vk, dur: 42000, scroll: 80 }, { 'x-sy-csrf': '' });
  ok(lv10[0] === 200, 'insights: leaving a page (beacon, no header) is accepted');
  await tp('/events', { type: 'atc', product_id: p.id, sid: 'x' }, { 'x-sy-vk': vk });
  const oo = await order(p.id, 1, 'cod'); // order without the visit header first
  const ov10 = await A('/visitors/overview?days=7');
  ok(ov10.cur.visits >= 1 && ov10.cur.page_views >= 2 && ov10.cur.atc >= 1, `insights: overview counts the visit, pages and cart (${ov10.cur.visits}/${ov10.cur.page_views}/${ov10.cur.atc})`);
  ok(!ov10.series.length || ov10.series.every(x => /^\d{4}-\d\d-\d\d$/.test(x.d)), 'insights: daily series uses India dates');
  const srcs10 = await A('/visitors/sources?days=7'); ok(srcs10.rows.some(x => x.src === 'instagram' && x.visits >= 1), 'insights: sources lists Instagram');
  const cs10 = await A('/visitors/campaigns?days=7'); const mine = cs10.rows.find(x => x.code === camp.code); ok(mine && mine.visits >= 1 && mine.saw_product >= 1 && mine.atc >= 1, 'insights: the reel shows visits, product views and cart');
  const o5 = await pj('/orders', { method: 'POST', headers: { 'x-sy-vk': vk }, body: { items: [{ product_id: p.id, qty: 1 }], method: 'cod', consents: { terms: true, safety: true }, address: { ...addr, phone: phone() }, attr: { src: 'instagram', campaign: camp.code } } });
  const cs11 = await A('/visitors/campaigns?days=7'); const mine2 = cs11.rows.find(x => x.code === camp.code);
  ok(o5[0] === 200 && mine2 && mine2.orders >= 1, `insights: an order placed after the reel visit is credited to that reel (${o5[0]} / ${mine2 && mine2.orders})`);
  const pr10 = await A('/visitors/products?days=7'); ok(Array.isArray(pr10.rows) && pr10.rows.some(x => x.id === p.id), 'insights: product report lists the product');
  await A('/visitors/campaigns/' + camp.id, { method: 'DELETE' });
  const act10 = await A('/orders?archive=0&per=100'), arc10 = await A('/orders?archive=1&per=100');
  ok(act10.items.length > 0 && arc10.items.length === 0 && typeof arc10.archived === 'number' && arc10.archive_days.cancel === 7 && arc10.archive_days.delivered === 30, 'archive: fresh orders stay Active; defaults are 7 / 30 days');

  // ---- Release 11: pages, journeys, carts, searches, people, monthly, CSV, policy ----
  const vk2 = 'tk2' + Math.random().toString(36).slice(2, 12), vid2 = 'tv2' + Math.random().toString(36).slice(2, 12);
  await tp('/t/pv', { vid: vid2, vk: vk2, pk: 'pa' + vk2, path: '/p/' + p.slug, ref: 'https://www.youtube.com/', w: 1280 });
  await tp('/events', { type: 'atc', product_id: p.id, sid: 'y' }, { 'x-sy-vk': vk2 });
  await pj('/products?q=zzqxnothing');
  const pg11 = await A('/visitors/pages?days=7'); ok(pg11.kinds.length && pg11.pages.some(x => x.kind === 'product' && x.label && x.label !== x.path), 'insights: pages report names the product pages');
  const jl = await A('/visitors/journeys?days=7&filter=all'); ok(jl.items.length >= 2 && jl.items.every(x => x.who), `insights: journeys list (${jl.items.length})`);
  const jc = await A('/visitors/journeys?days=7&filter=carted'); ok(jc.items.some(x => x.atc && !x.ordered), 'insights: "cart chhoda" filter finds the visit that did not order');
  const jd = await A('/visitors/journeys/' + jc.items[0].id); ok(jd.steps.some(s2 => s2.type === 'page') && jd.steps.some(s2 => s2.type === 'atc' && /Added to cart/.test(s2.label)), 'insights: journey shows pages and the cart step in time order');
  const ab = await A('/visitors/abandoned?days=7'); ok(ab.total >= 1 && ab.rows.some(x => x.product_id === p.id), 'insights: carts left behind lists the product');
  const sr = await A('/visitors/searches?days=7'); ok(sr.rows.some(x => x.term === 'zzqxnothing') && sr.nothing.some(x => x.term === 'zzqxnothing'), 'insights: searches lists a search that found nothing');
  const pe = await A('/visitors/people?days=7'); ok(pe.guests.length >= 1 && /^Visitor #\d{4}$/.test(pe.guests[0].who), 'insights: guests are anonymous ("Visitor #1234")');
  const mo = await A('/visitors/monthly'); ok(mo.rows.length >= 1 && /^\d{4}-\d\d$/.test(mo.rows[0].month), 'insights: monthly report');
  for (const t of ['visits', 'products', 'monthly']) { const rr = await fetch(ADM + '/api/visitors/export/csv?type=' + t + '&days=7', { headers: { cookie } }); const tx = await rr.text(); ok(rr.status === 200 && /text\/csv/.test(rr.headers.get('content-type') || '') && tx.length > 20, `insights: ${t} CSV downloads`); }
  const pol = await A('/visitors/policy'); if (pol.cookies === false || pol.privacy === false) await aj('/visitors/policy', { method: 'POST' });
  const pol2 = await A('/visitors/policy'); ok(pol2.cookies === true && pol2.privacy === true, 'policy: Cookie and Privacy policies mention visit counting');
  const cpol = await pj('/policies/cookies'); ok(/Visit counting/.test(JSON.stringify(cpol[1])), 'policy: customers can read the visit counting section');
  console.log(fail ? `\n${fail} FAILED` : '\nAll passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

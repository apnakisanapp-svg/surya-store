// End-to-end checks against running servers. Usage: PUB=http://localhost:3111 ADM=http://127.0.0.1:4111 ADMIN_EMAIL=.. ADMIN_PASSWORD=.. node test/run.js
const PUB = process.env.PUB || 'http://localhost:3111', ADM = process.env.ADM || 'http://127.0.0.1:4111';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const pj = async (p, o = {}) => { const r = await fetch(PUB + '/api' + p, { method: o.method || 'GET', headers: { 'content-type': 'application/json', 'x-sy-csrf': '1' }, body: o.body ? JSON.stringify(o.body) : undefined }); let d; try { d = await r.json(); } catch { } return [r.status, d]; };
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
  console.log(fail ? `\n${fail} FAILED` : '\nAll passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

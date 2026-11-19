'use strict';
/**
 * Per-product services. A blank value on the product means "same as the store default" (Settings > Payments).
 *   pay_rule       ''=store | upi_only (no COD) | cod (COD, no advance) | cod_advance (COD, advance needed)
 *   adv_value      advance in rupees (only for cod_advance; blank = store advance)
 *   cod_fee_rule   ''=store | none | fixed      cod_fee_value  rupees
 *   gift_rule      ''=store | yes | no          gift_price     rupees
 *   ship_rule      ''=store | free | own        ship_value     rupees (own delivery charge)
 *   ret_rule       ''=store | replacement | refund | either | exchange | none      ret_days
 * Older products may still carry adv_type (fixed/percent/none) or ship_rule 'paid'; they are read as the nearest new choice.
 */
const settings = require('./settings');

const RET_RULES = ['replacement', 'refund', 'either', 'exchange', 'none'];
const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function effective(p) {
  const P = settings.get('payments'), S = settings.get('shipping'), R = settings.get('returns');
  const base = { enabled: !!P.cod_enabled, advanceOn: !!P.cod_advance_on, adv: Math.round(Number(P.cod_advance_value)) || 99, fee: Number(P.cod_fee) || 0 };

  // 1 + 2: cash on delivery and advance
  let cod = '', adv = num(p.adv_value) > 0 ? Math.round(num(p.adv_value)) : null;
  if (p.pay_rule === 'upi_only') cod = 'off';
  else if (p.pay_rule === 'cod') cod = 'cod';
  else if (p.pay_rule === 'cod_advance') cod = 'advance';
  else if (p.adv_type === 'fixed' || p.adv_type === 'percent') cod = 'advance';
  else if (p.adv_type === 'none') cod = 'cod';
  const storeCod = !base.enabled ? 'off' : base.advanceOn ? 'advance' : 'cod';
  const codIs = cod || storeCod;
  if (codIs === 'advance' && !adv) adv = base.adv;

  // 3: cash on delivery charge
  const fee = p.cod_fee_rule === 'none' ? 0 : p.cod_fee_rule === 'fixed' && num(p.cod_fee_value) != null ? Math.max(0, num(p.cod_fee_value)) : base.fee;

  // 4: gift wrap
  const giftRule = ['yes', 'no'].includes(p.gift_rule) ? p.gift_rule : '';
  const giftOk = giftRule === 'yes' ? true : giftRule === 'no' ? false : !!S.gift_enabled;

  // 5: delivery
  let ship = '', shipValue = null;
  if (p.ship_rule === 'free') ship = 'free';
  else if (p.ship_rule === 'own' || p.ship_rule === 'paid') { ship = 'own'; shipValue = num(p.ship_value) != null ? Math.max(0, num(p.ship_value)) : (Number(S.flat) || 0); }

  // 6: returns
  const retRule = RET_RULES.includes(p.ret_rule) ? p.ret_rule : '';
  const dflt = RET_RULES.includes(R.default_rule) ? R.default_rule : 'either';
  const rule = retRule || dflt;
  const retDays = rule === 'none' ? 0 : (num(p.ret_days) != null && num(p.ret_days) >= 0 ? Math.round(num(p.ret_days)) : R.window_days);
  return {
    cod: codIs, cod_set: !!cod, adv, fee, gift_ok: giftOk, gift_price: num(p.gift_price),
    ship, ship_value: shipValue,
    ret_rule: rule, ret_custom: !!retRule, ret_days: retDays,
  };
}

/** One short sentence about returns, for product page, cart, order page and emails. */
function returnText(e) {
  if (e.ret_rule === 'none') return 'No return or exchange for change of mind. A damaged, defective or wrong item is still replaced.';
  const what = { replacement: 'Replacement', refund: 'Refund', either: 'Replacement or refund', exchange: 'Exchange' }[e.ret_rule];
  return `${what} within ${e.ret_days} days of delivery if the item arrives damaged, defective or wrong.`;
}

/** Remedies a customer can ask for on a product: 'replace' and/or 'refund' */
function remedies(e) {
  if (e.ret_rule === 'refund') return ['refund'];
  if (e.ret_rule === 'replacement' || e.ret_rule === 'exchange') return ['replace'];
  if (e.ret_rule === 'none') return [];
  return ['replace', 'refund'];
}

module.exports = { effective, returnText, remedies, RET_RULES };

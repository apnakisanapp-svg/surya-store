'use strict';
/**
 * Per-product services & rules. A blank value on the product means "follow Settings".
 *   pay_rule   '' | upi_only | cod_advance       (cash on delivery)
 *   adv_type   '' | none | fixed | percent       (COD advance for this product)
 *   gift_rule  '' | yes | no                     (gift wrap)
 *   ret_rule   '' | replacement | refund | either | exchange | none
 *   ship_rule  '' | free | paid                  (delivery charge)
 */
const settings = require('./settings');

const RET_RULES = ['replacement', 'refund', 'either', 'exchange', 'none'];
const RET_LABEL = {
  replacement: 'Replacement only', refund: 'Refund only', either: 'Replacement or refund', exchange: 'Exchange only', none: 'No return',
};
const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function effective(p) {
  const R = settings.get('returns'), S = settings.get('shipping');
  const retRule = RET_RULES.includes(p.ret_rule) ? p.ret_rule : '';
  const retDays = retRule === 'none' ? 0 : (num(p.ret_days) != null && num(p.ret_days) >= 0 ? Math.round(num(p.ret_days)) : R.window_days);
  const advType = ['none', 'fixed', 'percent'].includes(p.adv_type) ? p.adv_type : '';
  const giftRule = ['yes', 'no'].includes(p.gift_rule) ? p.gift_rule : '';
  const giftOk = giftRule === 'yes' ? true : giftRule === 'no' ? false : !!S.gift_enabled;
  return {
    cod: p.pay_rule === 'upi_only' ? 'no' : (p.pay_rule === 'cod_advance' ? 'advance' : ''),
    adv_type: advType, adv_value: num(p.adv_value),
    gift_ok: giftOk, gift_price: num(p.gift_price),
    ret_rule: retRule || 'either', ret_custom: !!retRule, ret_days: retDays,
    ship: ['free', 'paid'].includes(p.ship_rule) ? p.ship_rule : '',
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

module.exports = { effective, returnText, remedies, RET_RULES, RET_LABEL };

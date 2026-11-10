'use strict';
const settings = require('./settings');
const { jparse } = require('./util');

/**
 * Product Risk Checker. It reads the product's fields and the owner's tick-boxes and raises flags.
 * level: 'hard'  -> can never be published (banned words)
 *        'block' -> must be fixed before publishing (legal fields required by e-commerce rules)
 *        'check' -> must be acknowledged by the owner after checking (battery, BIS, licences)
 * This is a rule-based helper, not legal advice.
 */
function checkProduct(p) {
  const flags = [];
  const R = settings.get('risk');
  const text = [p.name, p.name_hi, p.tagline, p.description, p.tags && (Array.isArray(p.tags) ? p.tags.join(' ') : p.tags), p.brand_used]
    .filter(Boolean).join(' ').toLowerCase();
  const has = w => new RegExp('(^|[^a-z0-9])' + w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i').test(text);

  const add = (code, level, title, why, todo, link) => flags.push({ code, level, title, why, todo, link: link || null });

  for (const w of R.banned_words || []) {
    if (has(w)) { add('banned:' + w, 'hard', `Restricted item: "${w}"`, 'Items like this are restricted by couriers, payment gateways, ad platforms or law.', 'Do not sell this product.'); }
  }
  for (const w of R.avoid_brands || []) {
    if (has(w)) add('brand:' + w.trim(), 'block', `Brand name found: "${w.trim()}"`, 'Using another company\'s brand name without permission can lead to a trademark complaint or a counterfeit claim.', 'Remove the brand name, or keep proof that you are an authorised seller.');
  }
  if (!p.origin_country) add('origin', 'block', 'Country of origin missing', 'The Consumer Protection (E-Commerce) Rules, 2020 require sellers to show the country of origin.', 'Fill "Country of origin".', 'https://consumeraffairs.nic.in/acts-and-rules/consumer-protection');
  if (!p.manufacturer && !p.importer) add('maker', 'block', 'Manufacturer / importer details missing', 'Sellers must be able to show who made or imported the product (name and address).', 'Fill "Manufacturer" or "Importer".');
  if (!(Number(p.price) > 0)) add('price', 'block', 'Selling price missing', 'A product cannot be published without a price.', 'Set the selling price.');
  if (Number(p.mrp) > 0 && Number(p.price) > Number(p.mrp)) add('mrp', 'block', 'Selling price is higher than MRP', 'Selling above MRP is not allowed under Legal Metrology rules.', 'Fix the price or the MRP.');
  if (!p.warranty) add('warranty', 'check', 'Warranty / guarantee text empty', 'Sellers must show warranty or guarantee details where they apply.', 'Add warranty text, or write "No warranty" if there is none.');
  if (p.has_battery) {
    add('battery', 'check', 'Contains a battery', 'Lithium batteries are dangerous goods for shipping. Couriers may refuse them, accept them by road only, or charge extra. Railway parcel rules also changed recently.',
      'Get written confirmation from your courier that they carry this product, and by which mode. Then tick "Courier confirmed".');
    if (!p.safety) add('battery_safety', 'block', 'Battery products need a safety note', 'Customers must be warned about charging, heat and children.', 'Fill the "Safety instructions" field.');
  }
  if (p.is_electronic) add('bis', 'check', 'Electronic product: check BIS registration', 'Some electronics need BIS (CRS) registration before they can be sold in India. Marketplaces ask for it as well.',
    'Check the product on the BIS CRS list or ask a consultant/CA. Tick "BIS checked" once done.', 'https://www.bis.gov.in/');
  if (p.has_blade) add('blade', 'check', 'Sharp or bladed item', 'Many couriers, payment gateways and ad platforms restrict bladed products.', 'Confirm with your courier and gateway before selling.');
  if (p.is_liquid) add('liquid', 'check', 'Liquid, gel or pressurised item', 'Liquids and aerosols have shipping limits and may need dangerous-goods handling.', 'Confirm the shipping method with your courier.');
  if (p.is_cosmetic_food) add('licence', 'check', 'Cosmetic / food / supplement', 'These need licences and special labels (FSSAI, CDSCO).', 'Check licence requirements with a CA or consultant.');
  if (!p.hsn && p.gst_rate) add('hsn', 'check', 'HSN code missing', 'Needed on GST invoices.', 'Add the HSN code.');
  const claims = ['eco friendly', 'eco-friendly', 'biodegradable', '100% safe', 'waterproof', 'certified', 'bis approved', 'iso certified', 'medical', 'cure', 'guaranteed'];
  for (const c of claims) if (has(c)) add('claim:' + c, 'check', `Claim in text: "${c}"`, 'Advertising claims must be accurate. A wrong claim can be treated as a misleading advertisement.', 'Keep proof for this claim, or remove the words.');

  const ack = jparse(p.risk_ack, {}) || {};
  for (const f of flags) f.acked = f.level === 'hard' ? false : !!ack[f.code];
  const hard = flags.filter(f => f.level === 'hard');
  const open = flags.filter(f => f.level !== 'hard' && !f.acked && (f.level === 'check' || f.level === 'block'));
  // 'block' flags are fixed by editing fields (they disappear), 'check' flags are acknowledged.
  const level = hard.length ? 'red' : open.length ? 'amber' : 'green';
  return { flags, level, can_publish: !hard.length && !open.length, open: open.length };
}

module.exports = { checkProduct };

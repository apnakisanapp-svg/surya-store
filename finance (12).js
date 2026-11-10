'use strict';
const db = require('./db');
const settings = require('./settings');
const { round2, num } = require('./util');

function latestLanded(productId) {
  const open = db.prepare('SELECT * FROM purchases WHERE product_id=? AND qty_left>0 ORDER BY purchased_at, id').get(productId);
  if (open) return open.unit_landed;
  const last = db.prepare('SELECT unit_landed FROM purchases WHERE product_id=? ORDER BY purchased_at DESC, id DESC LIMIT 1').get(productId);
  return last ? last.unit_landed : null;
}

/** Landed cost for one unit of a purchase entry. */
function landedUnit({ qty, rate, gst_pct = 0, freight = 0, duty = 0, other = 0, bad_qty = 0, gst_credit = false }) {
  const q = Math.max(1, num(qty, 1)), good = Math.max(1, q - num(bad_qty, 0));
  const goods = num(rate) * q * (gst_credit ? 1 : 1 + num(gst_pct) / 100);
  return round2((goods + num(freight) + num(duty) + num(other)) / good);
}

/**
 * Per-order profit for ONE unit sold, with every deduction visible.
 * The result is only as good as the numbers the owner enters (shipping cost, COD share, return rate...).
 */
function economics(p, overrides = {}) {
  const PR = settings.get('profit'), S = settings.get('shipping'), B = settings.get('brand');
  const price = num(overrides.price != null ? overrides.price : p.price);
  const landed = latestLanded(p.id);
  const unitCost = num(overrides.cost != null ? overrides.cost : (landed != null ? landed : p.cost));
  const costSource = overrides.cost != null ? 'what-if' : landed != null ? 'purchase entries' : 'product cost field';
  const gstRate = B.gst_enabled ? num(p.gst_rate) : 0;
  const gstOut = gstRate ? price * gstRate / (100 + gstRate) : 0;
  const shipCost = num(overrides.ship != null ? overrides.ship : (p.shipping_cost != null ? p.shipping_cost : S.avg_ship_cost));
  const shipPaidByCustomer = S.free_above > 0 && price >= S.free_above ? 0 : num(S.flat);
  const feePct = num(PR.gateway_fee_pct) * (1 - num(PR.cod_share_pct) / 100) * (1 + num(PR.gst_on_fee_pct) / 100);
  const gatewayFee = price * feePct / 100;
  const packaging = num(overrides.packaging != null ? overrides.packaging : (p.packaging_cost != null ? p.packaging_cost : PR.default_packaging));
  const ad = num(overrides.ad != null ? overrides.ad : (p.ad_cost != null ? p.ad_cost : PR.default_ad_cost));
  const rtoLoss = (num(PR.cod_share_pct) / 100) * (num(PR.rto_pct) / 100) * (shipCost * 2 + packaging);
  const damage = unitCost * num(PR.damage_pct) / 100;
  const netShip = shipCost - shipPaidByCustomer;
  const revenueNet = price - gstOut;
  const profit = revenueNet - unitCost - gatewayFee - netShip - packaging - ad - rtoLoss - damage;
  const margin = price > 0 ? profit / price * 100 : 0;
  const g = gstRate ? gstRate / (100 + gstRate) : 0;
  const fixed = unitCost + netShip + packaging + ad + rtoLoss + damage;
  const denom = 1 - g - feePct / 100;
  const breakEven = denom > 0 ? fixed / denom : null;
  const verdict = margin >= PR.green_margin ? 'green' : margin >= PR.yellow_margin ? 'yellow' : 'red';
  const reasons = [];
  if (unitCost <= 0) reasons.push('Cost price is not set, so profit is overstated.');
  if (verdict === 'red') reasons.push(profit < 0 ? 'You lose money on every order at this price.' : 'Margin is below your minimum.');
  if (verdict === 'yellow') reasons.push('Thin margin: a small rise in ads, returns or shipping can turn it into a loss.');
  if (verdict === 'green') reasons.push('Margin is above your target.');
  if (shipCost > price * 0.3) reasons.push('Shipping is more than 30% of the price.');
  return {
    price, unit_cost: round2(unitCost), cost_source: costSource,
    breakdown: [
      { label: 'Selling price', value: round2(price) },
      { label: 'GST in price', value: -round2(gstOut) },
      { label: 'Product cost (landed)', value: -round2(unitCost) },
      { label: 'Payment gateway fee', value: -round2(gatewayFee) },
      { label: 'Shipping: your cost minus what customer pays', value: -round2(netShip) },
      { label: 'Packaging', value: -round2(packaging) },
      { label: 'Ads per order', value: -round2(ad) },
      { label: 'COD returns allowance', value: -round2(rtoLoss) },
      { label: 'Damage / replacement allowance', value: -round2(damage) },
    ],
    profit: round2(profit), margin: round2(margin), break_even_price: breakEven != null ? Math.ceil(breakEven) : null,
    max_ad_per_order: round2(Math.max(0, profit + ad)), verdict, reasons,
  };
}

function bestSupplierQuotes(productId) {
  const rows = db.prepare('SELECT q.*, s.name supplier, s.rating FROM supplier_quotes q JOIN suppliers s ON s.id=q.supplier_id WHERE q.product_id=? AND s.deleted_at IS NULL ORDER BY q.quoted_at DESC').all(productId);
  const latestBy = new Map();
  for (const r of rows) if (!latestBy.has(r.supplier_id)) latestBy.set(r.supplier_id, r);
  const out = [...latestBy.values()].map(r => ({
    ...r, landed: round2(r.rate * (1 + num(r.duty_pct) / 100) + num(r.freight_unit) + num(r.other_unit)),
    stale: (Date.now() - new Date(r.quoted_at).getTime()) > 30 * 86400000,
  }));
  out.sort((a, b) => a.landed - b.landed);
  return out;
}

module.exports = { economics, landedUnit, latestLanded, bestSupplierQuotes };

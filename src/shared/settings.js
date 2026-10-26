'use strict';
const db = require('./db');
const { now, jparse } = require('./util');

// Everything the owner can change from the admin panel lives here.
const DEFAULTS = {
  brand: {
    name: 'SURYA', tagline: '', legal_name: '', address: '', city: '', state: '', pincode: '',
    email: '', phone: '', whatsapp: '', gstin: '', gst_enabled: false,
    grievance: { name: '', designation: 'Proprietor', email: '', phone: '', address: '' },
    support_hours: '10:00 AM - 7:00 PM', holiday_notice: '', social: { instagram: '', facebook: '', youtube: '' },
  },
  theme: {
    preset: 'safed', tokens: {}, font_head: 'inter-tight', font_body: 'hind',
    logo_url: '', logo_dark_url: '', favicon_url: '', radius: 24, show_logo_text: true,
  },
  intro: { enabled: false, duration_ms: 1400 },
  announcement: { enabled: true, text: 'Free shipping on orders above ₹499', text_hi: '₹499 se upar ke orders par free shipping', link: '/shop', bg: '', fg: '' },
  store: {
    maintenance: false, maintenance_message: 'We will be back shortly.', default_lang: 'en', language_toggle: true, dark_toggle: true,
    guest_checkout: true, currency: '₹', cart_expiry_days: 14, low_stock_default: 3, show_stock_below: 5,
    recently_viewed: true, wishlist: true, reviews: true, show_sold_out: true, pwa: true,
  },
  payments: {
    upi_enabled: true, upi_id: '', upi_name: 'SURYA', upi_timer_min: 15, upi_grace_min: 60, upi_screenshot: true,
    cod_enabled: true, cod_fee: 0, cod_min: 0, cod_max: 5000, cod_block_pincodes: [], cod_phone_confirm: true,
    razorpay_enabled: false, razorpay_key_id: '', guest_cod: true,
  },
  shipping: {
    flat: 49, free_above: 499, block_pincodes: [], battery_block_pincodes: [], eta_min: 3, eta_max: 7,
    packaging_fee: 0, gift_enabled: true, gift_price: 29,
    battery_notice: 'This product contains a rechargeable lithium battery. Delivery is by road where required, so some pincodes may be unavailable.',
    courier_options: ['Delhivery', 'Shiprocket', 'India Post', 'DTDC', 'Other'], avg_ship_cost: 60,
  },
  returns: { window_days: 7, auto_review_days: 5, text: 'Damaged or defective products can be replaced or refunded within 7 days of delivery. Please record an unboxing video.' },
  popups: {
    welcome: { enabled: false, delay_s: 12, code: '', title: 'Welcome', title_hi: 'Swagat hai', text: 'Get a discount on your first order.', text_hi: 'Pehle order par discount paayein.' },
    exit_intent: { enabled: false, code: '', text: 'Wait! Here is a small discount for you.', text_hi: 'Ruko! Aapke liye ek chhota discount.' },
    cookie: { text: 'We use cookies to keep your cart and improve the site. You can accept or reject non-essential cookies.', text_hi: 'Hum cart yaad rakhne aur site behtar banane ke liye cookies use karte hain.' },
    newsletter: { enabled: true }, battery_notice: true, review_request: true, rating_ask: true,
  },
  seo: {
    title: 'SURYA', description: '', og_image: '', ga_id: '', meta_pixel: '', verification_google: '', robots_index: true,
  },
  profit: {
    green_margin: 25, yellow_margin: 10, gateway_fee_pct: 0, cod_share_pct: 40, rto_pct: 15, damage_pct: 2,
    default_ad_cost: 0, default_packaging: 10, gst_on_fee_pct: 18,
  },
  risk: {
    avoid_brands: ['apple', 'samsung', 'nike', 'adidas', 'boat', 'jbl', 'sony', 'xiaomi', 'mi ', 'oneplus', 'puma', 'lego', 'disney', 'marvel', 'ferrari', 'rolex', 'gucci', 'louis vuitton', 'dyson'],
    banned_words: ['vape', 'e-cigarette', 'ecigarette', 'hookah pen', 'gun', 'pistol', 'ammo', 'firecracker', 'cracker', 'explosive', 'drug', 'steroid', 'weed', 'cannabis', 'lottery', 'fake id', 'counterfeit', 'replica', 'first copy', 'master copy', 'tobacco', 'nicotine', 'pepper spray', 'stun gun', 'taser', 'knife', 'sword', 'dagger'],
    extra: [],
  },
  messages: {
    placed: { subject: 'Order {{order}} received', body: 'Hi {{name}}, we received your order {{order}} for {{total}}. We will keep you updated.' },
    payment_pending: { subject: 'Complete payment for {{order}}', body: 'Hi {{name}}, please pay {{total}} by UPI and enter the transaction ID for order {{order}}.' },
    confirmed: { subject: 'Order {{order}} confirmed', body: 'Hi {{name}}, your order {{order}} is confirmed. We are getting it ready.' },
    packed: { subject: 'Order {{order}} packed', body: 'Hi {{name}}, your order {{order}} is packed and will be shipped soon.' },
    shipped: { subject: 'Order {{order}} shipped', body: 'Hi {{name}}, your order {{order}} has shipped via {{courier}}. Tracking: {{tracking}}. {{track_url}}' },
    delivered: { subject: 'Order {{order}} delivered', body: 'Hi {{name}}, your order {{order}} was delivered. If anything is damaged or defective, tell us within {{days}} days.' },
    cancelled: { subject: 'Order {{order}} cancelled', body: 'Hi {{name}}, your order {{order}} was cancelled. {{reason}}' },
    payment_rejected: { subject: 'Payment not found for {{order}}', body: 'Hi {{name}}, we could not find your payment for order {{order}}. Please send the correct transaction ID or contact us.' },
    refunded: { subject: 'Refund for {{order}}', body: 'Hi {{name}}, a refund for order {{order}} has been initiated. It reaches you in 5-7 working days.' },
    review_request: { subject: 'How was your order {{order}}?', body: 'Hi {{name}}, we would love your review: {{review_url}}' },
    back_in_stock: { subject: '{{product}} is back in stock', body: '{{product}} is available again: {{url}}' },
  },
  home: {
    sections: [
      { id: 'hero', type: 'hero', enabled: true },
      { id: 'categories', type: 'categories', enabled: true, title: 'Shop by category', title_hi: 'Category se chuno' },
      { id: 'trending', type: 'products', source: 'trending', enabled: true, title: 'Trending now', title_hi: 'Abhi trending', limit: 8 },
      { id: 'tiles', type: 'tiles', enabled: true },
      { id: 'new', type: 'products', source: 'new', enabled: true, title: 'New arrivals', title_hi: 'Naye aaye', limit: 8 },
      { id: 'trust', type: 'trust', enabled: true },
      { id: 'testimonials', type: 'testimonials', enabled: false, title: 'What customers say', title_hi: 'Customers kya kehte hain' },
      { id: 'faq', type: 'faq', enabled: false, title: 'Questions', title_hi: 'Sawal' },
      { id: 'newsletter', type: 'newsletter', enabled: false, title: 'Get offers first', title_hi: 'Offers sabse pehle' },
    ],
    trust: [
      { icon: 'card', title: 'UPI or COD', title_hi: 'UPI ya COD', text: 'Pay the way you like.', text_hi: 'Jaise sahuliyat ho, waise pay karo.' },
      { icon: 'refresh', title: '7-day replacement', title_hi: '7 din replacement', text: 'For damaged or defective items.', text_hi: 'Damaged ya defective item par.' },
      { icon: 'chat', title: 'WhatsApp support', title_hi: 'WhatsApp support', text: 'Real people, quick replies.', text_hi: 'Asli log, jaldi jawab.' },
    ],
    eco: { enabled: false, title: 'Our eco promise', title_hi: 'Hamara eco vaada', items: [] },
  },
  menu: {
    header: [
      { label: 'Shop', label_hi: 'Shop', url: '/shop' }, { label: 'Trending', label_hi: 'Trending', url: '/shop?sort=trending' },
      { label: 'New', label_hi: 'Naya', url: '/shop?sort=new' }, { label: 'Offers', label_hi: 'Offers', url: '/shop?offers=1' },
      { label: 'Support', label_hi: 'Support', url: '/contact' },
    ],
    footer: [
      { title: 'Shop', title_hi: 'Shop', links: [{ label: 'All products', label_hi: 'Sab products', url: '/shop' }, { label: 'Track order', label_hi: 'Order track karo', url: '/track' }] },
      { title: 'Help', title_hi: 'Madad', links: [{ label: 'Contact', label_hi: 'Contact', url: '/contact' }, { label: 'FAQ', label_hi: 'FAQ', url: '/faq' }, { label: 'Grievance officer', label_hi: 'Grievance officer', url: '/grievance' }] },
    ],
  },
  search: { popular: [] },
  filters: { price: true, category: true, stock: true, rating: false },
  ui: { card_hover_tilt: true, add_to_cart_fly: true, smooth_scroll: false, sticky_atc: true, back_to_top: true, scroll_progress: true, whatsapp_button: true },
};

let cache = null, cacheAt = 0, ver = -1;
function loadAll() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = jparse(r.value, null);
  return out;
}
function merge(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over === undefined ? base : over;
  if (base && typeof base === 'object' && over && typeof over === 'object') {
    const o = { ...base };
    for (const k of Object.keys(over)) o[k] = k in base ? merge(base[k], over[k]) : over[k];
    return o;
  }
  return over === undefined || over === null ? base : over;
}
function fresh() {
  const t = Date.now();
  if (cache && t - cacheAt < 1500) return cache;
  const saved = loadAll(); const all = {};
  for (const k of Object.keys(DEFAULTS)) all[k] = merge(DEFAULTS[k], saved[k]);
  cache = all; cacheAt = t; return all;
}
const get = key => fresh()[key];
const all = () => fresh();
function set(key, value) {
  if (!(key in DEFAULTS)) throw new Error('Unknown settings group: ' + key);
  db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
    .run(key, JSON.stringify(value), now());
  cache = null;
}
function patch(key, partial) { set(key, merge(get(key), partial)); }
function lastUpdated() { return db.prepare('SELECT MAX(updated_at) m FROM settings').get().m || '0'; }

module.exports = { DEFAULTS, get, all, set, patch, merge, lastUpdated };

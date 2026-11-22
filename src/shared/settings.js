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
    guest_checkout: false, currency: '₹', cart_expiry_days: 14, low_stock_default: 3, show_stock_below: 5,
    recently_viewed: true, wishlist: true, reviews: true, show_sold_out: true, pwa: true,
  },
  payments: {
    upi_enabled: true, upi_id: '', upi_name: 'SURYA', upi_timer_min: 15, upi_grace_min: 15, upi_screenshot: true, upi_unique_paise: true,
    cod_advance_on: false, cod_advance_min_total: 499, cod_advance_mode: 'fixed', cod_advance_value: 99, cod_advance_for: 'all',
    cod_advance_note: 'Your advance is adjusted in the bill and you pay the rest on delivery. If we cancel the order or cannot deliver it, the advance is refunded.',
    cod_enabled: true, cod_fee: 0, cod_min: 0, cod_max: 5000, cod_block_pincodes: [], cod_phone_confirm: true,
    razorpay_enabled: false, razorpay_key_id: '', guest_cod: true,
  },
  shipping: {
    flat: 49, free_above: 499, block_pincodes: [], battery_block_pincodes: [], eta_min: 3, eta_max: 7,
    packaging_fee: 0, gift_enabled: true, gift_price: 29,
    battery_notice: 'This product contains a rechargeable lithium battery. Delivery is by road where required, so some pincodes may be unavailable.',
    courier_options: ['Delhivery', 'Shiprocket', 'India Post', 'DTDC', 'Other'], avg_ship_cost: 60,
  },
  returns: { window_days: 7, default_rule: 'either', auto_review_days: 5, text: 'Damaged or defective products can be replaced or refunded within 7 days of delivery. Please record an unboxing video.' },
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
    placed: {"subject": "✅ Order {{order}} received, thank you!", "body": "Hi {{name}},\n\nThank you for shopping with {{brand}}! 🌟 Your order {{order}} has been received.\n\n🛍️ {{items}}\n💰 Total: {{total}}\n\nWe will confirm it shortly and update you as soon as it ships.\n\n📄 View your order: {{order_link}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "✅ *Order mil gaya!*\n\nHi {{name}} 👋 {{brand}} se order karne ke liye shukriya 🌟\n\n🛍️ {{items}}\n💰 Total: {{total}}\n🧾 Order no: {{order}}\n\nHum jaldi confirm karke aapko batayenge.\n\n📄 Order dekhein: {{order_link}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    payment_pending: {"subject": "💳 Complete your payment for order {{order}}", "body": "Hi {{name}},\n\nThank you for choosing {{brand}}! 🌟 To confirm order {{order}}, please pay {{total}} by UPI and share the transaction ID on the order page.\n\n🛍️ {{items}}\n⏳ Your items are reserved for you.\n\n📄 Pay and confirm here: {{order_link}}\n🔎 Product: {{product_link}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "💳 *Payment baaki hai*\n\nHi {{name}} 👋 order {{order}} confirm karne ke liye {{total}} UPI se pay karein aur transaction ID order page par bhej dein.\n\n🛍️ {{items}}\n⏳ Aapka saaman aapke liye roka hua hai.\n\n📄 Pay karein: {{order_link}}\n🔎 Product: {{product_link}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    cod_advance: {"subject": "💳 Confirm your order {{order}} with a small advance", "body": "Hi {{name}},\n\nThank you for choosing {{brand}}! 🌟 To confirm your cash-on-delivery order {{order}}, please pay the {{advance}} advance by UPI. The remaining {{balance}} is payable on delivery.\n\n🛍️ {{items}}\n⏳ Your items are reserved for you.\n\n📄 Pay the advance here: {{order_link}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "💳 *Advance se order confirm karein*\n\nHi {{name}} 👋 COD order {{order}} confirm karne ke liye {{advance}} advance UPI se pay karein. Baaki {{balance}} delivery par dena hai.\n\n🛍️ {{items}}\n⏳ Aapka saaman roka hua hai.\n\n📄 Advance yahan dein: {{order_link}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    confirmed: {"subject": "✅ Order {{order}} is confirmed", "body": "Hi {{name}},\n\nGreat news! ✅ Your order {{order}} is confirmed and we are getting it ready.\n\n🛍️ {{items}}\n💰 Total: {{total}}\n\nWe will message you as soon as it ships.\n\n📄 Order details: {{order_link}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "✅ *Order confirm ho gaya!*\n\nHi {{name}} 👋 aapka order {{order}} confirm hai, hum use taiyaar kar rahe hain.\n\n🛍️ {{items}}\n💰 Total: {{total}}\n\nShip hote hi aapko batayenge.\n\n📄 Order dekhein: {{order_link}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    packed: {"subject": "📦 Order {{order}} is packed", "body": "Hi {{name}},\n\nYour order {{order}} is packed with care 📦 and will be handed to the courier shortly.\n\n🛍️ {{items}}\n\n📄 Order details: {{order_link}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "📦 *Order pack ho gaya!*\n\nHi {{name}} 👋 aapka order {{order}} achhe se pack ho gaya hai, jaldi hi courier ko diya jayega.\n\n🛍️ {{items}}\n\n📄 Order dekhein: {{order_link}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    shipped: {"subject": "🚚 Order {{order}} is on its way", "body": "Hi {{name}},\n\nGood news! 🚚 Your order {{order}} has been shipped.\n\n🛍️ {{items}}\n🚛 Courier: {{courier}}\n🔖 Tracking no: {{tracking}}\n\n📍 Track your parcel: {{track_url}}\n📄 Order details: {{order_link}}\n\nDelivery usually takes a few days. Please keep your phone nearby.\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "🚚 *Order ship ho gaya!*\n\nHi {{name}} 👋 aapka order {{order}} bhej diya gaya hai.\n\n🛍️ {{items}}\n🚛 Courier: {{courier}}\n🔖 Tracking no: {{tracking}}\n\n📍 Parcel track karein: {{track_url}}\n📄 Order dekhein: {{order_link}}\n\nAam taur par kuch din lagte hain. Phone paas rakhiye.\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    delivered: {"subject": "🎉 Order {{order}} has been delivered", "body": "Hi {{name}},\n\nYour order {{order}} has been delivered 🎉 We hope you love it!\n\n🛍️ {{items}}\n\n⭐ Loved it? Please share a quick review: {{review_url}}\n🔁 If something is not right, reply here within {{days}} days and we will help.\n🔎 Product page: {{product_link}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "🎉 *Order deliver ho gaya!*\n\nHi {{name}} 👋 aapka order {{order}} pahunch gaya hai. Umeed hai pasand aaya hoga!\n\n🛍️ {{items}}\n\n⭐ Pasand aaya? Chhota sa review dein: {{review_url}}\n🔁 Kuch theek na ho to {{days}} din ke andar yahin batayein, hum madad karenge.\n🔎 Product: {{product_link}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    cancelled: {"subject": "❌ Order {{order}} was cancelled", "body": "Hi {{name}},\n\nWe are sorry, your order {{order}} has been cancelled. {{reason}}\n\n🛍️ {{items}}\n💸 If you had paid anything, it will be returned to you. We will keep you updated.\n\n🔁 Order again whenever you like: {{product_link}}\n📄 Order details: {{order_link}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "❌ *Order cancel ho gaya*\n\nHi {{name}} 👋 maaf kijiye, aapka order {{order}} cancel ho gaya hai. {{reason}}\n\n🛍️ {{items}}\n💸 Agar aapne payment kiya tha to wo aapko wapas milega, hum aapko batate rahenge.\n\n🔁 Dobara order karne ke liye: {{product_link}}\n📄 Order dekhein: {{order_link}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    payment_rejected: {"subject": "⚠️ We could not find your payment for order {{order}}", "body": "Hi {{name}},\n\nWe could not match your payment for order {{order}} yet. Please check the transaction ID and send it again, or reply here and we will sort it out quickly.\n\n🛍️ {{items}}\n💰 Amount: {{total}}\n\n📄 Send the transaction ID here: {{order_link}}\n🔎 Product: {{product_link}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "⚠️ *Payment match nahi hua*\n\nHi {{name}} 👋 order {{order}} ka payment hum abhi match nahi kar paye. Transaction ID dobara check karke bhej dein, ya yahin reply karein, hum jaldi dekh lenge.\n\n🛍️ {{items}}\n💰 Amount: {{total}}\n\n📄 ID yahan bhejein: {{order_link}}\n🔎 Product: {{product_link}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    refunded: {"subject": "💸 Your refund for order {{order}} is on its way", "body": "Hi {{name}},\n\nYour refund for order {{order}} has been started 💸 It should reach you in about 5 to 7 working days.\n\n🛍️ {{items}}\n\nThank you for your patience and trust.\n🔁 Shop again anytime: {{product_link}}\n📄 Order details: {{order_link}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "💸 *Refund shuru ho gaya*\n\nHi {{name}} 👋 order {{order}} ka refund shuru ho gaya hai, lagbhag 5 se 7 working din me aapko mil jayega.\n\n🛍️ {{items}}\n\nSabr aur bharose ke liye shukriya 🙏\n🔁 Dobara dekhein: {{product_link}}\n📄 Order dekhein: {{order_link}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    review_request: {"subject": "⭐ How was your order {{order}}?", "body": "Hi {{name}},\n\nWe hope you are enjoying your {{brand}} purchase. A quick review means a lot to a small brand like ours. Thank you! 🙏\n\n🛍️ {{items}}\n\n⭐ Write a review: {{review_url}}\n🔎 Product page: {{product_link}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "⭐ *Aapka review chahiye*\n\nHi {{name}} 👋 umeed hai {{brand}} ka product aapko pasand aa raha hai. Ek chhota sa review hamare jaise chhote brand ke liye bahut maayne rakhta hai 🙏\n\n🛍️ {{items}}\n\n⭐ Review likhein: {{review_url}}\n🔎 Product: {{product_link}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
    back_in_stock: {"subject": "🔔 {{product}} is back in stock", "body": "Good news! 🔔 {{product}} is available again. Grab yours before it sells out.\n\n🔎 {{url}}\n\n💬 Need help? Reach us on {{support}}\n— Team {{brand}}", "wa": "🔔 *Wapas stock me aa gaya!*\n\n{{product}} dobara available hai. Khatam hone se pehle le lein 🙌\n\n🔎 {{url}}\n\n💬 Madad chahiye? {{support}}\n— Team {{brand}}"},
  },
  push: { order: true, payment: true, cancel: true, ret: true, stock: true, contact: true, review: true, customer: true, lock_hide: false },
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

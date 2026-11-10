'use strict';
// Starter setup: fills the empty parts of a new store with sensible content. Safe to run again (it never overwrites your edits).
//   npm run starter                  adds FAQs, banner text, SEO text, home sections, and DRAFT product ideas
//   npm run starter -- --remove-demo moves the "(Demo)" sample products to the trash
// It does NOT invent your business details, prices, photos, UPI ID, certificates or customer reviews.
require('../src/shared/seed').ensureBaseline();
const db = require('../src/shared/db');
const settings = require('../src/shared/settings');
const catalog = require('../src/shared/catalog');
const { now, uniqueSlug } = require('../src/shared/util');
const ts = now();
const log = m => console.log('  ' + m);

if (process.argv.includes('--remove-demo')) {
  const r = db.prepare("UPDATE products SET deleted_at=?, status='draft' WHERE name LIKE '%(Demo)%' AND deleted_at IS NULL").run(ts);
  catalog.reindexAll(); log(`${r.changes} demo product(s) moved to trash (Admin > Products > Trash to restore).`);
  process.exit(0);
}

// 1) FAQ
if (!db.prepare('SELECT 1 FROM faqs LIMIT 1').get()) {
  const F = [
    ['How long does delivery take?', 'Usually 4 to 8 days after we pack your order. You see the exact estimate for your pincode on the product page.', 'Delivery mein kitna time lagta hai?', 'Aam taur par order pack hone ke baad 4 se 8 din. Aapke pincode ka estimate product page par dikhta hai.'],
    ['How do I pay?', 'Pay by UPI (scan the QR or open your UPI app, then send us the transaction ID) or choose cash on delivery where it is available.', 'Payment kaise karun?', 'UPI se (QR scan karo ya UPI app kholo, phir transaction ID bhejo) ya jahan available ho wahan cash on delivery.'],
    ['When is my UPI payment confirmed?', 'After you send the transaction ID we check it in our bank account and confirm your order. This usually happens within a few hours during support timing.', 'UPI payment kab confirm hota hai?', 'Transaction ID bhejne ke baad hum bank mein check karke order confirm karte hain. Support timing ke dauran aam taur par kuch ghanton mein.'],
    ['Can I return a product?', 'If your product arrives damaged or defective, tell us within 7 days of delivery with photos and we will replace it or refund you. We do not take returns for change of mind.', 'Kya product return ho sakta hai?', 'Agar product damaged ya defective aaye, delivery ke 7 din ke andar photos ke saath bata do, hum replace ya refund karenge. Pasand na aane par return nahi liya jaata.'],
    ['How do I track my order?', 'Open Track order, enter your order number and phone number. We also message you when your order is packed and shipped.', 'Order track kaise karun?', 'Track order kholo, order number aur phone number daalo. Pack aur ship hone par hum message bhi bhejte hain.'],
    ['Can I cancel my order?', 'Yes, before it is shipped. Open Track order and press Cancel, or contact support.', 'Kya order cancel ho sakta hai?', 'Haan, ship hone se pehle. Track order mein Cancel dabao ya support se baat karo.'],
    ['Is it safe to use products with batteries?', 'Follow the safety instructions on the product page. Charge only with the cable provided, never leave a charging product unattended, and keep it away from children.', 'Battery wale products safe hain?', 'Product page ke safety instructions follow karo. Sirf diye gaye cable se charge karo, charge hote waqt akela mat chhodo, bachchon se door rakho.'],
    ['How do I contact you?', 'Use the Support page: call, WhatsApp or send a message. Complaints get a reply within 48 hours.', 'Aapse baat kaise karun?', 'Support page par call, WhatsApp ya message bhejo. Complaint ka jawab 48 ghante ke andar milta hai.'],
  ];
  F.forEach(([q, a, qh, ah], i) => db.prepare('INSERT INTO faqs(q,a,q_hi,a_hi,sort,active) VALUES(?,?,?,?,?,1)').run(q, a, qh, ah, i));
  log(`${F.length} FAQs added.`);
}

// 2) Home: show the FAQ block
const home = settings.get('home');
let changed = false;
for (const s of home.sections) if (s.type === 'faq' && !s.enabled) { s.enabled = true; changed = true; }
if (changed) { settings.set('home', home); log('FAQ section turned on for the home page.'); }

// 3) A plain text banner (add your own photo banner later)
if (!db.prepare('SELECT 1 FROM banners LIMIT 1').get()) {
  db.prepare("INSERT INTO banners(title,title_hi,subtitle,subtitle_hi,cta_text,cta_url,theme,sort,active) VALUES(?,?,?,?,?,?,?,0,1)")
    .run('Everyday gadgets for home, kitchen and car', 'Ghar, kitchen aur car ke liye kaam ki cheezein', 'Pay by UPI or cash on delivery. 7-day replacement if it arrives damaged.', 'UPI ya cash on delivery. Damaged aaye to 7 din mein replacement.', 'Shop', '/shop', 'light');
  log('Home banner text added (you can add a photo to it in Admin > Banners).');
}

// 4) SEO text
const seo = settings.get('seo');
const brand = settings.get('brand');
if (!seo.description) {
  seo.title = seo.title && seo.title !== 'SURYA' ? seo.title : `${brand.name || 'SURYA'} | Useful gadgets for home, kitchen and car`;
  seo.description = `Shop useful gadgets for home, kitchen and car at ${brand.name || 'SURYA'}. UPI and cash on delivery, delivery across India, 7-day replacement for damaged items.`;
  settings.set('seo', seo); log('Google title and description set.');
}

// 5) DRAFT product ideas (no price, no photos, so they cannot go live by mistake)
const cats = Object.fromEntries(db.prepare('SELECT id,name FROM categories').all().map(c => [c.name, c.id]));
const IDEAS = [
  ['ARC USB Rechargeable Lighter', 'Gadgets', 'Flameless USB rechargeable arc lighter.', ['arc lighter', 'usb lighter', 'rechargeable lighter'], { battery: 1, electronic: 1 }],
  ['Portable Mini Blender Bottle', 'Kitchen', 'USB rechargeable portable blender bottle for shakes and juices.', ['mini blender', 'juicer bottle', 'portable blender'], { battery: 1, electronic: 1 }],
  ['USB Electric Vegetable Chopper', 'Kitchen', 'Rechargeable mini chopper for onion, garlic and chilli.', ['chopper', 'garlic chopper', 'vegetable cutter'], { battery: 1, electronic: 1, blade: 1 }],
  ['Digital Kitchen Weighing Scale', 'Kitchen', 'Compact digital scale for kitchen use.', ['kitchen scale', 'weighing scale'], { electronic: 1 }],
  ['Silicone Kitchen Utensil Set', 'Kitchen', 'Heat-resistant silicone spoons and spatulas.', ['silicone spatula', 'kitchen tools'], {}],
  ['Airtight Food Storage Containers Set', 'Kitchen', 'Set of airtight containers for kitchen and fridge.', ['storage containers', 'airtight box'], {}],
  ['Magnetic Car Phone Holder', 'Car & Bike', 'Dashboard magnetic phone holder for the car.', ['car phone holder', 'magnetic holder'], {}],
  ['Handheld Car Vacuum Cleaner', 'Car & Bike', 'Small vacuum cleaner for car interior.', ['car vacuum', 'handheld vacuum'], { electronic: 1 }],
  ['Bike Phone Mount', 'Car & Bike', 'Handlebar phone mount for bikes and scooters.', ['bike phone holder', 'handlebar mount'], {}],
  ['USB LED Strip Lights', 'Home & Decor', 'USB powered LED strip for room, desk or TV back.', ['led strip', 'room lights'], { electronic: 1 }],
  ['Foldable Storage Organizer', 'Home & Decor', 'Foldable organizer for clothes and daily items.', ['storage organizer', 'wardrobe organizer'], {}],
  ['Self Adhesive Wall Hooks', 'Home & Decor', 'Strong self adhesive hooks for walls and doors.', ['wall hooks', 'adhesive hooks'], {}],
  ['Desk Organizer', 'Home & Decor', 'Desktop organizer for pens, notes and small items.', ['desk organizer', 'pen stand'], {}],
  ['Portable Neck Fan', 'Gadgets', 'Rechargeable hands-free neck fan.', ['neck fan', 'portable fan'], { battery: 1, electronic: 1 }],
  ['Mini Handheld Fan', 'Gadgets', 'Small rechargeable handheld fan.', ['handheld fan', 'mini fan'], { battery: 1, electronic: 1 }],
  ['Cable Organizer Clips', 'Gadgets', 'Clips to keep charging cables in place.', ['cable clips', 'cable organizer'], {}],
  ['Rechargeable Hair Trimmer', 'Personal Care', 'Cordless trimmer for grooming.', ['hair trimmer', 'beard trimmer'], { battery: 1, electronic: 1, blade: 1 }],
  ['Travel Neck Pillow', 'Travel & Outdoor', 'Neck support pillow for travel.', ['neck pillow', 'travel pillow'], {}],
  ['Packing Cubes Set', 'Travel & Outdoor', 'Set of packing cubes for bags and suitcases.', ['packing cubes', 'travel organizer'], {}],
  ['Stainless Steel Water Bottle', 'Travel & Outdoor', 'Reusable stainless steel bottle.', ['water bottle', 'steel bottle'], {}],
];
let added = 0;
for (const [name, cat, desc, tags, f] of IDEAS) {
  if (db.prepare('SELECT 1 FROM products WHERE lower(name)=lower(?)').get(name)) continue;
  const info = db.prepare(`INSERT INTO products(slug,name,tagline,description,category_id,status,price,mrp,cost,stock,has_battery,is_electronic,has_blade,tags,created_at,updated_at)
    VALUES(?,?,?,?,?,'draft',0,0,0,0,?,?,?,?,?,?)`).run(uniqueSlug(db, 'products', name), name, desc, `<p>${desc}</p>`, cats[cat] || null, f.battery || 0, f.electronic || 0, f.blade || 0, JSON.stringify(tags), ts, ts);
  catalog.reindex(info.lastInsertRowid); added++;
}
if (added) log(`${added} DRAFT product ideas added. They have no price or photos, so they stay hidden until you complete them.`);

console.log(`
  Starter setup done. What only you can fill in (Admin):
   1. Settings > Business details: name, address, support phone/WhatsApp, grievance officer (an adult owner)
   2. Settings > Payments: your UPI ID
   3. Each product: price, MRP, stock, photos, country of origin, manufacturer, warranty, safety text, then tick the risk checker items
   4. Policies: have them checked by a CA or lawyer
   5. Reviews and testimonials: only add real ones (none were created)
  Remove the sample products:  npm run starter -- --remove-demo
`);

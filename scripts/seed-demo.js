'use strict';
// Adds DEMO products so you can see how the store looks. Delete them from Admin > Products when you add your real ones.
const fs = require('fs');
const path = require('path');
require('../src/shared/seed').ensureBaseline();
const db = require('../src/shared/db');
const images = require('../src/shared/images');
const catalog = require('../src/shared/catalog');
const settings = require('../src/shared/settings');
const { now, uniqueSlug } = require('../src/shared/util');

const DEMO = [
  { name: 'ARC USB Rechargeable Lighter (Demo)', cat: 'Gadgets', price: 299, mrp: 499, stock: 25, img: ['lighter-green', 'lighter-black', 'lighter-gold'], battery: 1, tag: 'Demo', tagline: 'Windproof arc lighter, charges with USB-C.' },
  { name: 'Matte Black Arc Lighter Pro (Demo)', cat: 'Gadgets', price: 399, mrp: 599, stock: 12, img: ['lighter-black', 'lighter-gold'], battery: 1, tagline: 'Metal body with safety lock.' },
  { name: 'Gold Edition Arc Lighter (Demo)', cat: 'Gadgets', price: 449, mrp: 699, stock: 0, img: ['lighter-gold'], battery: 1, tagline: 'Sold out sample to test Notify me.' },
  { name: 'Steel Water Bottle 750 ml (Demo)', cat: 'Kitchen', price: 349, mrp: 449, stock: 40, img: ['bottle'], tagline: 'Keeps drinks cold for 12 hours.' },
  { name: 'Minimal Wall Clock (Demo)', cat: 'Home & Decor', price: 599, mrp: 799, stock: 9, img: ['clock'], tagline: 'Silent sweep movement.' },
  { name: 'Travel Bottle Set (Demo)', cat: 'Travel & Outdoor', price: 199, mrp: 199, stock: 30, img: ['bottle', 'clock'], tagline: 'Leak-proof, airline friendly.' },
  { name: 'Desk Clock Mini (Demo)', cat: 'Home & Decor', price: 249, mrp: 399, stock: 3, img: ['clock', 'bottle'], tagline: 'Only a few left sample.' },
  { name: 'Car Cup Holder Bottle (Demo)', cat: 'Car & Bike', price: 279, mrp: 349, stock: 18, img: ['bottle'], tagline: 'Fits most car cup holders.' },
];

(async () => {
  const ts = now();
  for (const d of DEMO) {
    if (db.prepare('SELECT 1 FROM products WHERE name=?').get(d.name)) continue;
    const cat = db.prepare('SELECT id FROM categories WHERE name=?').get(d.cat);
    const pid = db.prepare(`INSERT INTO products(slug,name,tagline,description,category_id,status,price,mrp,cost,stock,origin_country,manufacturer,warranty,safety,has_battery,is_electronic,safety_ack,badge,specs,tags,hsn,created_at,updated_at,sold_count,views)
      VALUES(?,?,?,?,?,'published',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      uniqueSlug(db, 'products', d.name), d.name, d.tagline, `<p>${d.tagline} This is a demo product. Replace it with your real product from the admin panel.</p><ul><li>Easy to use</li><li>Good build</li></ul>`, cat && cat.id,
      d.price, d.mrp, Math.round(d.price * 0.4), d.stock, 'India', 'Demo Maker, Delhi', 'No warranty', d.battery ? 'Charge only with the supplied cable. Do not leave charging overnight. Keep away from children.' : null, d.battery ? 1 : 0, d.battery ? 1 : 0, d.battery ? 1 : 0, d.tag || null,
      JSON.stringify([{ k: 'Material', v: 'Metal' }, { k: 'Colour', v: 'As shown' }]), JSON.stringify(['demo']), '', ts, ts, Math.floor(Math.random() * 30), Math.floor(Math.random() * 300)).lastInsertRowid;
    let sort = 0;
    for (const f of d.img) {
      const out = await images.processProductImage(fs.readFileSync(path.join(__dirname, 'demo-img', f + '.webp')));
      db.prepare('INSERT INTO product_images(product_id,file,alt,sort,w,h) VALUES(?,?,?,?,?,?)').run(pid, out.file, d.name, sort++, out.w, out.h);
    }
    catalog.reindex(pid);
  }
  settings.patch('payments', { upi_id: settings.get('payments').upi_id || 'demo@upi' });
  db.prepare("INSERT OR IGNORE INTO coupons(code,type,value,min_cart,active,show_public,description) VALUES('WELCOME10','percent',10,0,1,1,'10% off')").run();
  console.log('Demo products added. Open the website to see them. (Demo UPI ID "demo@upi" was set only if you had none.)');
})();

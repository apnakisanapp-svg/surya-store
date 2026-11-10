'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const cfg = require('./config');
const settings = require('./settings');
const POLICIES = require('./policies-default');
const { now, uniqueSlug } = require('./util');

const COMPLIANCE = [
  ['grievance_officer', 'Appoint a Grievance Officer and show name, designation and contact on the site', 'Consumer Protection (E-Commerce) Rules, 2020: sellers must show the officer\'s details. Acknowledge complaints in 48 hours and resolve them within one month.', 'https://consumeraffairs.nic.in/acts-and-rules/consumer-protection'],
  ['legal_identity', 'Show legal business name, address and customer-care details', 'Fill Admin > Settings > Business. These appear in the footer, invoices and policy pages.', ''],
  ['product_disclosures', 'Every product shows price, country of origin, manufacturer/importer, return/refund terms and warranty', 'The product form blocks publishing until these are filled.', ''],
  ['policies_review', 'Have a lawyer review Terms, Privacy, Returns and Shipping policies', 'The built-in texts are drafts. Edit them for your business and get them checked before launch.', ''],
  ['dpdp', 'Data protection (DPDP Act, 2023 and Rules, 2025): plain-language notice, separate consent, easy withdrawal, breach plan', 'The store already records consent separately and offers data export/deletion. Core duties apply in phases up to 2027, so prepare early.', 'https://www.meity.gov.in/'],
  ['bis_check', 'Check BIS (CRS) registration for each electronic product', 'Some electronic and IT products cannot be sold in India without BIS registration. Check the official list or ask a consultant.', 'https://www.bis.gov.in/'],
  ['courier_battery', 'Get written confirmation from your courier for battery (lithium) products', 'Ask which mode (road/air) is used, any extra charge, and which pincodes are not served. Add blocked pincodes in Admin > Shipping.', ''],
  ['gst_decision', 'Ask a CA: do you need GST registration for your turnover and selling model?', 'Rules depend on turnover and where you sell. Turn GST on in Admin > Settings > Business once registered.', ''],
  ['business_account', 'Use a current/business bank account and a business UPI ID', 'Mixing personal and business money can cause bank flags and tax confusion.', ''],
  ['gateway_docs', 'If you use a payment gateway (e.g. Razorpay): keep PAN, bank account and business proof ready', 'Not needed for manual UPI.', ''],
  ['legal_metrology', 'Packed goods: MRP, net quantity, manufacturer/importer address and date of manufacture/import on the pack', 'Legal Metrology (Packaged Commodities) rules. Ask your supplier or a consultant what applies.', ''],
  ['ads_policy', 'Check Google and Meta ad policies for your products (lighters, batteries)', 'Some products need approval or are not allowed in ads.', ''],
  ['trademark', 'Search the trademark register for your brand name before spending on branding', 'A lawyer can tell you the right classes for your products.', 'https://ipindia.gov.in/'],
  ['liability', 'Ask about product liability insurance for battery/ignition products', '', ''],
  ['test_orders', 'Place test orders: UPI, COD, cancel, replacement', 'Do a Rs 1 UPI test with your own phone.', ''],
  ['backup_restore', 'Download a backup and test restoring it once', 'Admin > Backup.', ''],
  ['uptime', 'Set up an uptime alert (free monitor) for the website', '', ''],
  ['domain_ssl', 'Domain, HTTPS, www redirect and email sender records (SPF/DKIM)', '', ''],
  ['monthly_rules', 'Re-check courier, gateway, BIS and consumer-law rules once a month', 'Rules change. Set a reminder.', ''],
];

const CATEGORIES = [['Gadgets', 'Gadgets'], ['Kitchen', 'Kitchen'], ['Home & Decor', 'Ghar aur decor'], ['Car & Bike', 'Car aur bike'], ['Personal Care', 'Personal care'], ['Travel & Outdoor', 'Travel aur outdoor']];

function ensureBaseline() {
  const ts = now(); let created = null;
  // policies
  for (const p of POLICIES) {
    if (!db.prepare('SELECT 1 FROM policies WHERE slug=?').get(p.slug)) {
      db.prepare('INSERT INTO policies(slug,title,title_hi,body,body_hi,version,protected,updated_at,sort,in_footer) VALUES(?,?,?,?,?,1,?,?,?,?)')
        .run(p.slug, p.title, p.title_hi || null, p.body, null, p.protected ? 1 : 0, ts, p.sort || 0, p.in_footer == null ? 1 : p.in_footer);
      db.prepare('INSERT INTO policy_versions(slug,version,title,body,body_hi,created_at) VALUES(?,?,?,?,?,?)').run(p.slug, 1, p.title, p.body, null, ts);
    }
  }
  // compliance
  let i = 0;
  for (const [key, title, detail, url] of COMPLIANCE) {
    db.prepare('INSERT OR IGNORE INTO compliance_items(key,title,detail,source_url,status,sort) VALUES(?,?,?,?,\'todo\',?)').run(key, title, detail, url, i++);
  }
  // categories
  if (!db.prepare('SELECT 1 FROM categories LIMIT 1').get()) {
    CATEGORIES.forEach(([n, h], idx) => db.prepare('INSERT INTO categories(slug,name,name_hi,sort,active) VALUES(?,?,?,?,1)').run(uniqueSlug(db, 'categories', n), n, h, idx));
  }
  // admin account
  if (!db.prepare('SELECT 1 FROM admins LIMIT 1').get()) {
    const email = (cfg.ADMIN_EMAIL || 'owner@surya.local').toLowerCase();
    const pass = cfg.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    db.prepare('INSERT INTO admins(email,name,pass_hash,must_change,created_at) VALUES(?,?,?,?,?)').run(email, 'Owner', bcrypt.hashSync(pass, 11), cfg.ADMIN_PASSWORD ? 0 : 1, ts);
    created = { email, password: cfg.ADMIN_PASSWORD ? '(from .env)' : pass, generated: !cfg.ADMIN_PASSWORD };
  }
  require('./catalog').reindexAll();
  return created;
}

module.exports = { ensureBaseline };

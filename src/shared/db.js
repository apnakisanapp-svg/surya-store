'use strict';
const Database = require('better-sqlite3');
const cfg = require('./config');

const db = new Database(cfg.DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 8000');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS admins(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, pass_hash TEXT NOT NULL,
  must_change INTEGER DEFAULT 0, totp_secret TEXT, totp_enabled INTEGER DEFAULT 0, recovery TEXT,
  failed INTEGER DEFAULT 0, locked_until TEXT, last_login TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions(
  token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  last_seen TEXT, ip TEXT, ua TEXT, pending_2fa INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS login_history(id INTEGER PRIMARY KEY, email TEXT, ok INTEGER, ip TEXT, ua TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity_log(
  id INTEGER PRIMARY KEY, admin_id INTEGER, action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT, ip TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories(
  id INTEGER PRIMARY KEY, parent_id INTEGER, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, name_hi TEXT,
  image TEXT, description TEXT, description_hi TEXT, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
  seo_title TEXT, seo_desc TEXT, deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, sku TEXT, name TEXT NOT NULL, name_hi TEXT,
  tagline TEXT, tagline_hi TEXT, description TEXT, description_hi TEXT,
  category_id INTEGER, tags TEXT DEFAULT '[]', status TEXT DEFAULT 'draft', publish_at TEXT,
  price REAL DEFAULT 0, mrp REAL DEFAULT 0, cost REAL DEFAULT 0, stock INTEGER DEFAULT 0, low_stock_limit INTEGER,
  preorder INTEGER DEFAULT 0, sold_out INTEGER DEFAULT 0, max_per_order INTEGER DEFAULT 10,
  weight_g INTEGER DEFAULT 0, dims TEXT, specs TEXT DEFAULT '[]', safety TEXT, safety_hi TEXT, safety_ack INTEGER DEFAULT 0,
  warranty TEXT, warranty_hi TEXT, origin_country TEXT, manufacturer TEXT, importer TEXT, hsn TEXT, gst_rate REAL DEFAULT 0,
  has_battery INTEGER DEFAULT 0, is_electronic INTEGER DEFAULT 0, has_blade INTEGER DEFAULT 0, is_liquid INTEGER DEFAULT 0,
  is_cosmetic_food INTEGER DEFAULT 0, brand_used TEXT, risk_ack TEXT DEFAULT '{}',
  seo_title TEXT, seo_desc TEXT, video_url TEXT, model_glb TEXT, spin_images TEXT DEFAULT '[]',
  similar_mode TEXT DEFAULT 'auto', similar_ids TEXT DEFAULT '[]', faq TEXT DEFAULT '[]', badge TEXT,
  featured INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, views INTEGER DEFAULT 0, sold_count INTEGER DEFAULT 0,
  packaging_cost REAL, ad_cost REAL, shipping_cost REAL,
  deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);

CREATE TABLE IF NOT EXISTS product_images(
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, variant_id INTEGER, file TEXT NOT NULL, alt TEXT, alt_hi TEXT,
  sort INTEGER DEFAULT 0, focus_x REAL DEFAULT 0.5, focus_y REAL DEFAULT 0.5, w INTEGER, h INTEGER,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pimg ON product_images(product_id, sort);

CREATE TABLE IF NOT EXISTS variants(
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, name TEXT NOT NULL, name_hi TEXT, sku TEXT,
  price REAL, mrp REAL, cost REAL, stock INTEGER DEFAULT 0, image_id INTEGER, color TEXT, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_variants ON variants(product_id);

CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE, phone TEXT, name TEXT, pass_hash TEXT, marketing_optin INTEGER DEFAULT 0,
  blocked INTEGER DEFAULT 0, block_reason TEXT, notes TEXT, ref_code TEXT, created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cust_phone ON customers(phone);
CREATE TABLE IF NOT EXISTS customer_sessions(token_hash TEXT PRIMARY KEY, customer_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY, customer_id INTEGER NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS addresses(
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, label TEXT, name TEXT, phone TEXT, line1 TEXT, line2 TEXT,
  landmark TEXT, pincode TEXT, city TEXT, state TEXT, is_default INTEGER DEFAULT 0,
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS wishlist(customer_id INTEGER NOT NULL, product_id INTEGER NOT NULL, created_at TEXT, PRIMARY KEY(customer_id, product_id));

CREATE TABLE IF NOT EXISTS coupons(
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, type TEXT DEFAULT 'percent', value REAL DEFAULT 0, min_cart REAL DEFAULT 0,
  max_discount REAL, starts_at TEXT, expires_at TEXT, usage_limit INTEGER, used_count INTEGER DEFAULT 0, per_customer INTEGER,
  product_ids TEXT DEFAULT '[]', category_ids TEXT DEFAULT '[]', first_order_only INTEGER DEFAULT 0,
  free_shipping INTEGER DEFAULT 0, active INTEGER DEFAULT 1, show_public INTEGER DEFAULT 0, description TEXT, deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY, number TEXT UNIQUE NOT NULL, customer_id INTEGER, email TEXT, phone TEXT NOT NULL, name TEXT NOT NULL,
  address TEXT NOT NULL, status TEXT NOT NULL, payment_method TEXT NOT NULL, payment_status TEXT NOT NULL,
  utr TEXT, payment_screenshot TEXT, subtotal REAL, discount REAL DEFAULT 0, coupon_code TEXT, shipping REAL DEFAULT 0,
  cod_fee REAL DEFAULT 0, gift_fee REAL DEFAULT 0, gst_amount REAL DEFAULT 0, total REAL NOT NULL,
  gift TEXT, customer_note TEXT, internal_note TEXT, courier TEXT, tracking_no TEXT, tracking_url TEXT,
  risky INTEGER DEFAULT 0, risk_reason TEXT, cod_confirmed INTEGER DEFAULT 0, cod_confirmed_at TEXT,
  placed_at TEXT NOT NULL, expires_at TEXT, confirmed_at TEXT, shipped_at TEXT, delivered_at TEXT, cancelled_at TEXT, cancel_reason TEXT,
  stock_released INTEGER DEFAULT 0, ip TEXT, ua TEXT, lang TEXT, access_token TEXT NOT NULL, invoice_no TEXT, ship_cost REAL,
  has_battery INTEGER DEFAULT 0, review_asked INTEGER DEFAULT 0, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, placed_at);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_cust ON orders(customer_id);

CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, product_id INTEGER, variant_id INTEGER, name TEXT, variant_name TEXT, sku TEXT,
  qty INTEGER NOT NULL, price REAL NOT NULL, mrp REAL, cost REAL DEFAULT 0, image TEXT, gst_rate REAL DEFAULT 0, hsn TEXT,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, status TEXT, note TEXT, actor TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS order_requests(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, type TEXT NOT NULL, reason TEXT, photos TEXT DEFAULT '[]', status TEXT DEFAULT 'open',
  admin_note TEXT, created_at TEXT NOT NULL, resolved_at TEXT,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS refunds(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, amount REAL NOT NULL, method TEXT, ref TEXT, note TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);

CREATE TABLE IF NOT EXISTS policies(
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, title_hi TEXT, body TEXT NOT NULL, body_hi TEXT,
  version INTEGER DEFAULT 1, protected INTEGER DEFAULT 0, updated_at TEXT NOT NULL, sort INTEGER DEFAULT 0, in_footer INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS policy_versions(id INTEGER PRIMARY KEY, slug TEXT NOT NULL, version INTEGER NOT NULL, title TEXT, body TEXT, body_hi TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS consents(
  id INTEGER PRIMARY KEY, customer_id INTEGER, order_id INTEGER, email TEXT, phone TEXT, kind TEXT NOT NULL, policy_slug TEXT, policy_version INTEGER,
  accepted INTEGER DEFAULT 1, ip_hash TEXT, ua TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consents_order ON consents(order_id);

CREATE TABLE IF NOT EXISTS banners(
  id INTEGER PRIMARY KEY, title TEXT, title_hi TEXT, subtitle TEXT, subtitle_hi TEXT, cta_text TEXT, cta_text_hi TEXT, cta_url TEXT,
  image TEXT, image_mobile TEXT, product_id INTEGER, theme TEXT DEFAULT 'dark', starts_at TEXT, ends_at TEXT, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS testimonials(id INTEGER PRIMARY KEY, name TEXT, city TEXT, text TEXT, text_hi TEXT, rating INTEGER DEFAULT 5, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS faqs(id INTEGER PRIMARY KEY, q TEXT, a TEXT, q_hi TEXT, a_hi TEXT, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, customer_id INTEGER, order_id INTEGER, name TEXT, rating INTEGER NOT NULL,
  title TEXT, body TEXT, photos TEXT DEFAULT '[]', verified INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', reply TEXT, flagged INTEGER DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews ON reviews(product_id, status);
CREATE TABLE IF NOT EXISTS contact_messages(
  id INTEGER PRIMARY KEY, kind TEXT DEFAULT 'contact', name TEXT, email TEXT, phone TEXT, order_number TEXT, subject TEXT, message TEXT,
  status TEXT DEFAULT 'open', reply TEXT, ack_due_at TEXT, acked_at TEXT, resolve_due_at TEXT, resolved_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notify_requests(id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, variant_id INTEGER, contact TEXT NOT NULL, created_at TEXT NOT NULL, notified INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS newsletter(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS search_log(id INTEGER PRIMARY KEY, term TEXT, results INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS product_events(id INTEGER PRIMARY KEY, type TEXT NOT NULL, product_id INTEGER, sid TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pev ON product_events(type, created_at);
CREATE TABLE IF NOT EXISTS redirects(id INTEGER PRIMARY KEY, from_path TEXT UNIQUE NOT NULL, to_path TEXT NOT NULL, code INTEGER DEFAULT 301);

CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, city TEXT, url TEXT, rating INTEGER DEFAULT 3,
  payment_terms TEXT, min_order TEXT, notes TEXT, bad_pieces INTEGER DEFAULT 0, created_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS supplier_quotes(id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL, product_id INTEGER, item TEXT, rate REAL NOT NULL, qty_min INTEGER DEFAULT 1,
  freight_unit REAL DEFAULT 0, duty_pct REAL DEFAULT 0, other_unit REAL DEFAULT 0, quoted_at TEXT NOT NULL, delivery_days INTEGER, notes TEXT);
CREATE TABLE IF NOT EXISTS purchases(
  id INTEGER PRIMARY KEY, supplier_id INTEGER, product_id INTEGER NOT NULL, variant_id INTEGER, qty INTEGER NOT NULL, rate REAL NOT NULL,
  gst_pct REAL DEFAULT 0, freight REAL DEFAULT 0, duty REAL DEFAULT 0, other REAL DEFAULT 0, unit_landed REAL NOT NULL, qty_left INTEGER NOT NULL,
  bad_qty INTEGER DEFAULT 0, invoice_no TEXT, notes TEXT, purchased_at TEXT NOT NULL, add_stock INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY, category TEXT, amount REAL NOT NULL, note TEXT, spent_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS compliance_items(
  id INTEGER PRIMARY KEY, key TEXT UNIQUE, title TEXT NOT NULL, detail TEXT, source_url TEXT, status TEXT DEFAULT 'todo',
  checked_at TEXT, due_at TEXT, notes TEXT, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS outbox(
  id INTEGER PRIMARY KEY, channel TEXT NOT NULL, to_addr TEXT, subject TEXT, body TEXT, link TEXT, status TEXT DEFAULT 'queued',
  order_id INTEGER, kind TEXT, error TEXT, created_at TEXT NOT NULL, sent_at TEXT
);
CREATE TABLE IF NOT EXISTS jobs_state(key TEXT PRIMARY KEY, value TEXT);
`;
db.exec(SCHEMA);

// FTS5 for storefront search (rebuilt per product on save)
db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(name, name_hi, tagline, description, tags, category, tokenize='unicode61 remove_diacritics 2', prefix='2 3 4');`);

try { db.exec('ALTER TABLE orders ADD COLUMN upi_adjust REAL DEFAULT 0'); } catch { /* already there */ }
try { db.exec("ALTER TABLE products ADD COLUMN pay_rule TEXT DEFAULT ''"); } catch { /* already there */ }
/* per-product services & rules (blank = follow Settings) */
for (const c of ["adv_type TEXT DEFAULT ''", 'adv_value REAL', "gift_rule TEXT DEFAULT ''", 'gift_price REAL', "ret_rule TEXT DEFAULT ''", 'ret_days INTEGER', "ship_rule TEXT DEFAULT ''"]) { try { db.exec('ALTER TABLE products ADD COLUMN ' + c); } catch { /* already there */ } }
for (const c of ["ret_rule TEXT DEFAULT ''", 'ret_days INTEGER']) { try { db.exec('ALTER TABLE order_items ADD COLUMN ' + c); } catch { /* already there */ } }
try { db.exec('ALTER TABLE customers ADD COLUMN first_name TEXT'); } catch { /* already there */ }
try { db.exec('ALTER TABLE customers ADD COLUMN last_name TEXT'); } catch { /* already there */ }
for (const c of ['advance_amount REAL DEFAULT 0', 'advance_pay REAL DEFAULT 0', 'advance_status TEXT']) { try { db.exec('ALTER TABLE orders ADD COLUMN ' + c); } catch { /* already there */ } }
db.exec(`CREATE TABLE IF NOT EXISTS otp_codes(id INTEGER PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER DEFAULT 0, used INTEGER DEFAULT 0, created_at TEXT NOT NULL)`);
db.exec('CREATE INDEX IF NOT EXISTS otp_email ON otp_codes(email, id)');
try { db.exec('ALTER TABLE customers ADD COLUMN email_verified INTEGER DEFAULT 0'); } catch { /* already there */ }

const tx = fn => db.transaction(fn);
module.exports = db;
module.exports.tx = tx;

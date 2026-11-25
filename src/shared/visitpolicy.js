'use strict';
// Adds a short "visit counting" section to the Cookie and Privacy policies (once). Never touches a policy the owner has already edited, unless asked.
const db = require('./db');
const { now } = require('./util');
const DEFAULTS = (() => { try { return require('./policies-default'); } catch { return []; } })();

const COOKIE_BLOCK = '<div data-visits="1"><h2>Visit counting (analytics)</h2><p>If you press Accept, we count visits anonymously to learn which pages and products are popular and which reel, Short or link brought visitors. We note the pages you open, how long they stay open, how far you scroll, the type of device and the website or link you came from. We do not save your name, phone number, address or IP address for this, and we never read what you type. If you are logged in, the shop owner can see which pages you opened. Press Reject (or use "Cookie settings" in the footer) and the shop works the same, without this counting.</p></div>';
const PRIVACY_BLOCK = '<div data-visits="1"><h2>Visit counting</h2><p>With your permission (Accept on the cookie banner) we keep anonymous visit records: pages opened, time spent, device type and the link you arrived from. For logged-in customers the owner can also see which pages that account opened. Records older than 180 days are deleted. See the Cookie Policy.</p></div>';
const BLOCKS = { cookies: COOKIE_BLOCK, privacy: PRIVACY_BLOCK };

function status() {
  const out = {};
  for (const slug of Object.keys(BLOCKS)) { const p = db.prepare('SELECT body FROM policies WHERE slug=?').get(slug); out[slug] = p ? /data-visits/.test(p.body || '') : null; }
  return out;
}
/** force=false: only policies still equal to the original text. force=true (owner pressed the button): any policy that does not have the section yet. */
function ensure(force) {
  const done = [];
  for (const [slug, block] of Object.entries(BLOCKS)) {
    const p = db.prepare('SELECT * FROM policies WHERE slug=?').get(slug);
    if (!p || /data-visits/.test(p.body || '')) continue;
    const orig = DEFAULTS.find(d => d.slug === slug);
    if (!force && !(orig && String(p.body) === String(orig.body))) continue;
    const body = String(p.body || '') + '\n' + block, ver = (p.version || 1) + 1, ts = now();
    db.prepare('UPDATE policies SET body=?, version=?, updated_at=? WHERE slug=?').run(body, ver, ts, slug);
    db.prepare('INSERT INTO policy_versions(slug,version,title,body,body_hi,created_at) VALUES(?,?,?,?,?,?)').run(slug, ver, p.title, body, p.body_hi || null, ts);
    done.push(slug);
  }
  return done;
}
module.exports = { ensure, status };

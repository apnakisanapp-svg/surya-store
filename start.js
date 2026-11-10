'use strict';
// One command starts both programs: the customer website and the separate admin panel.
const cfg = require('./shared/config');
const cloudsync = require('./shared/cloudsync');

async function main() {
  console.log('\n  SURYA store starting...\n');
  await cloudsync.restore(); // must run before the database file is opened
  const db = require('./shared/db');
  const seed = require('./shared/seed');
  const orders = require('./shared/orders');
  const auth = require('./shared/auth');
  const mail = require('./shared/mail');
  const settings = require('./shared/settings');
  const { now } = require('./shared/util');
  const { makeBackup } = require('./admin/routes-core');
  const created = seed.ensureBaseline();
  const pub = await require('./public/server').start();
  const adm = await require('./admin/server').start();
  if (created) {
    console.log('\n  ┌─ FIRST RUN: admin login ─────────────────────────────');
    console.log(`  │ Email    : ${created.email}`);
    console.log(`  │ Password : ${created.password}`);
    console.log('  │ You must change this password after the first login.');
    console.log('  └───────────────────────────────────────────────────────\n');
  }
  // background jobs
  const safe = (name, fn) => async () => { try { await fn(); } catch (e) { console.error(`[job ${name}]`, e.message); } };
  setInterval(safe('expire', () => { const n = orders.expireUnpaid(); if (n) console.log(`  ${n} unpaid UPI order(s) cancelled and stock released`); }), 60 * 1000);
  setInterval(safe('sessions', () => auth.cleanupSessions()), 60 * 60 * 1000);
  setInterval(safe('review-ask', () => {
    const days = settings.get('returns').auto_review_days;
    const rows = db.prepare("SELECT * FROM orders WHERE status='delivered' AND review_asked=0 AND delivered_at<?").all(new Date(Date.now() - days * 86400000).toISOString());
    for (const o of rows) { mail.queueOrderMessage(o, 'review_request'); db.prepare('UPDATE orders SET review_asked=1 WHERE id=?').run(o.id); }
  }), 30 * 60 * 1000);
  const dailyBackup = safe('backup', async () => {
    const last = db.prepare("SELECT value FROM jobs_state WHERE key='last_backup'").get();
    if (!last || Date.now() - new Date(last.value).getTime() > 24 * 3600e3) {
      await makeBackup();
      db.prepare("INSERT INTO jobs_state(key,value) VALUES('last_backup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(now());
      console.log('  Daily backup saved to data/backups');
    }
  });
  setTimeout(dailyBackup, 15000); setInterval(dailyBackup, 3600e3);
  const sync = cloudsync.start(db);
  const stop = async () => { console.log('\n  Stopping...'); pub.close(); adm.close(); await sync.stop(); try { db.close(); } catch { /* */ } process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch(e => { console.error(e); process.exit(1); });

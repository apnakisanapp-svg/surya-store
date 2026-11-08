'use strict';
// Free-hosting helper: keeps the database and uploaded photos in a PRIVATE GitHub repository,
// so they survive when a free host wipes its disk.
//   SYNC_REPO=owner/repo  SYNC_TOKEN=github token  SYNC_MODE=push (default) | pull  SYNC_BRANCH=main
// push: this server is the master. It saves every few minutes and on shutdown.
// pull: this server is a read-only copy (e.g. a free demo site). It loads the data at start and
//       restarts itself when newer data is found, so changes made on your PC show up here.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const cfg = require('./config');

const REPO = process.env.SYNC_REPO || '', TOKEN = process.env.SYNC_TOKEN || '', BRANCH = process.env.SYNC_BRANCH || 'main';
const MODE = process.env.SYNC_MODE === 'pull' ? 'pull' : 'push';
const enabled = !!(REPO && TOKEN);
const DB_PATH = 'data/surya.db.gz';
let dbShaAtBoot = null, busy = false;

const gh = async (p, { method = 'GET', body, raw } = {}) => {
  const r = await fetch(`${process.env.SYNC_API || 'https://api.github.com'}/repos/${REPO}${p}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { authorization: `Bearer ${TOKEN}`, accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'surya-store-sync', ...(body ? { 'content-type': 'application/json' } : {}) },
  });
  if (raw) { if (!r.ok) throw new Error(`GitHub ${r.status} on ${p}`); return Buffer.from(await r.arrayBuffer()); }
  const t = await r.text(); let d = null; try { d = JSON.parse(t); } catch { /* */ }
  if (!r.ok) { const e = new Error(`GitHub ${r.status}: ${(d && d.message) || t.slice(0, 100)}`); e.status = r.status; throw e; }
  return d;
};
const gitSha = buf => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
async function remoteTree() {
  try { const d = await gh(`/git/trees/${encodeURIComponent(BRANCH)}?recursive=1`); const m = new Map(); for (const t of d.tree || []) if (t.type === 'blob') m.set(t.path, t.sha); m.treeSha = d.sha; return m; }
  catch (e) { if (e.status === 404 || e.status === 409) { const m = new Map(); m.treeSha = null; return m; } throw e; }
}
const walk = (dir, base = dir) => { const out = []; if (!fs.existsSync(dir)) return out; for (const n of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, n.name); if (n.isDirectory()) out.push(...walk(f, base)); else out.push(f); } return out; };
const rel = f => 'data/' + path.relative(cfg.DATA, f).split(path.sep).join('/');
// One commit with no history: old versions are dropped, so the repository never grows without limit.
async function commitFiles(files, tree) {
  const entries = [];
  for (const f of files) { const b = await gh('/git/blobs', { method: 'POST', body: { content: f.buf.toString('base64'), encoding: 'base64' } }); entries.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha }); }
  const t = await gh('/git/trees', { method: 'POST', body: { ...(tree.treeSha ? { base_tree: tree.treeSha } : {}), tree: entries } });
  const c = await gh('/git/commits', { method: 'POST', body: { message: 'sync ' + new Date().toISOString(), tree: t.sha, parents: [] } });
  await gh(`/git/refs/heads/${encodeURIComponent(BRANCH)}`, { method: 'PATCH', body: { sha: c.sha, force: true } });
}

/** Call BEFORE the database is opened. */
async function restore() {
  if (!enabled) return;
  try {
    const tree = await remoteTree();
    dbShaAtBoot = tree.get(DB_PATH) || null;
    const haveDb = fs.existsSync(cfg.DB_FILE);
    if (dbShaAtBoot && (!haveDb || MODE === 'pull')) {
      fs.writeFileSync(cfg.DB_FILE, zlib.gunzipSync(await gh(`/git/blobs/${dbShaAtBoot}`, { raw: true })));
      for (const x of ['-wal', '-shm']) fs.rmSync(cfg.DB_FILE + x, { force: true });
      console.log('  Sync: database restored from GitHub');
    } else if (!dbShaAtBoot) console.log('  Sync: nothing saved on GitHub yet (first run)');
    let n = 0;
    for (const [p, sha] of tree) {
      if (!p.startsWith('data/uploads/') && !p.startsWith('data/private/')) continue;
      const local = path.join(cfg.DATA, p.slice(5));
      if (fs.existsSync(local)) continue;
      fs.mkdirSync(path.dirname(local), { recursive: true }); fs.writeFileSync(local, await gh(`/git/blobs/${sha}`, { raw: true })); n++;
    }
    if (n) console.log(`  Sync: ${n} photo file(s) restored`);
  } catch (e) { console.error('  Sync restore problem:', e.message); }
}

async function pushOnce(db) {
  if (busy) return; busy = true;
  try {
    const tree = await remoteTree();
    const tmp = path.join(cfg.DATA, 'sync-tmp.db');
    await db.backup(tmp);
    const gz = zlib.gzipSync(fs.readFileSync(tmp), { level: 9 }); fs.rmSync(tmp, { force: true });
    const batch = []; let photos = 0;
    if (gitSha(gz) !== tree.get(DB_PATH)) batch.push({ path: DB_PATH, buf: gz });
    for (const f of [...walk(cfg.UPLOADS), ...walk(cfg.PRIVATE)]) {
      const p = rel(f); if (tree.has(p)) continue;
      if (photos >= 40) break; // the rest goes in the next round
      const buf = fs.readFileSync(f); if (buf.length > 25e6) continue;
      batch.push({ path: p, buf }); photos++;
    }
    if (batch.length) { await commitFiles(batch, tree); console.log(`  Sync: saved${batch.some(x => x.path === DB_PATH) ? ' database' : ''}${photos ? ` + ${photos} photo file(s)` : ''}`); }
  } catch (e) { console.error('  Sync push problem:', e.message); } finally { busy = false; }
}

function start(db) {
  if (!enabled) return { stop: async () => { } };
  const mins = Math.max(1, Number(process.env.SYNC_INTERVAL_MIN || (MODE === 'pull' ? 10 : 1)));
  console.log(`  Sync: GitHub ${MODE} mode on (${REPO}), every ${mins} min`);
  if (MODE === 'push') {
    setTimeout(() => pushOnce(db), 20000);
    setInterval(() => pushOnce(db), mins * 60000);
    return { stop: async () => { await Promise.race([pushOnce(db), new Promise(r => setTimeout(r, 9000))]); } };
  }
  setInterval(async () => { try { const t = await remoteTree(); const s = t.get(DB_PATH); if (s && s !== dbShaAtBoot) { console.log('  Sync: newer data found, restarting to load it'); process.exit(0); } } catch (e) { console.error('  Sync check problem:', e.message); } }, mins * 60000);
  return { stop: async () => { } };
}
module.exports = { restore, start, enabled, MODE };

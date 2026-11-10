'use strict';
const express = require('express');
const db = require('../shared/db');
const auth = require('../shared/auth');
const { asyncH, bad, notFound, int, num, jstr, jparse, now } = require('../shared/util');

const coerce = (spec, v) => {
  switch (spec) {
    case 'int': return v === '' || v == null ? null : int(v);
    case 'num': return v === '' || v == null ? null : num(v);
    case 'bool': return v ? 1 : 0;
    case 'json': return jstr(typeof v === 'string' ? jparse(v, []) : v);
    case 'date': return v ? new Date(v).toISOString() : null;
    default: return v == null ? null : String(v).trim();
  }
};

/**
 * Tiny schema-driven CRUD. cfg: { table, fields:{col:type}, required:[], order, search:[], soft:boolean, after(row,req), before(data,req,existing) }
 */
function crud(cfg) {
  const r = express.Router();
  const label = cfg.label || cfg.table;
  const clean = (body, existing, req) => {
    const out = {};
    for (const [col, spec] of Object.entries(cfg.fields)) if (body[col] !== undefined) out[col] = coerce(spec, body[col]);
    for (const col of cfg.required || []) if (!existing && (out[col] == null || out[col] === '')) throw bad(`"${col}" is required.`);
    if (cfg.before) cfg.before(out, req, existing);
    return out;
  };
  r.get('/', asyncH((req, res) => {
    const where = [cfg.soft ? 'deleted_at IS NULL' : '1=1'], args = [];
    if (req.query.q && cfg.search) { where.push('(' + cfg.search.map(c => `${c} LIKE ?`).join(' OR ') + ')'); cfg.search.forEach(() => args.push('%' + String(req.query.q).replace(/[%_]/g, '') + '%')); }
    for (const f of cfg.filters || []) if (req.query[f] !== undefined && req.query[f] !== '') { where.push(`${f}=?`); args.push(req.query[f]); }
    const rows = db.prepare(`SELECT * FROM ${cfg.table} WHERE ${where.join(' AND ')} ORDER BY ${cfg.order || 'id DESC'} LIMIT 1000`).all(...args);
    res.json(cfg.list ? cfg.list(rows, req) : rows);
  }));
  r.get('/:id', asyncH((req, res) => {
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(int(req.params.id));
    if (!row) throw notFound();
    res.json(row);
  }));
  r.post('/', asyncH((req, res) => {
    const d = clean(req.body || {}, null, req), cols = Object.keys(d);
    if (!cols.length) throw bad('Nothing to save.');
    const id = db.prepare(`INSERT INTO ${cfg.table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map(c => d[c])).lastInsertRowid;
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(id);
    if (cfg.after) cfg.after(row, req);
    auth.logActivity(req.admin.id, 'create', label, id, d.name || d.code || d.title || '', req);
    res.json(row);
  }));
  r.put('/:id', asyncH((req, res) => {
    const id = int(req.params.id), ex = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(id);
    if (!ex) throw notFound();
    const d = clean(req.body || {}, ex, req), cols = Object.keys(d);
    if (cols.length) db.prepare(`UPDATE ${cfg.table} SET ${cols.map(c => c + '=?').join(',')} WHERE id=?`).run(...cols.map(c => d[c]), id);
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(id);
    if (cfg.after) cfg.after(row, req);
    auth.logActivity(req.admin.id, 'update', label, id, d.name || d.code || d.title || '', req);
    res.json(row);
  }));
  r.delete('/:id', asyncH((req, res) => {
    const id = int(req.params.id);
    if (cfg.beforeDelete) cfg.beforeDelete(id, req);
    if (cfg.soft) db.prepare(`UPDATE ${cfg.table} SET deleted_at=? WHERE id=?`).run(now(), id);
    else db.prepare(`DELETE FROM ${cfg.table} WHERE id=?`).run(id);
    if (cfg.after) cfg.after(null, req);
    auth.logActivity(req.admin.id, 'delete', label, id, '', req);
    res.json({ ok: true });
  }));
  return r;
}

module.exports = { crud };

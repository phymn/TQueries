// TQueries v0.2 "Test Drive" — practice SQLite database (sql.js / WebAssembly, no native build).
// Built only from the schema read from photos; never connects to a real database.
const path = require('path'), crypto = require('crypto');
const { Worker } = require('worker_threads');
const VENDOR = path.join(__dirname, '..', 'vendor', 'sql.js');
const MAX_ROWS = 200, TIMEOUT_MS = 5000;

const lc = s => String(s || '').toLowerCase();
const singular = s => lc(s).replace(/ies$/, 'y').replace(/(ses|xes)$/, s => s.slice(0, -2)).replace(/s$/, '');
const schemaHash = tables => crypto.createHash('sha1').update(JSON.stringify(tables.map(t => [t.name, t.columns.map(c => [c.name, c.type])]))).digest('hex').slice(0, 12);

// Primary key: <Table>ID / <singular>ID / Id / first column ending in id / first column.
const idish = n => /id$|(^|_)id(_|$)/i.test(n);
function pkOf(t) {
  const cs = t.columns, n = singular(t.name);
  return (cs.find(c => [lc(t.name) + 'id', n + 'id', n + '_id', 'id'].includes(lc(c.name))) || (cs[0] && idish(cs[0].name) ? cs[0] : null) || cs.find(c => /id$/i.test(c.name)) || cs[0] || {}).name;
}
// Name tokens without the "id" part: DEPT_ID_DEP -> [dept, dep]; CustomerID -> [customer].
const toks = s => String(s).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(x => x && x !== 'id' && x !== 'no' && x !== 'num');
const similar = (a, b) => a.some(x => b.some(y => x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))));
function overlap(t, col, p, pcol) { // share of child values found in parent (photo rows only); null if unknown
  if (!t.rows || !p.rows) return null; const ci = t.columns.findIndex(c => c.name === col), pi = p.columns.findIndex(c => c.name === pcol);
  const keys = new Set(p.rows.map(r => String(r[pi]))), vals = t.rows.map(r => r[ci]).filter(v => v != null && v !== '');
  return vals.length ? vals.filter(v => keys.has(String(v))).length / vals.length : null;
}
// Foreign keys: a non-PK column whose name equals another table's PK (or <singular>ID of it).
function inferFks(tables) {
  const fks = [];
  for (const t of tables) { const pk = pkOf(t);
    for (const c of t.columns) { if (c.name === pk || !idish(c.name)) continue;
      let p = tables.find(o => o !== t && (lc(pkOf(o)) === lc(c.name) || [singular(o.name) + 'id', singular(o.name) + '_id'].includes(lc(c.name))));
      if (!p && idish(c.name)) p = tables.find(o => { if (o === t) return false; const pk = pkOf(o), ov = overlap(t, c.name, o, pk);
        const nameHit = similar(toks(c.name), [...toks(pk), ...toks(o.name)]); return nameHit ? ov == null || ov >= 0.5 : ov === 1 && idish(pk); });
      if (p) fks.push({ table: t.name, column: c.name, parent: p.name, parentColumn: pkOf(p) }); } }
  return fks;
}
// Deterministic, non-AI sample generator (seeded) — fallback when the model fails.
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const NAMES = ['Ana Torres', 'Luis Pérez', 'María Gómez', 'Carlos Ruiz', 'Sofía Díaz', 'Jorge Castro', 'Lucía Romero', 'Pedro Vargas', 'Elena Morales', 'Diego Herrera', 'Valeria Ortiz', 'Andrés Silva'];
const CO = ['84logic', 'Northwind Supply', 'Blue Harbor LLC', 'Summit Tools', 'Rio Grande Foods', 'Cedar & Co', 'Atlas Print', 'Luna Design'];
const CITIES = ['Miami', 'Orlando', 'Houston', 'Bogotá', 'Madrid', 'New York', 'Dallas', 'Tampa'];
const kind = c => { const n = lc(c.name), ty = lc(c.type);
  if (/date|time|fecha/.test(n) || /date|time/.test(ty)) return 'date';
  if (/id$/.test(n)) return 'id';
  if (/total|amount|price|monto|importe|precio|cost|balance|saldo|paid|pago/.test(n) || /dec|num|money|real|float|double|curr/.test(ty)) return 'money';
  if (/qty|quantity|cantidad|count|units/.test(n) || /int|bit/.test(ty)) return 'int';
  if (/email|correo/.test(n)) return 'email'; if (/phone|tel/.test(n)) return 'phone';
  if (/city|ciudad/.test(n)) return 'city'; if (/compan|empresa|client|customer|cliente/.test(n)) return 'company';
  if (/name|nombre/.test(n)) return 'name'; if (/status|estado/.test(n)) return 'status'; return 'text'; };
function fakeValue(c, i, r, tname) {
  const p = a => a[Math.floor(r() * a.length)];
  switch (kind(c)) {
    case 'id': return i + 1;
    case 'date': { const d = new Date(Date.UTC(2025, 0, 1) + Math.floor(r() * 670) * 864e5); return d.toISOString().slice(0, 10); }
    case 'money': return Math.round(r() * 500000) / 100; case 'int': return 1 + Math.floor(r() * 20);
    case 'email': return 'user' + (i + 1) + '@example.com'; case 'phone': return '305-555-' + String(1000 + Math.floor(r() * 8999));
    case 'city': return p(CITIES); case 'company': return p(CO); case 'name': return /prod|item|art/i.test(tname) ? 'Item ' + (i + 1) : p(NAMES);
    case 'status': return p(['Open', 'Paid', 'Pending']); default: return c.name + ' ' + (i + 1); }
}
function fallbackRows(t, n, seed) { const r = rng(seed); const pk = pkOf(t);
  return Array.from({ length: n }, (_, i) => t.columns.map(c => c.name === pk && /id$/i.test(c.name) ? i + 1 : fakeValue(c, i, r, t.name))); }
// Align rows (arrays or objects) to the table's columns.
function alignRows(t, rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(x => x && typeof x === 'object').slice(0, 500).map(row => t.columns.map((c, j) => {
    let v = Array.isArray(row) ? row[j] : (row[c.name] ?? Object.entries(row).find(([k]) => lc(k) === lc(c.name))?.[1]);
    return v === undefined || (typeof v === 'object' && v !== null) ? null : v; }));
}
// Make every FK value exist in its parent. Photo rows are never rewritten; generated rows are remapped,
// and missing parent keys referenced by photo rows are added to generated parents.
function fixFks(tables, data, source) {
  const fks = inferFks(tables), T = n => tables.find(t => t.name === n);
  for (const fk of fks) {
    const ct = T(fk.table), pt = T(fk.parent), ci = ct.columns.findIndex(c => c.name === fk.column), pi = pt.columns.findIndex(c => c.name === fk.parentColumn);
    const keys = new Set(data[pt.name].map(r => String(r[pi])));
    if (source[ct.name] === 'photo') { if (source[pt.name] !== 'photo') for (const r of data[ct.name]) if (r[ci] != null && !keys.has(String(r[ci]))) {
      const row = fallbackRows(pt, 1, data[pt.name].length + 7)[0]; row[pi] = r[ci]; data[pt.name].push(row); keys.add(String(r[ci])); } }
    else { const list = [...keys]; if (!list.length) continue;
      data[ct.name].forEach((r, i) => { if (!keys.has(String(r[ci]))) { const k = list[i % list.length]; r[ci] = isNaN(k) ? k : +k; } }); }
  }
  return fks;
}
// Prompt for the local SQL model (JSON mode).
function dataPrompt(tables, fks, n) {
  return `Create realistic sample data for these tables (${n} rows each). Use realistic names, dates in 2025-2026 (YYYY-MM-DD), amounts.
Foreign keys MUST reference existing parent keys: ${fks.map(f => `${f.table}.${f.column} -> ${f.parent}.${f.parentColumn}`).join('; ') || 'none'}.
Tables:\n${tables.map(t => `${t.name}(${t.columns.map(c => c.name + (c.type ? ' ' + c.type : '')).join(', ')})`).join('\n')}
Return ONLY JSON: {"TableName":[[value per column in order], ...], ...}`;
}

const { translate } = require('./translate');
// v0.5.3 "Swift Coder": transaction blocks (BEGIN/START TRANSACTION … COMMIT/ROLLBACK) on the practice copy.
function splitSql(sql) { const out = []; let cur = '', q = null;
  for (const ch of String(sql)) { if (q) { cur += ch; if (ch === q) q = null; } else if (ch === "'" || ch === '"') { q = ch; cur += ch; } else if (ch === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim()); return out.map(x => x.replace(/^(--.*\n\s*)+/, '').trim()).filter(Boolean); }
const TXN_START = /^(begin(\s+(transaction|tran|work))?|start\s+transaction|set\s+transaction\b.*)$/i, TXN_END = /^(commit|rollback)(\s+(transaction|tran|work))?$/i;
function isTxn(sql) { const p = splitSql(sql); return p.length >= 2 && TXN_START.test(p[0]) && TXN_END.test(p[p.length - 1]); }
// SQLite form of a transaction block: one BEGIN, the body, then COMMIT or ROLLBACK.
function txnSqlite(sql) { const p = splitSql(sql); return { body: p.slice(1, -1).filter(x => !TXN_START.test(x)), end: /^rollback/i.test(p[p.length - 1]) ? 'ROLLBACK' : 'COMMIT' }; }
function safeCheck(sql) {
  const s = String(sql).replace(/'(?:[^']|'')*'/g, "''").replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/;\s*$/, '');
  // The practice copy is throwaway, so any single statement may run on it (reads and changes). Only engine-level commands are blocked.
  if (s.includes(';') && !isTxn(sql)) return 'multi'; // v0.5.3: a BEGIN…COMMIT/ROLLBACK block may run as a whole
  if (isTxn(sql) && splitSql(sql).some(x => /^\s*(attach|detach|pragma|vacuum)\b/i.test(x))) return 'blocked';
  if (/\b(attach|detach|pragma|vacuum|load_extension)\b/i.test(s)) return 'blocked';
  return null;
}
// Worker: build DB, register helpers, run query with a hard timeout.
const WORKER = `
const { parentPort, workerData: w } = require('worker_threads'); const path = require('path');
require(path.join(w.vendor, 'sql-wasm.js'))({ locateFile: f => path.join(w.vendor, f) }).then(SQL => {
  const db = new SQL.Database(); const q = n => '"' + String(n).replace(/"/g, '""') + '"';
  require(path.join(w.lib, 'udf.js')).register(db);
  try {
    for (const t of w.tables) {
      db.run('CREATE TABLE ' + q(t.name) + ' (' + t.columns.map(c => q(c.name)).join(', ') + ')');
      const st = db.prepare('INSERT INTO ' + q(t.name) + ' VALUES (' + t.columns.map(() => '?').join(',') + ')');
      for (const r of w.data[t.name] || []) st.run(r.map(v => typeof v === 'boolean' ? +v : (typeof v === 'string' && /^-?\\d+(\\.\\d+)?$/.test(v.trim()) && !/^0\\d/.test(v.trim())) ? Number(v) : v)); st.free();
    }
    if (w.txn) { // v0.5.3: BEGIN; statements…; COMMIT|ROLLBACK, all on the practice copy
      db.run('BEGIN'); let changed = 0, tname = null, last = null;
      for (const s of w.txn.body) { const r = db.exec(s); changed += db.getRowsModified(); if (r.length) last = r[r.length - 1];
        const m = s.match(/^\\s*(?:insert\\s+into|update|delete\\s+from)\\s+("[^"]+"|\\w+)/i); if (m && !tname) tname = m[1].replace(/"/g, ''); }
      db.run(w.txn.end); let after = last;
      if (tname) { const r = db.exec('SELECT * FROM ' + q(tname) + ' LIMIT ' + w.max); after = r[0] || { columns: [], values: [] }; }
      parentPort.postMessage({ ok: true, write: !!tname, txn: w.txn.end, changed, table: tname, columns: after ? after.columns : [], rows: after ? after.values.slice(0, w.max) : [], total: after ? after.values.length : 0, truncated: false }); return;
    }
    const st = db.prepare(w.sql); let columns = st.getColumnNames(); let rows = []; let total = 0;
    while (st.step()) { total++; if (rows.length < w.max) rows.push(st.get()); if (total > 100000) break; }
    st.free();
    if (!columns.length) { // INSERT / UPDATE / DELETE / DDL: report rows changed and show the table afterwards
      const changed = db.getRowsModified();
      const m = w.sql.match(/^\\s*(?:with[\\s\\S]*?\\)\\s*)?(?:insert\\s+(?:or\\s+\\w+\\s+)?into|update(?:\\s+or\\s+\\w+)?|delete\\s+from|create\\s+table(?:\\s+if\\s+not\\s+exists)?|alter\\s+table|drop\\s+table(?:\\s+if\\s+exists)?)\\s+("[^"]+"|\\w+)/i);
      const tname = m ? m[1].replace(/"/g, '') : null; let after = null;
      if (tname) { try { const r = db.exec('SELECT * FROM ' + q(tname) + ' LIMIT ' + w.max); after = r[0] ? { columns: r[0].columns, rows: r[0].values } : { columns: [], rows: [] }; } catch {} }
      parentPort.postMessage({ ok: true, write: true, changed, table: tname, columns: after ? after.columns : [], rows: after ? after.rows : [], total: after ? after.rows.length : 0, truncated: false }); return;
    }
    parentPort.postMessage({ ok: true, columns, rows, total, truncated: total > rows.length });
  } catch (e) { parentPort.postMessage({ ok: false, error: e.message }); }
}).catch(e => parentPort.postMessage({ ok: false, error: 'sqljs: ' + e.message }));`;
function runSqlite(tables, data, sql, { max = MAX_ROWS, timeout = TIMEOUT_MS } = {}) {
  return new Promise(ok => {
    const w = new Worker(WORKER, { eval: true, workerData: { vendor: VENDOR, lib: __dirname, tables, data, sql, max, txn: isTxn(sql) ? txnSqlite(sql) : null } });
    const tm = setTimeout(() => { w.terminate(); ok({ ok: false, error: 'timeout' }); }, timeout);
    w.once('message', m => { clearTimeout(tm); w.terminate(); ok(m); });
    w.once('error', e => { clearTimeout(tm); ok({ ok: false, error: e.message }); });
  });
}
module.exports = { isTxn, splitSql, txnSqlite, toks, pkOf, inferFks, fallbackRows, alignRows, fixFks, dataPrompt, translate, safeCheck, runSqlite, schemaHash, MAX_ROWS };

// TQueries v0.5.1 "Clean Cells": turn a table picture into clean cells.
//  1. Apple Foundation Model reads each table crop as CSV (parseCSV, RFC 4180).
//  2. Cross-check: Apple Vision word boxes are placed by position (header columns, wrapped lines, shape splits).
//  3. merge(): cell by cell; disagreements pick the value that fits the column's shape and are flagged for review.
'use strict';
// ---------- CSV (RFC 4180: quotes, "" escapes, commas and newlines inside quotes) ----------
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false, i = 0, s = String(text || '').replace(/\r\n?/g, '\n');
  for (; i < s.length; i++) { const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"' && f.trim() === '') { q = true; f = ''; } else if (c === ',') { row.push(f.trim()); f = ''; }
    else if (c === '\n') { row.push(f.trim()); rows.push(row); row = []; f = ''; } else f += c; }
  if (f !== '' || row.length) { row.push(f.trim()); rows.push(row); }
  return rows.filter(r => r.some(x => x !== '') && !/^```/.test(r[0]));
}
// One CSV block may hold several tables (a new header line = a row whose cells all look like column names, with a different width).
const isName = v => /^[A-Za-z][A-Za-z0-9_ ]*$/.test(v) && !/\d{3,}/.test(v);
function csvTables(text) {
  const out = []; let cur = null;
  for (const r of parseCSV(text)) {
    if (/^#\s*table/i.test(r[0])) { cur = null; continue; }
    if (!cur || (r.length !== cur.columns.length && r.every(isName) && r.length > 1)) { cur = { columns: r, rows: [] }; out.push(cur); continue; }
    cur.rows.push(r); }
  return out;
}
// ---------- Position grouping ----------
// words: [{t, x0, x1, y0, y1}] (0..1, top-left origin) → lines → tables (split on large vertical gaps)
function lines(words) {
  const ws = words.filter(w => String(w.t).trim()).map(w => ({ ...w, t: String(w.t).trim(), cy: (w.y0 + w.y1) / 2, cx: (w.x0 + w.x1) / 2, h: w.y1 - w.y0 })).sort((a, b) => a.cy - b.cy);
  const out = [];
  for (const w of ws) { const l = out[out.length - 1];
    if (l && Math.abs(l.cy - w.cy) < Math.min(l.h, w.h) * 0.5) { l.words.push(w); l.y0 = Math.min(l.y0, w.y0); l.y1 = Math.max(l.y1, w.y1); }
    else out.push({ words: [w], cy: w.cy, h: w.h, y0: w.y0, y1: w.y1 }); }
  out.forEach(l => l.words.sort((a, b) => a.x0 - b.x0));
  return out;
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
function blocks(ls) { // a gap of more than ~1.6 line heights starts a new table
  const h = median(ls.map(l => l.h)) || 0.03, out = [];
  for (const l of ls) { const b = out[out.length - 1]; if (b && l.y0 - b[b.length - 1].y1 < h * 1.6) b.push(l); else out.push([l]); }
  return out.filter(b => b.length >= 2);
}
const SHAPES = [ // values that sometimes arrive glued together: split by shape
  [/^(\d{3,})(\d{4}-\d{2}-\d{2})$/, 2], [/^(\d{4}-\d{2}-\d{2})([MF])$/i, 2], [/^(\d{3,})\s+(\d{4}-\d{2}-\d{2})\s+([MF])$/i, 3], [/^(\d{3,})\s+(\d{4}-\d{2}-\d{2})$/, 2], [/^(\d{4}-\d{2}-\d{2})\s+([MF])$/i, 2]];
const tidy = v => String(v).replace(/[\\/|]+$/, '').replace(/^[|]+/, '').trim();
function positionTable(block) {
  const h = median(block.map(l => l.h)) || 0.03;
  // header = first line, plus following lines that are tight under it and look like names ('EMP_' / 'ID')
  const head = [block[0]]; let k = 1;
  while (k < block.length && block[k].y0 - head[head.length - 1].y1 < h * 0.35 && block[k].words.every(w => /^[A-Z][A-Z0-9_]*$/.test(w.t) && !/\d{3,}/.test(w.t)) && block[k].words.length < block[0].words.length) head.push(block[k++]);
  const cols = block[0].words.map(w => ({ name: w.t, x0: w.x0, x1: w.x1 }));
  const colOf = w => { let i = 0; for (let j = 0; j < cols.length; j++) if (w.cx >= cols[j].x0 - h * 0.4) i = j; return i; };
  for (const l of head.slice(1)) for (const w of l.words) { const c = cols[colOf(w)]; c.name += (/_$/.test(c.name) ? '' : ' ') + w.t; }
  const rows = [], cont = [];
  for (const l of block.slice(k)) {
    const cells = cols.map(() => []); for (const w of l.words) cells[colOf(w)].push(w.t);
    if (cells[0].length || !rows.length) { rows.push(cells.map(c => c.join(' '))); cont.push(cells.map(() => 0)); }
    else { const r = rows[rows.length - 1]; cells.forEach((c, i) => { if (c.length) { r[i] = (r[i] ? r[i] + ' ' : '') + c.join(' '); cont[cont.length - 1][i]++; } }); } // wrapped line → cell above
  }
  for (const r of rows) for (let i = 0; i < r.length; i++) { r[i] = tidy(r[i]);
    for (const [re, n] of SHAPES) { const m = r[i].match(re); if (m && r.slice(i + 1, i + n).every(x => !x)) { for (let j = 0; j < n; j++) r[i + j] = m[j + 1]; break; } } }
  const all = [...block.slice(0)].flatMap(l => l.words);
  const box = { x: Math.min(...all.map(w => w.x0)), y: Math.min(...all.map(w => w.y0)), x1: Math.max(...all.map(w => w.x1)), y1: Math.max(...all.map(w => w.y1)) };
  return { columns: cols.map(c => c.name.replace(/\s*_\s*/g, '_')), rows, box };
}
function positionTables(words) { return blocks(lines(words)).map(positionTable).filter(t => t.columns.length >= 2 && t.rows.length); }
// crop rect around a table (0..1, top-left), padded so borders and wrapped text stay in
function cropRect(box, pad = 0.02) { const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad * 2);
  return [x, y, Math.min(1, box.x1 + pad) - x, Math.min(1, box.y1 + pad * 2) - y].map(v => +v.toFixed(4)); }
// ---------- Cross-check ----------
const shape = v => String(v).replace(/[0-9]/g, '9').replace(/[A-Za-z]/g, 'a').replace(/a+/g, 'a');
const validDate = v => { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); return !m || (+m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31); };
function colShape(vals) { const c = {}; for (const v of vals) if (v) c[shape(v)] = (c[shape(v)] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || ''; }
const key = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
// pos, fm: {columns, rows}. Returns {columns, rows, flags:[{r,c,alt,why}], agree}
function merge(pos, fm) {
  if (!fm || !fm.columns?.length) return { ...pos, flags: [], agree: null };
  if (!pos || !pos.columns?.length) return { columns: fm.columns, rows: fm.rows, flags: [], agree: null };
  // map columns by name (or by order when counts match)
  const fk = fm.columns.map(key), map = pos.columns.map((c, i) => { const j = fk.indexOf(key(c)); if (j >= 0) return j;
    const p = fk.findIndex(f => key(c) && f.startsWith(key(c))); return p >= 0 ? p : pos.columns.length === fm.columns.length ? i : -1; });
  const flags = [], columns = pos.columns.map((c, i) => { const f = fm.columns[map[i]];
    if (f && key(f) !== key(c) && key(f).startsWith(key(c))) { flags.push({ r: -1, c: i, alt: c, why: 'header' }); return f.replace(/\s*_\s*/g, '_'); } return c; });
  // rows by first-column key, else by order
  const fmRow = r => { const k0 = key(r[0]); return fm.rows.find(x => k0 && key(x[map[0]] ?? '') === k0) || (pos.rows.length === fm.rows.length ? fm.rows[pos.rows.indexOf(r)] : null); };
  let same = 0, total = 0;
  const rows = pos.rows.map((r, ri) => { const f = fmRow(r); return r.map((v, ci) => {
    const w = f && map[ci] >= 0 ? String(f[map[ci]] ?? '').trim() : null; if (w === null) return v; total++;
    if (key(v) === key(w) && (v === w || v.replace(/\s/g, '') === w.replace(/\s/g, ''))) { same++; return v; }
    if (!v) { flags.push({ r: ri, c: ci, alt: '', why: 'missing' }); return w; }
    if (!w) return v;
    const sh = colShape(pos.rows.map(x => x[ci]).concat(fm.rows.map(x => String(x[map[ci]] ?? ''))));
    const okV = shape(v) === sh && validDate(v), okW = shape(w) === sh && validDate(w);
    const pick = okW && !okV ? w : v; flags.push({ r: ri, c: ci, alt: pick === v ? w : v, why: 'differs' }); return pick; }); });
  // rows only Apple's model saw (Vision missed a whole row): add them, flagged
  for (const f of fm.rows) if (!pos.rows.some(r => key(r[0]) && key(r[0]) === key(f[map[0]] ?? ''))) if (pos.rows.length < fm.rows.length) {
    const ri = rows.length; rows.push(pos.columns.map((_, ci) => map[ci] >= 0 ? String(f[map[ci]] ?? '') : '')); rows[ri].forEach((_, ci) => flags.push({ r: ri, c: ci, alt: '', why: 'missing' })); }
  return { columns, rows, flags, agree: total ? +(same / total).toFixed(3) : null };
}
// pair position tables with CSV tables (by crop order, else by best header overlap)
function crossCheck(posTables, csvByTable) {
  return posTables.map((p, i) => { const cands = (csvByTable[i] ? csvTables(csvByTable[i]) : []);
    const best = cands.sort((a, b) => overlap(b, p) - overlap(a, p))[0]; return merge(p, best && overlap(best, p) > 0 ? best : null); });
}
function overlap(a, p) { const s = new Set(p.columns.map(key)); return a.columns.filter(c => s.has(key(c)) || [...s].some(k => k && key(c).startsWith(k))).length; }
module.exports = { parseCSV, csvTables, lines, blocks, positionTable, positionTables, cropRect, merge, crossCheck, shape };

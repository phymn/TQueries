// TQueries — prompt building, SQL extraction and validation. Pure functions, no network.
const DIALECTS = {
  sqlserver: { name: 'SQL Server', notes: 'T-SQL: use TOP n (not LIMIT), square-bracket identifiers if needed, GETDATE(), DATEADD/DATEDIFF, FORMAT/CONVERT.' },
  mysql: { name: 'MySQL', notes: 'MySQL 8: LIMIT n, backtick identifiers if needed, NOW(), DATE_FORMAT, DATE_SUB/INTERVAL, IFNULL.' },
  postgresql: { name: 'PostgreSQL', notes: 'PostgreSQL: LIMIT n, double-quoted identifiers if needed, NOW(), date_trunc, INTERVAL, COALESCE, ILIKE.' },
  sqlite: { name: 'SQLite', notes: "SQLite: LIMIT n, date('now'), strftime, julianday, IFNULL; no RIGHT/FULL JOIN on old versions." },
  oracle: { name: 'Oracle', notes: 'Oracle: FETCH FIRST n ROWS ONLY, SYSDATE, TO_CHAR/TO_DATE, TRUNC(date), NVL, no AS for table aliases.' },
  access: { name: 'Microsoft Access', notes: 'Access SQL (Jet/ACE): TOP n, square brackets for names with spaces, Date(), Now(), Format(), DateAdd/DateDiff, IIf, Nz, # date literals #, nested parentheses for multiple JOINs, & for string concat.' }
};
function schemaText(tables) {
  return tables.map(t => `TABLE ${t.name} (\n` + t.columns.map(c => `  ${c.name} ${c.type || ''}`.trimEnd()).join(',\n') + '\n)').join('\n\n');
}
// Sample values (photo rows) so the model can match names/values, e.g. 'James' is an L_NAME.
function sampleText(tables, n = 5) {
  const out = tables.filter(t => t.rows && t.rows.length).map(t => `${t.name} rows (${t.columns.map(c => c.name).join(' | ')}):\n` +
    t.rows.slice(0, n).map(r => '  ' + r.map(v => v == null ? 'NULL' : String(v).slice(0, 40)).join(' | ')).join('\n'));
  return out.length ? 'Sample data:\n' + out.join('\n') + '\n' : '';
}
function joinText(joins) { if (!joins || !joins.length) return '';
  // v0.5.3: name link tables (2+ foreign keys) so the model joins through them for 3+ table questions.
  const by = {}; for (const f of joins) (by[f.table] = by[f.table] || []).push(f.parent);
  const links = Object.entries(by).filter(([, p]) => new Set(p).size >= 2).map(([t, p]) => `${t} links ${[...new Set(p)].join(' and ')}`);
  return 'Joins: ' + joins.map(f => `${f.table}.${f.column} = ${f.parent}.${f.parentColumn}`).join('; ') + '\n' + (links.length ? 'Link tables: ' + links.join('; ') + '. Join through them; chain as many tables as the request needs.\n' : ''); }
const PRECISION = `- Select ONLY the columns the user asked for (if they ask for a name, return just that column).
- No TOP/LIMIT/FETCH unless the user asks for a number of rows.
- Use the exact table and column names above. Use short aliases.
- For UPDATE/DELETE driven by other tables, use a subquery (WHERE col IN (SELECT …)) in dialects without UPDATE…JOIN.
- Join columns may have different names (e.g. DEP_ID = DEPT_ID_DEP); use the Joins line and the sample values.
- Use every value the user typed (names, numbers, IDs, dates, codes) EXACTLY as typed in the WHERE clause. Never replace it with a different value from the sample rows.
- Find the column that holds each typed value by looking at the sample rows. If it could be in several columns, filter with OR across them.`;
function sqlPrompt({ tables, dialect, request, lang, joins }) {
  const d = DIALECTS[dialect] || DIALECTS.postgresql;
  return `Write ONE ${d.name} SQL statement that does exactly what the request asks: SELECT to retrieve, or INSERT / UPDATE / DELETE / other SQL when the request asks to change data. Only if the request asks for a transaction, write ONE block: ${d.name} begin-transaction; the statements; COMMIT (or ROLLBACK if asked). Use any SQL functions or operations needed. ${d.notes} Date math: for an age or full years between two dates, give exact completed years (subtract 1 when the anniversary hasn't come yet this year), using today's date from the database (${d.name} date functions).
Derived values: compute them in the SQL with ${d.name} functions (text, date, math, aggregate, window, CASE). Age "in YEAR" = completed years at Dec 31 of that YEAR; age "at DATE" = completed years at that date. Character counts = length of the value. Formatted dates or numbers = ${d.name} formatting functions (e.g. a month name, day and year). Name computed columns with short aliases.
Tables:
${schemaText(tables)}
${sampleText(tables)}${joinText(joins)}Rules:
${PRECISION}
Request: ${request}
Answer exactly:
\`\`\`sql
<query>
\`\`\`
EXPLANATION: <one short sentence in ${lang === 'es' ? 'Spanish' : 'English'}>`;
}
const VISION_PROMPT = `Read EVERY database table in this image (there may be several, side by side or stacked). Return ONLY JSON:
{"tables":[{"name":"CLIENTS","columns":["CLIENT_ID","NAME"],"rows":[["1","84logic"]]},{"name":"INVOICES","columns":["INV_ID","CLIENT_ID"],"rows":[["10","1"]]}]}
Exact column names. A header split over lines is one name (EMP_ + ID = EMP_ID). If a table has no visible name, name it from its columns in plural UPPERCASE (e.g. EMPLOYEES, DEPARTMENTS). Rows: copy values exactly, max 20 per table; omit "rows" if none.`;

function extractJson(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '');
  const pairs = [['{', '}'], ['[', ']']]; const ai = s.indexOf('['), oi = s.indexOf('{');
  if (ai >= 0 && (oi < 0 || ai < oi)) pairs.reverse();
  for (const [o, c] of pairs) { // object {"tables":[...]} or a bare array of tables
    const a = s.indexOf(o), b = s.lastIndexOf(c);
    if (a < 0 || b <= a) continue;
    try { return JSON.parse(s.slice(a, b + 1)); } catch {}
  }
  return null;
}
function normalizeTables(obj) {
  const list = Array.isArray(obj) ? obj : (obj && obj.tables) || [];
  return list.filter(t => t && t.name).map(t => ({ name: String(t.name).trim(),
    columns: (t.columns || []).map(c => typeof c === 'string' ? { name: fixName(c), type: '' } : { name: fixName(c.name || ''), type: String(c.type || '').trim() }).filter(c => c.name) }))
    .map(t => { const src = list.find(x => x && String(x.name).trim() === t.name); if (Array.isArray(src.rows) && src.rows.length) t.rows = alignRows(t, src.rows); if (!t.rows || !t.rows.length) delete t.rows; return t; });
}
// Wrapped headers: 'EMP_\nID' / 'EMP_ ID' -> 'EMP_ID'.
function fixName(n) { return String(n).trim().replace(/\s*_\s*/g, '_').replace(/\s*\n\s*/g, ''); }
function alignRows(t, rows) { return require('./testdb').alignRows(t, rows); }
// Fix loop: rewrite a query in the same dialect.
function fixPrompt({ tables, dialect, sql, request, fix, lang, result }) {
  const d = DIALECTS[dialect] || DIALECTS.postgresql;
  return `You are an expert SQL report writer. Rewrite this ${d.name} query to apply the requested fix. Keep the ${d.name} dialect.
Rules: ${d.notes}
Use ONLY these tables and columns (exact names):

${schemaText(tables)}

Original report: ${request || '(not given)'}
Current query:
\`\`\`sql
${sql}
\`\`\`
${result ? 'Test result preview: ' + result + '\n' : ''}Fix requested: ${fix}

Answer in exactly this format:
\`\`\`sql
<the query>
\`\`\`
EXPLANATION: <2-3 short sentences in ${lang === 'es' ? 'Spanish' : 'English'}>`;
}
function sqliteTranslatePrompt(sql, dialect, tables) {
  return `Translate this ${(DIALECTS[dialect] || {}).name || dialect} query to SQLite so it returns the same result. Tables:\n${schemaText(tables)}\n\n\`\`\`sql\n${sql}\n\`\`\`\nAnswer with ONLY the SQLite query in a \`\`\`sql block.`;
}
// Manual entry: "Table(col type, col2)" lines, CREATE TABLE statements, or "Table: a, b, c".
function parseSchemaText(text) {
  const out = []; const src = String(text || '');
  const re = /(?:create\s+table\s+(?:if\s+not\s+exists\s+)?)?([\[\]`"\w.\s]+?)\s*\(([\s\S]*?)\)\s*;?\s*(?=\n\s*\n|\n?\s*(?:create\s+table|[\w\[\]`"]+\s*\(|[\w]+\s*:)|$)/gi;
  const lines = src.split(/\n/);
  // Simple "Table: a, b" format first
  for (const l of lines) { const m = l.match(/^\s*([\w\[\] .`"]+?)\s*:\s*(.+)$/); if (m && !/\(/.test(m[1])) out.push({ name: clean(m[1]), columns: splitCols(m[2]) }); }
  if (out.length) return out;
  let m; while ((m = re.exec(src))) { const name = clean(m[1]); if (name) out.push({ name, columns: splitCols(m[2]) }); }
  return out;
}
function clean(s) { return String(s).trim().replace(/^(create\s+table\s+)/i, '').replace(/[\[\]`"]/g, '').trim(); }
function splitCols(s) {
  return s.split(/,(?![^(]*\))/).map(x => x.trim()).filter(Boolean)
    .filter(x => !/^(primary|foreign|constraint|unique|key|index|check)\b/i.test(x))
    .map(x => { const p = x.match(/^([\[`"][^\]`"]+[\]`"]|\S+)\s*(.*)$/); return { name: clean(p[1]), type: (p[2] || '').replace(/\b(not null|null|primary key|identity.*|auto_increment|default .*)$/i, '').trim() }; });
}
function extractSql(text) {
  const t = String(text || '');
  const fence = t.match(/```(?:[a-z0-9_+-]*[ \t]*\n|sql\b)?\s*([\s\S]*?)```/i); // v0.5.3: any fence tag (```sqlite, ```postgresql…)
  let sql = fence ? fence[1] : (t.match(/((?:with|select)\b[\s\S]*?;)/i) || [, t])[1];
  const ex = t.match(/EXPLANATION:\s*([\s\S]*)$/i) || t.match(/EXPLICACI[OÓ]N:\s*([\s\S]*)$/i);
  let explanation = ex ? ex[1].trim() : t.replace(/```[\s\S]*?```/g, '').trim();
  return { sql: sql.trim(), explanation };
}
const KEYWORDS = new Set(('select from where and or not in is null as on join inner left right full outer cross group by order having limit top offset fetch first next rows row only distinct union all case when then else end asc desc between like ilike exists with count sum avg min max coalesce isnull ifnull nvl nz iif cast convert date datetime int integer varchar text decimal numeric year month day now getdate sysdate current_date current_timestamp interval date_trunc strftime julianday datediff dateadd date_sub date_add format to_char to_date trunc round over partition rank row_number dense_rank lag lead extract upper lower trim substring substr concat length len true false percent ties values into set by hour minute second week quarter dateserial dpart datepart').split(' '));
function stripLiterals(sql) { return sql.replace(/'(?:[^']|'')*'/g, "''").replace(/#[^#\n]*#/g, '#d#').replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); }
function validate(sql, tables) {
  const problems = [], warnings = [];
  const tnames = new Map(tables.map(t => [t.name.toLowerCase(), t]));
  const allCols = new Set(tables.flatMap(t => t.columns.map(c => c.name.toLowerCase())));
  const changes = /^\s*(insert|update|delete|merge|drop|alter|truncate|create|replace)\b/i.test(stripLiterals(sql)) || /^\s*with\b[\s\S]*\b(insert|update|delete)\b/i.test(stripLiterals(sql));
  const writes = changes ? 'writes' : null;
  const s = stripLiterals(sql);
  const unq = x => x.replace(/[\[\]`"]/g, '');
  const ident = '((?:\\[[^\\]]+\\]|`[^`]+`|"[^"]+"|[A-Za-z_][\\w$]*)(?:\\.(?:\\[[^\\]]+\\]|`[^`]+`|"[^"]+"|[A-Za-z_][\\w$]*))*)';
  const aliases = new Map(); const ctes = new Set();
  for (const m of s.matchAll(/\b(\w+)\s+as\s*\(/gi)) ctes.add(m[1].toLowerCase());
  for (const m of s.matchAll(new RegExp('\\b(?:from|join)\\s+' + ident + '(?:\\s+(?:as\\s+)?([A-Za-z_]\\w*))?', 'gi'))) {
    const full = unq(m[1]); const name = full.split('.').pop().toLowerCase();
    if (!tnames.has(name) && !ctes.has(name)) problems.push('table:' + full.split('.').pop());
    aliases.set(name, name);
    if (m[2] && !KEYWORDS.has(m[2].toLowerCase())) aliases.set(m[2].toLowerCase(), name);
  }
  const outAliases = new Set([...s.matchAll(/\bas\s+(\[[^\]]+\]|`[^`]+`|"[^"]+"|\w+)/gi)].map(m => unq(m[1]).toLowerCase()));
  for (const m of s.matchAll(/((?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[A-Za-z_]\w*))\.(\[[^\]]+\]|`[^`]+`|"[^"]+"|[A-Za-z_]\w*|\*)/g)) {
    const a = unq(m[1]).toLowerCase(), c = unq(m[2]).toLowerCase();
    if (c === '*') continue;
    const t = tnames.get(aliases.get(a) || a);
    if (t && !t.columns.some(x => x.name.toLowerCase() === c)) problems.push('column:' + unq(m[1]) + '.' + unq(m[2]));
  }
  // Bracketed/quoted bare identifiers must exist somewhere
  for (const m of s.matchAll(/(?<![.\w])(\[[^\]]+\]|`[^`]+`|"[^"]+")(?!\s*\.)/g)) {
    const n = unq(m[1]).toLowerCase();
    if (!allCols.has(n) && !tnames.has(n) && !outAliases.has(n) && !aliases.has(n) && !ctes.has(n)) warnings.push('unknown:' + unq(m[1]));
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)], warnings: [...new Set(warnings)], changesData: !!writes };
}
// SQLite: real EXPLAIN against an empty in-memory DB, when node:sqlite exists (Node 22.5+).
function sqliteExplain(sql, tables) {
  let DB; try { DB = require('node:sqlite').DatabaseSync; } catch { return { ran: false }; }
  const db = new DB(':memory:');
  try {
    for (const t of tables) db.exec(`CREATE TABLE "${t.name.replace(/"/g, '""')}" (${t.columns.map(c => `"${c.name.replace(/"/g, '""')}" ${/^[\w ()]+$/.test(c.type) ? c.type : ''}`).join(', ') || '"_x"'})`);
    db.prepare('EXPLAIN ' + sql.replace(/;\s*$/, '')).all();
    return { ran: true, ok: true };
  } catch (e) { return { ran: true, ok: false, error: e.message }; } finally { db.close(); }
}
const STOP = new Set('a an the of for in on at by to from and or with without per all each every show me give get list find what which who whose is are was were de del la el los las por para con y o en un una que cual quien dame muestra lista total sum count average avg max min top first last name names department table tables report'.split(' '));
// Values the user typed that the query must contain (any table set): quoted text, IDs/codes/dates, and any word or number found in the sample rows.
function inputValues(request, tables) {
  const req = String(request || ''); const out = new Map();
  const add = v => { v = String(v).trim(); if (v && !out.has(v.toLowerCase())) out.set(v.toLowerCase(), v); };
  // v0.4.1: possessive/contraction apostrophes (employee's, employees') never open a quote.
  let txt = req.replace(/([A-Za-zÀ-ÿ])['’]([A-Za-zÀ-ÿ])/g, '$1\u0001$2').replace(/([sS])['’](?=\s|$|[,.;:!?])/g, '$1\u0001');
  const CUE = /(?:\blike|\bas|\bformat(?:ted)?|\bformato|\bcomo|e\.g\.?|\bsuch as|\bpor ejemplo|\bej\.?|\bexample|\bejemplo|\bstyle|\bestilo)\s*[:,]?\s*$/i;
  const MONTH = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|enero|febrero|marzo|abril|mayo|junio|julio|agosto|se(p)?tiembre|octubre|noviembre|diciembre)\b/i;
  const isDateExample = q => MONTH.test(q) && /\d/.test(q) || /^\s*\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}\s*$/.test(q) || /^[ymdhs\/.:,\s-]+$/i.test(q) && /yy|mm|dd/i.test(q);
  txt = txt.replace(/["'“”‘’]([^"'“”‘’]+)["'“”‘’]/g, (m, q, i) => { if (CUE.test(txt.slice(0, i)) || isDateExample(q)) return ' '; add(q.replace(/\u0001/g, "'")); return ' '; });
  txt = txt.replace(/\b(?:like|as|e\.g\.?|such as|como|formato|format)\s+((?:[A-Za-zÀ-ÿ]+\s+)?\d{1,2},?\s+\d{4})/gi, ' '); // unquoted date examples
  const names = new Set(); for (const t of tables || []) { names.add(t.name.toLowerCase()); for (const c of t.columns || []) names.add(String(c.name).toLowerCase()); }
  const cells = new Set(), words = new Set();
  for (const t of tables || []) for (const r of t.rows || []) for (const v of r) { const x = String(v ?? '').trim().toLowerCase(); if (!x) continue; cells.add(x); for (const w of x.split(/[\s,;]+/)) if (w) words.add(w); }
  const counts = new Set([...req.matchAll(/\b(?:top|first|last|limit|primer(?:os|as)?|[uú]ltim(?:os|as)?|mejores|peores)\s+(\d+)/gi)].map(m => m[1]));
  for (const tok of txt.replace(/\u0001\w*/g, '').replace(/["'“”‘’?!¿¡]/g, ' ').split(/[\s,;]+/).map(w => w.replace(/[.:)]+$|^[(]+/g, '')).filter(Boolean)) {
    const l = tok.toLowerCase(); if (STOP.has(l) || names.has(l) || counts.has(tok)) continue;
    if (/\d/.test(tok) && /[a-z]/i.test(tok)) add(tok);                 // IDs/codes like E1002, L0002
    else if (/^\d{4}-\d{2}-\d{2}$/.test(tok)) add(tok);                 // dates
    else if (/^(1[89]|20)\d{2}$/.test(tok)) add(tok);                  // years (age in 2020)
    else if (cells.has(l) || words.has(l)) add(tok);                     // any value seen in the data
  }
  return [...out.values()];
}
// Literal values in the SQL that come from the data but were never typed (a swapped value, e.g. 'Alice' for 'James').
function sqlLiterals(sql) { return [...String(sql || '').matchAll(/'((?:[^']|'')*)'/g)].map(m => m[1].replace(/''/g, "'")); }
function inputCheck(sql, request, tables) {
  const need = inputValues(request, tables), s = String(sql || '').toLowerCase();
  const missing = need.filter(v => { const l = v.toLowerCase(); return /^\d+(\.\d+)?$/.test(l) ? !new RegExp('(^|[^\\w.])' + l.replace('.', '\\.') + '($|[^\\w.])').test(s) : !s.includes(l); });
  const req = String(request || '').toLowerCase(), cells = new Set();
  for (const t of tables || []) for (const r of t.rows || []) for (const v of r) cells.add(String(v ?? '').trim().toLowerCase());
  const swapped = sqlLiterals(sql).filter(v => v && cells.has(v.toLowerCase()) && !req.includes(v.toLowerCase().replace(/%/g, '')));
  // If we know the content, we know the column: each typed value must be filtered on a column that actually holds it.
  const wrongColumn = [];
  for (const v of need) { const l = v.toLowerCase(); if (missing.includes(v)) continue; const cols = [];
    for (const t of tables || []) (t.columns || []).forEach((c, i) => { if ((t.rows || []).some(r => { const x = String(r[i] ?? '').toLowerCase(); return x === l || x.split(/[\s,;]+/).includes(l); })) cols.push(String(c.name)); });
    if (cols.length && !cols.some(c => new RegExp('(^|[^\\w])' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\w])', 'i').test(sql))) wrongColumn.push({ value: v, columns: cols }); }
  return { ok: !missing.length && !swapped.length && !wrongColumn.length, need, missing, swapped, wrongColumn };
}
// Deterministic repair: a typed value filtered on the wrong column is moved to the column(s) that actually hold it.
function fixColumns(sql, wrongColumn) {
  let out = sql;
  for (const w of wrongColumn) {
    const v = w.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp("((?:[\\w\\[\\]`\"]+\\.)?)[\\[`\"]?\\w+[\\]`\"]?\\s*(=|<>|!=|\\bLIKE\\b)\\s*('" + v + "')", 'gi'), (m, pre, op, lit) => {
      const parts = w.columns.map(c => `${pre}${c} ${op} ${lit}`); return parts.length > 1 ? '(' + parts.join(op === '=' || /like/i.test(op) ? ' OR ' : ' AND ') + ')' : parts[0]; });
  }
  return out;
}
module.exports = { fixColumns, inputValues, inputCheck, fixName, sampleText, fixPrompt, sqliteTranslatePrompt, DIALECTS, VISION_PROMPT, sqlPrompt, schemaText, extractJson, normalizeTables, parseSchemaText, extractSql, validate, sqliteExplain };

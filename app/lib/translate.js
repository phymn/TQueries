// Dialect SQL -> SQLite (practice copy only). Literals are masked while rewriting.
const STRFN = /^(left|right|substring|substr|mid|upper|lower|ucase|lcase|ltrim|rtrim|trim|replace|concat|concat_ws|format|datename|char|nchar|str|stuff|replicate|space|reverse|lpad|rpad|initcap|string_agg|convert|cast|try_cast|try_convert|monthname|dayname|soundex|quotename|coalesce|isnull|nz|iif)$/i;
function textCols(tables) { const set = new Set();
  for (const t of tables || []) (t.columns || []).forEach((c, i) => { const n = String(c.name || c).toLowerCase(), ty = String(c.type || '').toLowerCase();
    const vals = (t.rows || []).map(r => r[i]).filter(v => v != null && v !== '');
    if (/char|text|string|varchar/.test(ty) || (vals.length && vals.some(v => !/^-?\d+(\.\d+)?$/.test(String(v).trim())) && !vals.every(v => /^\d{4}-\d{2}-\d{2}/.test(String(v))))) set.add(n); });
  return set; }
function match(s, i, dir) { let d = 0; for (let j = i; j >= 0 && j < s.length; j += dir) { const c = s[j]; if (c === '(') d += dir; else if (c === ')') d -= dir; if (d === 0) return j; } return -1; }
function leftOp(s, i) { let j = i - 1; while (j >= 0 && /\s/.test(s[j])) j--; const end = j + 1;
  if (s[j] === ')') { j = match(s, j, -1); if (j < 0) return null; j--; while (j >= 0 && /[\w.]/.test(s[j])) j--; return { start: j + 1, end }; }
  if (s[j] === '\u0000') { j--; while (j >= 0 && s[j] !== '\u0000') j--; return { start: j, end }; }
  if (s[j] === '"') { j--; while (j >= 0 && s[j] !== '"') j--; j--; while (j >= 0 && /[\w."]/.test(s[j])) j--; return { start: j + 1, end }; }
  while (j >= 0 && /[\w.]/.test(s[j])) j--; return j + 1 < end ? { start: j + 1, end } : null; }
function rightOp(s, i) { let j = i; while (j < s.length && /\s/.test(s[j])) j++; const start = j;
  if (s[j] === '\u0000') { j++; while (j < s.length && s[j] !== '\u0000') j++; return { start, end: j + 1 }; }
  if (s[j] === '(') { const k = match(s, j, 1); return k < 0 ? null : { start, end: k + 1 }; }
  if (s[j] === '-' || s[j] === '+') j++;
  while (j < s.length && /[\w."]/.test(s[j])) j++; if (s[j] === '(') { const k = match(s, j, 1); if (k < 0) return null; j = k + 1; }
  return j > start ? { start, end: j } : null; }
function splitTop(t, sep = ',') { const out = []; let d = 0, cur = ''; for (const c of t) { if (c === '(') d++; else if (c === ')') d--; if (c === sep && d === 0) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(x => x.trim()); }
function translate(sql, dialect, tables) {
  let s = String(sql).trim().replace(/;\s*$/, ''), notes = [];
  const lits = []; s = s.replace(/'(?:[^']|'')*'/g, m => (lits.push(m), `\u0000${lits.length - 1}\u0000`));
  const lit = t => { const m = /^\u0000(\d+)\u0000$/.exec(String(t).trim()); return m ? lits[m[1]].slice(1, -1).replace(/''/g, "'") : null; };
  const mk = v => (lits.push("'" + String(v).replace(/'/g, "''") + "'"), `\u0000${lits.length - 1}\u0000`);
  const rep = (re, to, note) => { const b = s; s = s.replace(re, to); if (b !== s) notes.push(note); };
  // fx: rewrite calls NAME(args) right-to-left (inner first). cb(args, NAME, rawInner, after) -> string | [string, consumed] | null
  const fx = (names, cb) => { const re = new RegExp('(?<![\\w."])(' + names + ')\\s*\\(', 'gi'); const pos = []; let m; while ((m = re.exec(s))) pos.push([m.index, m[1], m.index + m[0].length - 1]);
    for (const [at, name, open] of pos.reverse()) { const close = match(s, open, 1); if (close < 0) continue; const inner = s.slice(open + 1, close);
      const r = cb(inner.trim() === '' ? [] : splitTop(inner), name.toUpperCase(), inner, s.slice(close + 1)); if (r == null) continue;
      const [txt, extra] = Array.isArray(r) ? r : [r, 0]; s = s.slice(0, at) + txt + s.slice(close + 1 + extra); notes.push(name.toUpperCase()); } };
  const ss = dialect === 'sqlserver', my = dialect === 'mysql', pg = dialect === 'postgresql', ora = dialect === 'oracle', acc = dialect === 'access';
  rep(/#(\d{1,2})\/(\d{1,2})\/(\d{4})#/g, (_, m, d, y) => `'${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}'`, '#date#');
  rep(/#(\d{4}-\d{2}-\d{2})#/g, "'$1'", '#date#');
  s = s.replace(/'(?:[^']|'')*'/g, m => (lits.push(m), `\u0000${lits.length - 1}\u0000`)); // dates from #...#
  rep(/\[([^\]]+)\]/g, '"$1"', '[ ]'); rep(/`([^`]+)`/g, '"$1"', '` `'); rep(/\b[NE](?=\u0000)/g, '', "N''");
  rep(/\b(?:date|timestamp)\s+(?=\u0000)/gi, '', "DATE ''");
  let top = null; rep(/^(\s*(?:with[\s\S]*?\)\s*)?select\s+(?:distinct\s+)?)top\s*\(?\s*(\d+)\s*\)?\s*(?:percent\s+)?/i, (m, a, n) => (top = n, a), 'TOP');
  rep(/\boffset\s+(\d+)\s+rows?\s+fetch\s+(?:first|next)\s+(\d+)\s+rows?\s+only/gi, 'LIMIT $2 OFFSET $1', 'FETCH');
  rep(/\bfetch\s+(?:first|next)\s+(\d+)\s+rows?\s+only/gi, 'LIMIT $1', 'FETCH');
  rep(/\bwith\s*\(\s*nolock\s*\)/gi, '', 'NOLOCK'); rep(/::\s*\w+(?:\s+precision)?(\s*\([\d,\s]*\))?/gi, '', '::cast');
  // String concatenation with + (SQL Server / Access) when either side is text.
  if (ss || acc) { const tc = textCols(tables);
    const isStr = (o) => { if (!o) return false; const t = s.slice(o.start, o.end).trim(); if (t[0] === '\u0000') return true; if (t[0] === '(') return /\|\||\u0000/.test(t) && !/^\(\s*select/i.test(t);
      const fm = t.match(/^([\w.]+)\s*\(/); if (fm) { const n = fm[1].split('.').pop(); return STRFN.test(n) && (!/^(cast|convert|try_cast|try_convert)$/i.test(n) || /char|text|string/i.test(t)) && !(/^(coalesce|isnull|nz|iif)$/i.test(n) && !/\u0000|\|\|/.test(t)); }
      return tc.has(t.replace(/"/g, '').split('.').pop().toLowerCase()); };
    for (let i = s.length - 1; i >= 0; i--) if (s[i] === '+' || (acc && s[i] === '&')) { if (s[i] === '&') { s = s.slice(0, i) + '||' + s.slice(i + 1); continue; } const l = leftOp(s, i), r = rightOp(s, i + 1); if (l && r && (isStr(l) || isStr(r))) { s = s.slice(0, i) + '||' + s.slice(i + 1); notes.push('+ concat'); } } }
  // Intervals: x + INTERVAL '1' DAY, x - INTERVAL 3 MONTH, x + INTERVAL '2 years'
  for (let k = 0; k < 20; k++) { const m = /([+-])\s*interval\s+(\u0000\d+\u0000|\d+)\s*(year|month|day|week|quarter|hour|minute|second)?s?\b/i.exec(s); if (!m) break;
    let n = lit(m[2]) ?? m[2], unit = m[3]; const mm = String(n).trim().match(/^(-?\d+)\s*([a-z]+)?/i); n = mm ? mm[1] : n; unit = unit || (mm && mm[2]) || 'day';
    const l = leftOp(s, m.index); if (!l) break; s = s.slice(0, l.start) + `DATEADD(${mk(unit.replace(/s$/i, ''))}, ${m[1] === '-' ? '-' : ''}${n}, ${s.slice(l.start, l.end)})` + s.slice(m.index + m[0].length); notes.push('INTERVAL'); }
  // PostgreSQL / Oracle: date - date = days
  if (pg || ora) { const dateish = t => /current_date|curdate|now\s*\(|sysdate|getdate|date|_dt\b|birth|dob|^\u0000\d+\u0000$/i.test(t) && !/^\d+(\.\d+)?$/.test(t) && !/^\u0000/.test(t) || (/^\u0000/.test(t) && /^\d{4}-\d{2}-\d{2}/.test(lit(t) || ''));
    for (let i = s.length - 1; i > 0; i--) if (s[i] === '-' && s[i - 1] !== '-' && s[i + 1] !== '-') { const l = leftOp(s, i), r = rightOp(s, i + 1); if (!l || !r) continue;
      const a = s.slice(l.start, l.end), b = s.slice(r.start, r.end); if (dateish(a) && dateish(b) && !/^DATEADD/i.test(b)) { s = s.slice(0, l.start) + `TQ_DAYS(${a}, ${b})` + s.slice(r.end); notes.push('date-date'); i = l.start; } } }
  const U = s => String(s).replace(/^'|'$/g, '');
  const unit = a => { const l = lit(a); return mk(l != null ? l : String(a).replace(/^'|'$/g, '')); };
  // ---- dates
  rep(/\bcurrent_date\b(\s*\(\s*\))?/gi, 'CURDATE()', 'CURRENT_DATE'); rep(/\b(sysdate|current_timestamp|localtimestamp|systimestamp)\b(\s*\(\s*\))?/gi, 'NOW()', 'SYSDATE');
  rep(/\b(sysdatetime|getutcdate|utc_timestamp)\s*\(\s*\)/gi, 'GETDATE()', 'SYSDATETIME');
  if (acc) { rep(/(?<![\w.])date\s*\(\s*\)/gi, 'CURDATE()', 'Date()'); rep(/\bmod\b(?!\s*\()/gi, '%', 'Mod'); }
  fx('extract', (a, n, raw) => { const m = raw.match(/^\s*(\w+)\s+from\s+([\s\S]+)$/i); return m ? `DATE_PART(${mk(m[1])}, ${m[2]})` : null; });
  fx('datepart|datename|dateadd|datediff|timestampdiff|timestampadd|date_part|date_trunc', (a, n) => {
    if (n === 'DATEDIFF' && a.length === 2) return `TQ_DAYS(${a[0]}, ${a[1]})`;
    if (n === 'TIMESTAMPADD') return `DATEADD(${unit(a[0])}, ${a[1]}, ${a[2]})`;
    if (n === 'DATEDIFF' && acc) return `DATEDIFF(${unit(a[0])}, ${a[1]}, ${a[2]})`;
    return `${n}(${unit(a[0])}${a.length > 1 ? ', ' + a.slice(1).join(', ') : ''})`; });
  fx('date_add|date_sub|adddate|subdate', (a, n) => { const m = (a[1] || '').match(/^interval\s+([\s\S]+?)\s+(\w+)$/i); const sign = /sub/i.test(n) ? '-' : '';
    if (m) return `DATEADD(${mk(m[2])}, ${sign}(${lit(m[1]) ?? m[1]}), ${a[0]})`; return `DATEADD('d', ${sign}(${a[1]}), ${a[0]})`; });
  fx('add_months', a => `DATEADD('m', ${a[1]}, ${a[0]})`);
  fx('age', a => a.length === 1 ? `AGE(CURDATE(), ${a[0]})` : null);
  fx('eomonth', a => a.length === 2 ? `TQ_EOM2(${a[0]}, ${a[1]})` : null);
  fx('datefromparts|make_date|dateserial', a => `TQ_MKDATE(${a.join(', ')})`);
  fx('to_date|str_to_date|to_timestamp', a => `TO_DATE(${a[0]}, ${a[1] || 'NULL'})`);
  fx('dayofmonth', a => `DAY(${a[0]})`); fx('week|isoweek|datepart_week', a => `WEEKOFYEAR(${a[0]})`);
  if (acc) fx('weekday', a => `DAYOFWEEK(${a[0]})`);
  fx('format', (a, n) => ss ? `NETFORMAT(${a[0]}, ${a[1] || "''"})` : my ? `TQ_MYNUM(${a[0]}, ${a[1] || 0})` : acc ? `VBFORMAT(${a[0]}, ${a[1] || "''"})` : null);
  if (pg) fx('to_char', a => `TQ_PGCHAR(${a[0]}, ${a[1] || 'NULL'})`); else fx('to_char', a => a.length === 1 ? `CAST(${a[0]} AS TEXT)` : null);
  // ---- casts
  const castT = (x, t) => { t = t.trim(); const m = t.match(/^(\w+)\s*(?:\(\s*(\w+)\s*(?:,\s*(\d+))?\s*\))?/); const k = (m ? m[1] : t).toLowerCase();
    if (k === 'date') return `TQ_TODATE(${x})`; if (/^(datetime2?|timestamp|smalldatetime|datetimeoffset)$/.test(k)) return `TQ_TODT(${x})`;
    if (/^(decimal|numeric|number|money|smallmoney|dec)$/.test(k)) return m[3] != null ? `TQ_ROUND(CAST(${x} AS REAL), ${m[3]})` : (k === 'number' && !m[2]) ? `CAST(${x} AS REAL)` : m[2] != null && k !== 'money' ? `TQ_ROUND(CAST(${x} AS REAL), 0)` : `CAST(${x} AS REAL)`;
    if (/^(int|integer|bigint|smallint|tinyint|signed|unsigned|long)$/.test(k)) return `CAST(${x} AS INTEGER)`;
    if (/^(float|real|double|binary_double|binary_float)$/.test(k)) return `CAST(${x} AS REAL)`;
    if (/char|text|string|clob/.test(k)) return `CAST(${x} AS TEXT)`; return `CAST(${x} AS ${t})`; };
  fx('cast|try_cast|safe_cast', (a, n, raw) => { const p = splitTop(raw.replace(/\s+as\s+/gi, '\u0001'), '\u0001'); if (p.length < 2) return null; const t = p.pop(); return castT(p.join(' AS '), t); });
  fx('convert|try_convert', (a, n, raw) => { if (/\busing\b/i.test(raw)) return a[0].replace(/\s+using\s+\w+$/i, '');
    if (my) return a.length === 2 ? castT(a[0], a[1]) : null;
    if (a.length === 3 && /char|text/i.test(a[0])) return `TQ_STYLE(${a[1]}, ${a[2]})`; return a.length >= 2 ? castT(a[1], a[0]) : null; });
  if (acc) { fx('cstr', a => `CAST(${a[0]} AS TEXT)`); fx('cint|clng', a => `CAST(ROUND(${a[0]}) AS INTEGER)`); fx('cdbl|csng|ccur|val', a => `CAST(${a[0]} AS REAL)`); fx('cdate|datevalue', a => `TQ_TODATE(${a[0]})`);
    fx('int', a => `FLOOR(${a[0]})`); fx('fix', a => `TQ_TRUNC2(${a[0]}, 0)`); fx('str', a => `CAST(${a[0]} AS TEXT)`); fx('isnull', a => a.length === 1 ? `(${a[0]} IS NULL)` : null);
    fx('switch', a => { let o = 'CASE'; for (let i = 0; i + 1 < a.length; i += 2) o += ` WHEN ${a[i]} THEN ${a[i + 1]}`; return o + ' END'; }); }
  // ---- text
  fx('char_length|character_length|datalength|octet_length|lengthb', a => `LENGTH(${a[0]})`);
  if (!ss && !acc) fx('len', a => `LENGTH(${a[0]})`);
  fx('left', a => `TQ_LEFT(${a[0]}, ${a[1]})`); fx('right', a => `TQ_RIGHT(${a[0]}, ${a[1]})`);
  fx('substring|substr|mid', (a, n, raw) => { const m = raw.match(/^([\s\S]+?)\s+from\s+([\s\S]+?)(?:\s+for\s+([\s\S]+))?$/i);
    if (m) return `SUBSTR(${m[1]}, ${m[2]}${m[3] ? ', ' + m[3] : ''})`; return `SUBSTR(${a.join(', ')})`; });
  fx('position', (a, n, raw) => { const m = raw.match(/^([\s\S]+?)\s+in\s+([\s\S]+)$/i); return m ? `INSTR(${m[2]}, ${m[1]})` : null; });
  fx('strpos', a => `INSTR(${a[0]}, ${a[1]})`); fx('locate', a => `TQ_INSTR(${a[1]}, ${a[0]}, ${a[2] || 1}, 1)`);
  fx('charindex', a => `TQ_INSTR(${a[1]}, ${a[0]}, ${a[2] || 1}, 1)`);
  fx('instr', a => acc && a.length >= 3 && /^\d+$/.test(a[0]) ? `TQ_INSTR(${a[1]}, ${a[2]}, ${a[0]}, 1)` : a.length > 2 ? `TQ_INSTR(${a[0]}, ${a[1]}, ${a[2]}, ${a[3] || 1})` : null);
  fx('trim', (a, n, raw) => { const m = raw.match(/^\s*(both|leading|trailing)?\s*([\s\S]*?)\s*from\s+([\s\S]+)$/i); if (!m) return null; const f = (m[1] || 'both').toLowerCase(), c = m[2] || "' '";
    return `${f === 'leading' ? 'LTRIM' : f === 'trailing' ? 'RTRIM' : 'TRIM'}(${m[3]}, ${c})`; });
  fx('repeat', a => `REPLICATE(${a[0]}, ${a[1]})`); fx('space', a => `REPLICATE(' ', ${a[0]})`);
  fx('lpad|rpad', (a, n) => `TQ_${n}(${a[0]}, ${a[1]}, ${a[2] || "' '"})`);
  fx('ascii', a => `UNICODE(${a[0]})`); fx('chr|nchar', a => `CHAR(${a[0]})`);
  fx('regexp_like', a => `TQ_RLIKE(${a[0]}, ${a[1]}, ${a[2] || "''"})`);
  fx('regexp_replace', a => `TQ_RREP(${a[0]}, ${a[1]}, ${a[2] || "''"}, ${pg ? (a[3] || "''") : "'g'"})`);
  fx('regexp_substr|substring_regex', a => `TQ_RSUB(${a[0]}, ${a[1]})`); fx('regexp_count', a => `TQ_RCOUNT(${a[0]}, ${a[1]})`);
  rep(/\s(!?)~(\*?)\s*(\u0000\d+\u0000)/g, (m, not, ci) => ` ${not ? 'NOT ' : ''}${ci ? 'LIKE' : 'REGEXP'} ${m.slice(m.indexOf('\u0000'))}`, '~');
  if (acc) s = s.replace(/\blike\s+\u0000(\d+)\u0000/gi, (m, i) => { lits[i] = lits[i].replace(/\*/g, '%').replace(/\?/g, '_'); return m; }); // v0.5: Access wildcards * ?
  rep(/\brlike\b/gi, 'REGEXP', 'RLIKE'); rep(/\bilike\b/gi, 'LIKE', 'ILIKE');
  fx('listagg|string_agg|group_concat', (a, n, raw, after) => { const w = after.match(/^\s*within\s+group\s*\(\s*order\s+by\s+/i); let ord = '', used = 0;
    if (w) { const o = after.indexOf('(', after.search(/group/i)); const c = match(after, o, 1); ord = ' ORDER BY ' + after.slice(o + 1, c).replace(/^\s*order\s+by\s+/i, ''); used = c + 1; }
    let x = raw, sep = null; const sm = raw.match(/^([\s\S]*?)\s+separator\s+(\u0000\d+\u0000)\s*$/i); if (sm) { x = sm[1]; sep = sm[2]; }
    const om = x.match(/^([\s\S]*?)\s+order\s+by\s+([\s\S]+)$/i); if (om && !/\(/.test(om[2].replace(/\([^()]*\)/g, ''))) { x = om[1]; ord = ' ORDER BY ' + om[2]; }
    let parts = splitTop(x); if (parts.length > 1) { sep = sep || parts[1]; x = parts[0]; } sep = sep || (n === 'LISTAGG' ? "''" : "','");
    if (/^\s*distinct\b/i.test(x)) return [`REPLACE(GROUP_CONCAT(${x}${ord}), ',', ${sep})`, used];
    return [`GROUP_CONCAT(${x}, ${sep}${ord})`, used]; });
  // ---- numbers / stats
  fx('round', a => a.length === 2 ? `TQ_ROUND(${a[0]}, ${a[1]})` : a.length === 3 ? `TQ_ROUND3(${a[0]}, ${a[1]}, ${a[2]})` : null);
  fx('trunc|truncate', a => a.length === 2 ? `TQ_TRUNC2(${a[0]}, ${a[1]})` : null);
  fx('pow', a => `POWER(${a.join(', ')})`); fx('square', a => `((${a[0]}) * (${a[0]}))`);
  fx('log', a => a.length === 1 ? ((pg || ora) ? `LOG10(${a[0]})` : `LN(${a[0]})`) : (ss ? `(LN(${a[0]}) / LN(${a[1]}))` : `(LN(${a[1]}) / LN(${a[0]}))`));
  if (my) rep(/\bdiv\b/gi, '/', 'DIV');
  const sd = (pop, sq) => (a, n, raw, after) => { const w = after.match(/^\s*over\s*\(/i); const x = a[0].replace(/^distinct\s+/i, '');
    if (!w) return `${sq ? 'TQ_STDEV' : 'TQ_VAR'}${pop ? 'P' : ''}(${x})`; const o = after.indexOf('('), c = match(after, o, 1), ov = 'OVER (' + after.slice(o + 1, c) + ')';
    const v = `((SUM((${x}) * (${x})) ${ov} - SUM(${x}) ${ov} * SUM(${x}) ${ov} / COUNT(${x}) ${ov}) / (COUNT(${x}) ${ov}${pop ? '' : ' - 1'}))`; return [sq ? `SQRT(${v})` : v, c + 1]; };
  fx('stdevp|stddev_pop|stdev_pop', sd(true, true)); fx('varp|var_pop|variance_pop', sd(true, false));
  fx('stdev|stddev|std|stddev_samp|stdev_samp', (a, n, r, af) => sd(my && /^(STD|STDDEV)$/.test(n), true)(a, n, r, af));
  fx('var|variance|var_samp', (a, n, r, af) => sd(my && n === 'VARIANCE', false)(a, n, r, af));
  fx('percentile_cont|percentile_disc', (a, n, raw, after) => { const w = after.match(/^\s*within\s+group\s*\(/i); if (!w) return null; const o = after.indexOf('('), c = match(after, o, 1);
    const x = after.slice(o + 1, c).replace(/^\s*order\s+by\s+/i, '').replace(/\s+(asc|desc)\s*$/i, ''); return [`${n === 'PERCENTILE_CONT' ? 'TQ_PCTC' : 'TQ_PCTD'}(${x}, ${a[0]})`, c + 1]; });
  fx('mode', (a, n, raw, after) => { const w = after.match(/^\s*within\s+group\s*\(/i); if (!w || a.length) return null; const o = after.indexOf('('), c = match(after, o, 1);
    const x = after.slice(o + 1, c).replace(/^\s*order\s+by\s+/i, ''); return [`MODE(${x})`, c + 1]; });
  // ---- conditions
  fx('if', a => a.length === 3 ? `IIF(${a.join(', ')})` : null); fx('greatest', a => `MAX(${a.join(', ')})`); fx('least', a => `MIN(${a.join(', ')})`);
  fx('isnull', a => a.length === 2 ? `COALESCE(${a[0]}, ${a[1]})` : `(${a[0]} IS NULL)`);
  if (my || ora || acc) rep(/(?<![*\/])\/(?![*\/])/g, '* 1.0 /', '/ real');
  fx('nz', a => a.length === 1 ? `COALESCE(${a[0]}, 0)` : null);
  fx('decode', a => { let o = 'CASE'; let i = 1; for (; i + 1 < a.length; i += 2) o += ` WHEN ${a[0]} = ${a[i]} THEN ${a[i + 1]}`; return o + (i < a.length ? ` ELSE ${a[i]}` : '') + ' END'; });
  fx('choose', a => `CASE ${a[0]}${a.slice(1).map((v, i) => ` WHEN ${i + 1} THEN ${v}`).join('')} END`);
  if (top) { s += ` LIMIT ${top}`; }
  for (let k = 0; k < 3 && /\u0000/.test(s); k++) s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => lits[i]);
  return { sql: s, changed: notes.length > 0, notes: [...new Set(notes)] };
}
module.exports = { translate, textCols };

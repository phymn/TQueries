// TQueries v0.5 "Instant" — deterministic SQL for common questions, in all 6 dialects. Pure, no network, ~1 ms.
// Returns { sql, explanation, pattern } when confident, or null (the local model takes over).
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const lc = s => String(s || '').toLowerCase();
const words = n => lc(n).replace(/([a-z])([A-Z])/g, '$1_$2').split(/[^a-z0-9áéíóúñ]+/).filter(Boolean);
const ABBR = { f: 'first', fname: 'first', l: 'last', lname: 'last', b: 'birth', dob: 'birth', bdate: 'birth', dep: 'department', dept: 'department', emp: 'employee', qty: 'quantity', amt: 'amount', addr: 'address', cust: 'customer', inv: 'invoice', no: 'number', num: 'number', desc: 'description', mgr: 'manager', loc: 'location', sal: 'salary' };
const ES = { nombre: 'name', apellido: 'last', salario: 'salary', sueldo: 'salary', direccion: 'address', dirección: 'address', departamento: 'department', fecha: 'date', nacimiento: 'birth', ciudad: 'city', cliente: 'customer', total: 'total', precio: 'price', cantidad: 'quantity' };
const KIND = {
  first: n => /^(f_?name|first_?name|fname|given_?name|nombre)$/i.test(n),
  last: n => /^(l_?name|last_?name|lname|surname|apellidos?)$/i.test(n),
  name: n => /(^|_)(name|nombre)$/i.test(n),
  birth: n => /(^|_)(b_?date|birth\w*|dob|f_?nac\w*|nacimiento)$/i.test(n) || /birth|nacim/i.test(n),
  date: n => /date|fecha|_dt$|time/i.test(n),
};
const NUMWORDS = /salary|salario|sueldo|amount|total|price|precio|qty|quantity|cantidad|cost|costo|wage|pay|balance|score|age|edad|count|monto|importe/i;

function q(d, name) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : d === 'mysql' ? '`' + name + '`' : (d === 'sqlserver' || d === 'access') ? '[' + name + ']' : '"' + name.replace(/"/g, '""') + '"'; }
const str = v => "'" + String(v).replace(/'/g, "''") + "'";

// Dialect builders
function DX(d) {
  const ss = d === 'sqlserver', my = d === 'mysql', pg = d === 'postgresql', ora = d === 'oracle', acc = d === 'access', lite = d === 'sqlite';
  const today = ss ? 'CAST(GETDATE() AS DATE)' : my ? 'CURDATE()' : pg ? 'CURRENT_DATE' : ora ? 'TRUNC(SYSDATE)' : acc ? 'Date()' : "date('now', 'localtime')";
  const dateLit = iso => acc ? `#${+iso.slice(5, 7)}/${+iso.slice(8, 10)}/${iso.slice(0, 4)}#` : (pg || ora) ? `DATE '${iso}'` : `'${iso}'`;
  const liteMonth = c => `CASE strftime('%m', ${c})${MON.map((m, i) => ` WHEN '${String(i + 1).padStart(2, '0')}' THEN '${m}'`).join('')} END`;
  const X = {
    today, dateLit,
    len: c => ss ? `LEN(${c})` : my ? `CHAR_LENGTH(${c})` : acc ? `Len(${c})` : `LENGTH(${c})`,
    cat: (parts, sep = " ' ' ") => { sep = sep.trim(); return my ? `CONCAT(${parts.join(`, ${sep}, `)})` : parts.join(ss ? ` + ${sep} + ` : acc ? ` & ${sep} & ` : ` || ${sep} || `); },
    cat0: parts => my ? `CONCAT(${parts.join(', ')})` : parts.join(ss ? ' + ' : acc ? ' & ' : ' || '),
    left1: c => (ora || lite) ? `SUBSTR(${c}, 1, 1)` : acc ? `Left(${c}, 1)` : `LEFT(${c}, 1)`,
    fmtDate: c => ss ? `FORMAT(${c}, 'MMMM d, yyyy')` : my ? `DATE_FORMAT(${c}, '%M %e, %Y')` : pg ? `TO_CHAR(${c}, 'FMMonth FMDD, YYYY')` : ora ? `TO_CHAR(${c}, 'fmMonth DD, YYYY')` : acc ? `Format(${c}, 'mmmm d, yyyy')`
      : `${liteMonth(c)} || ' ' || CAST(strftime('%d', ${c}) AS INTEGER) || ', ' || strftime('%Y', ${c})`,
    month: c => ss ? `DATENAME(MONTH, ${c})` : my ? `MONTHNAME(${c})` : pg ? `TO_CHAR(${c}, 'FMMonth')` : ora ? `TO_CHAR(${c}, 'fmMonth')` : acc ? `MonthName(Month(${c}))` : liteMonth(c),
    // completed years between birth c and date x
    age: (c, x) => ss ? `DATEDIFF(YEAR, ${c}, ${x}) - CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, ${c}, ${x}), ${c}) > ${x} THEN 1 ELSE 0 END`
      : my ? `TIMESTAMPDIFF(YEAR, ${c}, ${x})` : pg ? `DATE_PART('year', AGE(${x}, ${c}))` : ora ? `TRUNC(MONTHS_BETWEEN(${x}, ${c}) / 12)`
      : acc ? `DateDiff('yyyy', ${c}, ${x}) + IIf(DateSerial(Year(${x}), Month(${c}), Day(${c})) > ${x}, -1, 0)`
      : `(CAST(strftime('%Y', ${x}) AS INTEGER) - CAST(strftime('%Y', ${c}) AS INTEGER) - (strftime('%m-%d', ${x}) < strftime('%m-%d', ${c})))`,
    daysToBirthday: c => { const n = acc ? `1 + ${X.age(c, today)}` : `(${X.age(c, today)}) + 1`;
      return ss ? `DATEDIFF(DAY, ${today}, DATEADD(YEAR, ${n}, ${c}))` : my ? `DATEDIFF(DATE_ADD(${c}, INTERVAL (${n}) YEAR), ${today})`
        : pg ? `MAKE_DATE(CAST(DATE_PART('year', ${c}) AS INT) + ${n}, CAST(DATE_PART('month', ${c}) AS INT), CAST(DATE_PART('day', ${c}) AS INT)) - ${today}`
        : ora ? `ADD_MONTHS(${c}, 12 * (${n})) - ${today}` : acc ? `DateDiff('d', ${today}, DateAdd('yyyy', ${n}, ${c}))`
        : `CAST(julianday(date(${c}, '+' || (${n}) || ' years')) - julianday(${today}) AS INTEGER)`; },
    avg: c => ss ? `AVG(${c} * 1.0)` : `AVG(${c})`,
    sd: c => ss ? `STDEV(${c})` : ora ? `STDDEV(${c})` : acc ? `StDev(${c})` : lite ? `SQRT((SUM(${c} * ${c}) - SUM(${c}) * SUM(${c}) * 1.0 / COUNT(${c})) / (COUNT(${c}) - 1))` : `STDDEV_SAMP(${c})`,
    roundTo: (c, places) => places < 0 && (acc || lite) ? `ROUND(${c} / ${10 ** -places}.0, 0) * ${10 ** -places}` : `ROUND(${c}, ${places})`,
    iif: (cond, a, b) => acc ? `IIf(${cond}, ${a}, ${b})` : `CASE WHEN ${cond} THEN ${a} ELSE ${b} END`,
    like: v => acc ? `'*${String(v).replace(/'/g, "''")}*'` : `'%${String(v).replace(/'/g, "''")}%'`,
    select: ({ cols, from, where, group, order, limit }) => {
      const top = limit && (ss || acc) ? `TOP ${limit} ` : '';
      let s = `SELECT ${top}${cols.join(', ')}\nFROM ${from}`;
      if (where && where.length) s += `\nWHERE ${where.join(' AND ')}`; if (group && group.length) s += `\nGROUP BY ${group.join(', ')}`; if (order) s += `\nORDER BY ${order}`;
      if (limit && !(ss || acc)) s += ora ? `\nFETCH FIRST ${limit} ROWS ONLY` : `\nLIMIT ${limit}`;
      return s + ';'; },
  };
  return X;
}

// Column matching
function colPhrases(c) { const w = words(c.name).map(x => ABBR[x] || x); return /(^|_)id$/i.test(c.name) ? [w.join(' ')] : [w.join(' '), w.filter(x => x !== 'id').join(' ')].filter(Boolean); }
function normReq(r) { return ' ' + lc(r).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ'%]+/g, ' ').split(' ').map(x => ES[x] || x.replace(/s$/, '')).join(' ') + ' '; }
function mentioned(req, t) { // columns of table t named in the request (exact name or expanded phrase)
  const R = normReq(req), raw = lc(req), out = [];
  for (const c of t.columns) { const n = lc(c.name);
    if (new RegExp('(^|[^a-z0-9_])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9_])').test(raw)) { out.push(c.name); continue; }
    for (const p of colPhrases(c)) { const pp = p.split(' ').map(x => x.replace(/s$/, '')).join(' '); if (pp && pp.length >= 3 && R.includes(' ' + pp + ' ')) { out.push(c.name); break; } } }
  return out;
}
const find = (t, k) => (t.columns.find(c => KIND[k](c.name)) || {}).name;
const isNumCol = (t, n) => { const i = t.columns.findIndex(c => c.name === n), c = t.columns[i]; if (/int|num|dec|real|float|money|double/i.test(c.type || '')) return true;
  if (t.rows && t.rows.length) return t.rows.every(r => r[i] == null || r[i] === '' || !isNaN(Number(r[i]))) && !/(^|_)id$|_id_|code|zip|phone|ssn/i.test(n); return NUMWORDS.test(n); };
const isTextCol = (t, n) => !isNumCol(t, n) && !KIND.date(n);
function labelCols(t) { const f = find(t, 'first'), l = find(t, 'last'); if (f && l) return [f, l]; const n = t.columns.find(c => KIND.name(c.name) && !/_id$/i.test(c.name)); return n ? [n.name] : [t.columns[0].name]; }

// Typed values -> column in main table that holds them
function valueFilters(tables, main, request, S) {
  const vals = S.inputValues(request, tables), out = [], other = [];
  for (const v of vals) { const l = lc(v); let hit = null;
    main.columns.forEach((c, i) => { if (!hit && (main.rows || []).some(r => lc(r[i]) === l)) hit = c.name; });
    if (hit) out.push([hit, v]); else if (/^(1[89]|20)\d{2}$/.test(v)) continue; else other.push(v); }
  return { filters: out, unknown: other };
}

function build(tables, request, dialect, S, TD) {
  const X = DX(dialect), Q = n => q(dialect, n), r = lc(request), R = normReq(request);
  // main table: most mentioned columns; ties -> one with birth date / first table
  const scored = tables.map(t => ({ t, m: mentioned(request, t), b: find(t, 'birth') ? 1 : 0, named: R.includes(' ' + words(t.name).join(' ').replace(/s$/, '') + ' ') ? 1 : 0 }));
  scored.sort((a, b) => (b.m.length + b.named * 0.5) - (a.m.length + a.named * 0.5) || b.b - a.b);
  const main = scored[0].t, M = scored[0].m, other = scored.slice(1).filter(s => s.m.length);
  const lbl = labelCols(main).map(Q), birth = find(main, 'birth'), first = find(main, 'first'), last = find(main, 'last');
  const numM = M.filter(n => isNumCol(main, n) && !/(^|_)id$/i.test(n)), textM = M.filter(n => isTextCol(main, n));
  const vf = valueFilters(tables, main, request, S);
  const jb = require('./joins').build(tables, request, dialect, module.exports, TD); if (jb) return jb; // v0.5.2: two-table questions
  // typed values we can't place must still end up in the SQL (checked by inputCheck in match())
  if (other.length) { // simple join via detected key, no filters
    const o = other[0].t, fk = TD.inferFks(tables).find(k => (k.table === main.name && k.parent === o.name) || (k.table === o.name && k.parent === main.name));
    if (!fk || vf.filters.length || other.length > 1 || !/\b(with|and|plus|con|y)\b|\bname|\bnombre/.test(r)) return null;
    const on = `m.${Q(fk.column)} = o.${Q(fk.parentColumn)}`, onR = `o.${Q(fk.column)} = m.${Q(fk.parentColumn)}`;
    const cols = [...(M.length && !M.every(n => n === fk.column || n === fk.parentColumn) ? M.filter(n => n !== fk.column && n !== fk.parentColumn) : labelCols(main)).map(n => 'm.' + Q(n)), ...other[0].m.filter(n => n !== fk.column && n !== fk.parentColumn).map(n => 'o.' + Q(n))];
    if (cols.length < 2) return null;
    return { pattern: 'join', sql: X.select({ cols, from: `${Q(main.name)} m\n${dialect === 'oracle' ? '' : ''}JOIN ${Q(o.name)} o ON ${fk.table === main.name ? on : onR}` }), explanation: ['Joins the two tables on their matching key.', 'Une las dos tablas por su clave común.'] };
  }
  const where = vf.filters.map(([c, v]) => `${Q(c)} = ${isNumCol(main, c) && !isNaN(Number(v)) ? v : str(v)}`);
  const from = Q(main.name), sel = (cols, extra = {}) => X.select({ cols, from, where, ...extra });
  const withLbl = (expr, alias) => [...(vf.filters.length ? [] : lbl), `${expr} AS ${alias}`];
  const year = (r.match(/\b(1[89]\d{2}|20\d{2})\b/) || [])[1];
  const textCol = () => textM[0] || first || (main.columns.find(c => KIND.name(c.name)) || {}).name;

  // 1. character count
  if (/\b(characters?|chars?|letters?|length|caracteres|letras|longitud)\b/.test(r) && !/\bsort|order|ordena/.test(r)) { const c = textCol(); if (!c) return null;
    return { pattern: 'length', sql: sel(withLbl(X.len(Q(c)), Q(c + '_LENGTH').replace(/[\[\]`"]/g, ''))), explanation: [`Counts the characters in ${c}.`, `Cuenta los caracteres de ${c}.`] }; }
  // 2. days until next birthday
  if (birth && /\b(days?|d[ií]as)\b/.test(r) && /birthday|cumplea/.test(r))
    return { pattern: 'days-to-birthday', sql: sel(withLbl(X.daysToBirthday(Q(birth)), 'DAYS_TO_BIRTHDAY')), explanation: ['Days from today to each next birthday.', 'Días desde hoy hasta el próximo cumpleaños.'] };
  // 3. age at a year / current age
  if (birth && /\b(age|ages|old|edad|edades|a[nñ]os tiene|a[nñ]os ten[ií]a)\b/.test(r)) {
    const x = year ? X.dateLit(year + '-12-31') : X.today;
    return { pattern: year ? 'age-at-year' : 'age', sql: sel(withLbl(X.age(Q(birth), x), year ? 'AGE_' + year : 'AGE')), explanation: year ? [`Completed years on Dec 31, ${year}.`, `Años cumplidos al 31 de diciembre de ${year}.`] : ['Completed years as of today.', 'Años cumplidos a hoy.'] }; }
  // 4. formatted date
  const dateC = M.find(n => KIND.date(n)) || birth;
  if (dateC && /format|formatted|formato|written|escrita|spelled|like ['"]?[a-z]+ \d|como ['"]?\d* ?(de )?[a-z]+/.test(r) && !/month only|solo el mes/.test(r))
    return { pattern: 'format-date', sql: sel(withLbl(X.fmtDate(Q(dateC)), dateC === birth ? 'BIRTH_DATE' : Q(dateC + '_TEXT'))), explanation: ['Dates written like “January 9, 1976”.', 'Fechas escritas como “January 9, 1976”.'] };
  // 5. month name
  if (dateC && /\b(month|mes)\b/.test(r) && !/\bper month|by month|por mes|each month\b/.test(r))
    return { pattern: 'month', sql: sel(withLbl(X.month(Q(dateC)), dateC === birth ? 'BIRTH_MONTH' : 'MONTH_NAME')), explanation: ['Month name of each date.', 'Nombre del mes de cada fecha.'] };
  // 6. full name / initials
  if (first && last && /full name|nombre completo|complete name/.test(r))
    return { pattern: 'full-name', sql: sel([`${X.cat([Q(first), Q(last)])} AS FULL_NAME`]), explanation: ['First and last name together.', 'Nombre y apellido juntos.'] };
  if (first && last && /initials|iniciales/.test(r))
    return { pattern: 'initials', sql: sel([...(vf.filters.length ? [] : lbl), `${X.cat0([X.left1(Q(first)), X.left1(Q(last))])} AS INITIALS`]), explanation: ['First letter of each name.', 'Primera letra de cada nombre.'] };
  // numeric column for the rest
  const num = numM[0] || (/salar|sueldo/.test(r) && main.columns.find(c => /salar|sueldo/i.test(c.name)) || {}).name;
  // 7. rounded
  if (num && /\bround(ed)?|redonde/.test(r)) { const places = /thousand|\bmil(es)?\b|1,?000\b/.test(r) ? -3 : /hundred|cientos|centena/.test(r) ? -2 : /\bten|decena/.test(r) ? -1 : +((r.match(/(\d)\s*(decimal|decimales)/) || [])[1] || 0);
    return { pattern: 'round', sql: sel(withLbl(X.roundTo(Q(num), places), Q(num + '_ROUNDED').replace(/[\[\]`"]/g, ''))), explanation: [`${num} rounded.`, `${num} redondeado.`] }; }
  // 8. band / label (CASE)
  const thr = r.match(/(?:over|above|greater than|more than|at least|>=?|m[aá]s de|mayor(?:es)? (?:a|que)|superior(?:es)? a|arriba de)\s*\$?\s*([\d,.]+)/);
  if (num && thr && /\b(label|band|categor\w*|classif\w*|mark|tag|flag|tier|level|etiquet\w*|nivel|rango|otherwise|else|si no|de lo contrario|como)\b/.test(r)) {
    const n = Number(thr[1].replace(/,/g, '')), quoted = [...String(request).matchAll(/["'“‘]([^"'”’]+)["'”’]/g)].map(m => m[1]);
    const es = /\b(como|etiquet|si no|de lo contrario|salario|sueldo)/.test(r), hi = quoted[0] || (es ? 'Alto' : 'High'), lo = quoted[1] || (es ? 'Estándar' : 'Standard'), op = /at least|>=|al menos/.test(r) ? '>=' : '>';
    return { pattern: 'band', sql: sel(withLbl(X.iif(`${Q(num)} ${op} ${n}`, str(hi), str(lo)), Q(num + '_BAND').replace(/[\[\]`"]/g, ''))), explanation: [`${hi} when ${num} ${op} ${n}, otherwise ${lo}.`, `${hi} si ${num} ${op} ${n}; si no, ${lo}.`] }; }
  // 9. contains text
  const cont = String(request).match(/(?:contain(?:s|ing)?|includ(?:e|es|ing)|contien(?:e|en)|incluy(?:e|en)|with)\s+(?:the\s+(?:text|word)\s+|el texto\s+|la palabra\s+)?["'“‘]([^"'”’]+)["'”’]/i);
  if (cont) { const c = main.columns.find(c => (main.rows || []).some(row => lc(row[main.columns.indexOf(c)]).includes(lc(cont[1]))))?.name || textM[0]; if (!c) return null;
    return { pattern: 'contains', sql: X.select({ cols: [...lbl.filter(x => x !== Q(c)), Q(c)], from, where: [...where, `${Q(c)} LIKE ${X.like(cont[1])}`] }), explanation: [`Rows where ${c} contains “${cont[1]}”.`, `Filas donde ${c} contiene “${cont[1]}”.`] }; }
  // 10. aggregates (with optional group by)
  const aggs = [];
  if (/\b(average|avg|mean|promedio|media)\b/.test(r)) aggs.push(['AVG', c => X.avg(c)]);
  if (/standard deviation|std ?dev|stdev|desviaci[oó]n/.test(r)) aggs.push(['SD', c => X.sd(c)]);
  if (/\b(sum|total of|suma|sumatoria)\b|\btotal\b(?!\s*(rows|filas))/.test(r) && num) aggs.push(['TOTAL', c => `SUM(${c})`]);
  if (/\b(min|minimum|lowest|smallest|m[ií]nimo|menor)\b/.test(r) && !/top|first|primer/.test(r)) aggs.push(['MIN', c => `MIN(${c})`]);
  if (/\b(max|maximum|highest|largest|biggest|m[aá]ximo|mayor)\b/.test(r) && !/top|first|primer|\bover\b|m[aá]s de/.test(r)) aggs.push(['MAX', c => `MAX(${c})`]);
  const per = String(request).match(/\b(?:per|by|for each|por cada|por)\s+([A-Za-z_][\w ]*?)(?=[?.!,]|$)/i);
  let grp = null; if (per) { const g = main.columns.find(c => colPhrases(c).some(p => normReq(per[1]).includes(' ' + p.split(' ').map(x => x.replace(/s$/, '')).join(' ') + ' ')) || lc(c.name) === lc(per[1].trim())); grp = g && g.name; if (!grp) return null; }
  if (aggs.length && num) { const cols = [...(grp ? [Q(grp)] : []), ...aggs.map(([a, f]) => `${f(Q(num))} AS ${a}_${num.replace(/\W/g, '_')}`)];
    return { pattern: 'aggregate', sql: sel(cols, grp ? { group: [Q(grp)] } : {}), explanation: [aggs.map(a => a[0]).join(', ') + ` of ${num}${grp ? ' per ' + grp : ''}.`, aggs.map(a => a[0]).join(', ') + ` de ${num}${grp ? ' por ' + grp : ''}.`] }; }
  if (/\b(how many|count|number of|cu[aá]nt[oa]s|n[uú]mero de|cantidad de)\b/.test(r)) { const cols = [...(grp ? [Q(grp)] : []), 'COUNT(*) AS N'];
    return { pattern: 'count', sql: sel(cols, grp ? { group: [Q(grp)], order: 'N DESC' } : {}), explanation: [grp ? `Rows per ${grp}.` : 'Number of rows.', grp ? `Filas por ${grp}.` : 'Número de filas.'] }; }
  // 11. numeric filter (over / under N)
  const lt = r.match(/(?:under|below|less than|lower than|<=?|menos de|menor(?:es)? (?:a|que)|inferior(?:es)? a)\s*\$?\s*([\d,.]+)/);
  if (num && (thr || lt) && !/(top|first|primer)/.test(r)) { const [op, n] = thr ? [/at least|>=|al menos/.test(r) ? '>=' : '>', thr[1]] : ['<', lt[1]];
    return { pattern: 'filter-number', sql: X.select({ cols: [...lbl, Q(num)], from, where: [...where, `${Q(num)} ${op} ${Number(n.replace(/,/g, ''))}`], order: `${Q(num)} DESC` }), explanation: [`Rows where ${num} ${op} ${n}.`, `Filas donde ${num} ${op} ${n}.`] }; }
  // 12. top N / sort
  const topN = r.match(/\b(?:top|first|primer(?:os|as)?|los|las)\s+(\d+)/), sortW = /\b(sort|sorted|order|ordered|ordena\w*|rank\w*|highest|lowest|top|mayor|menor)\b/.test(r);
  if (sortW && (num || M.length)) { const c = num || M[0], asc = /\b(lowest|asc\w*|smallest|cheapest|menor|ascendente|a-z)\b/.test(r) && !/highest|desc/.test(r);
    return { pattern: topN ? 'top-n' : 'sort', sql: X.select({ cols: [...lbl.filter(x => x !== Q(c)), Q(c)], from, where, order: `${Q(c)} ${asc ? 'ASC' : 'DESC'}`, limit: topN ? +topN[1] : 0 }), explanation: [`${topN ? 'Top ' + topN[1] + ' by ' : 'Sorted by '}${c}.`, `${topN ? 'Primeros ' + topN[1] + ' por ' : 'Ordenado por '}${c}.`] }; }
  // 13. filter by typed value (show the asked columns, else everything)
  if (vf.filters.length) { const ask = M.filter(n => !vf.filters.some(f => f[0] === n));
    return { pattern: 'filter-value', sql: sel(ask.length ? ask.map(Q) : ['*']), explanation: [`Rows where ${vf.filters.map(f => f[0] + ' = ' + f[1]).join(' and ')}.`, `Filas donde ${vf.filters.map(f => f[0] + ' = ' + f[1]).join(' y ')}.`] }; }
  return null;
}

function match(tables, request, dialect, lang) {
  const S = require('./sql'), TD = require('./testdb'); const t0 = process.hrtime.bigint();
  let out = null; try { out = build(tables, request, dialect, S, TD); } catch { out = null; }
  if (!out) return null;
  const check = S.validate(out.sql, tables), input = S.inputCheck(out.sql, request, tables);
  if (!check.ok || !input.ok) return null; // not confident: let the model write it
  return { sql: out.sql, explanation: out.explanation[lang === 'es' ? 1 : 0], pattern: out.pattern, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}
module.exports = { match, DX, mentioned, q, labelCols, pkOf: t => require('./testdb').pkOf ? require('./testdb').pkOf(t) : t.columns[0].name };

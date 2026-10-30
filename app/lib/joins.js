// TQueries v0.5.2 "Instant Read": deterministic two-table questions via the detected key (e.g. EMPLOYEES.DEP_ID = DEPARTMENTS.DEPT_ID_DEP).
// Returns {pattern, sql, explanation} when sure, else null (other patterns / the local model take over).
const lc = s => String(s || '').toLowerCase();
const norm = s => ' ' + lc(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim() + ' ';
const singular = s => lc(s).replace(/ies$/, 'y').replace(/s$/, '');
const ES = { employee: ['empleado', 'trabajador'], department: ['departamento', 'area', 'área'], customer: ['cliente'], product: ['producto'], order: ['pedido', 'orden'], invoice: ['factura'], manager: ['gerente', 'jefe', 'encargado'], location: ['ubicacion'] };
function entityWords(t) { const s = singular(t.name), base = [s, s.replace(/ment$/, ''), s.slice(0, 4)].filter(x => x.length >= 3);
  return [...new Set([...base, ...(ES[s] || []), ...base.map(b => b + 's'), ...(ES[s] || []).map(b => b + 's')])]; }
const has = (R, ws) => ws.some(w => R.includes(' ' + norm(w).trim() + ' '));
// typed value -> [table, column, value]; longest cell text found as whole words in the request
function findValue(tables, request) { const R = norm(request), hits = [];
  for (const t of tables) t.columns.forEach((c, i) => { for (const r of t.rows || []) { const v = String(r[i] ?? '').trim(); if (v.length < 3 || /^\d/.test(v) || /\d{3,}/.test(v)) continue;
    if (R.includes(' ' + norm(v).trim() + ' ')) hits.push([t, c.name, v]); } });
  hits.sort((a, b) => b[2].length - a[2].length); return hits[0] || null; }
function build(tables, request, dialect, P, TD) {
  if (tables.length < 2) return null;
  const fks = TD.inferFks(tables); if (!fks.length) return null;
  const R = norm(request), r = lc(request);
  for (const fk of fks) { const C = tables.find(t => t.name === fk.table), Pt = tables.find(t => t.name === fk.parent); if (!C || !Pt) continue;
    const pw = entityWords(Pt), cw = entityWords(C), v = findValue(tables, request); if (!has(R, pw) && !(v && v[0] === Pt && has(R, cw))) continue;
    const X = P.DX(dialect), Q = n => P.q(dialect, n);
    const pName = (Pt.columns.find(c => /(^|_)(name|nombre|desc\w*|title)$/i.test(c.name)) || Pt.columns.find(c => /name|nombre/i.test(c.name)) || {}).name; if (!pName) continue;
    const lbl = P.labelCols(C).map(n => 'c.' + Q(n)), on = `c.${Q(fk.column)} = p.${Q(fk.parentColumn)}`, cKey = P.pkOf(C);
    const join = (kind = 'INNER') => `${Q(C.name)} c\n${kind} JOIN ${Q(Pt.name)} p ON ${on}`;
    const each = /\b(each|every|all|cada|tod[oa]s|list)\b/.test(r);
    const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
    // count children per parent
    if (/\b(how many|count|number of|cu[aá]nt[oa]s|n[uú]mero de|cantidad de)\b/.test(r) && has(R, cw) && /\b(per|by|each|every|in each|por|cada)\b/.test(r) && !v)
      return { pattern: 'join-count', sql: X.select({ cols: [`p.${Q(pName)}`, `COUNT(c.${Q(cKey)}) AS N`], from: `${Q(Pt.name)} p\nLEFT JOIN ${Q(C.name)} c ON ${on}`, group: [`p.${Q(pName)}`], order: 'N DESC' }),
        explanation: [`${C.name} counted per ${Pt.name}, including empty ones.`, `${C.name} contados por ${Pt.name}, incluso los vacíos.`] };
    // manager / other parent column of a named parent
    if (v && v[0] === Pt) { const mcol = Pt.columns.find(c => c.name !== pName && c.name !== fk.parentColumn && has(R, [c.name.toLowerCase().replace(/_id$/i, '').replace(/_/g, ' '), ...(ES[c.name.toLowerCase().replace(/_id$/i, '')] || [])]));
      if (mcol && !has(R, cw)) return { pattern: 'parent-value', sql: X.select({ cols: [Q(pName), Q(mcol.name)], from: Q(Pt.name), where: [`${Q(v[1])} = ${lit(v[2])}`] }),
        explanation: [`${mcol.name} of ${v[2]}.`, `${mcol.name} de ${v[2]}.`] };
      if (has(R, cw) && v[1] === pName) return { pattern: 'join-children', sql: X.select({ cols: lbl, from: join(), where: [`p.${Q(pName)} = ${lit(v[2])}`] }),
        explanation: [`${C.name} in ${v[2]}, via ${fk.column} = ${fk.parentColumn}.`, `${C.name} en ${v[2]}, por ${fk.column} = ${fk.parentColumn}.`] };
      continue; }
    // parent of a named child (James -> L_NAME)
    if (v && v[0] === C) return { pattern: 'join-parent-of', sql: X.select({ cols: [...lbl, `p.${Q(pName)}`], from: join('LEFT'), where: [`c.${Q(v[1])} = ${lit(v[2])}`] }),
      explanation: [`${Pt.name} of ${v[2]} (${v[1]}), via ${fk.column} = ${fk.parentColumn}.`, `${Pt.name} de ${v[2]} (${v[1]}), por ${fk.column} = ${fk.parentColumn}.`] };
    // parent of each child
    if (!v && has(R, cw) && (each || /\bof (the )?employees\b|\bde (los )?empleados\b/.test(r)) && !/\b(how many|count|average|sum|total|cu[aá]nt)/.test(r))
      return { pattern: 'join-parent-each', sql: X.select({ cols: [...lbl, `p.${Q(pName)}`], from: join('LEFT') }),
        explanation: [`Each ${singular(C.name)} with its ${singular(Pt.name)}.`, `Cada registro de ${C.name} con su ${Pt.name}.`] };
  }
  return null; }
module.exports = { build, findValue };

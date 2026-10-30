// v0.5.2 "Instant Read": two-table join patterns (6 dialects, EN/ES) on the picture-read schema; declines when unsure.
process.env.TQ_QUIET = '1'; process.env.TQUERIES_HOME = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'tqj-'));
const assert = require('assert'), P = require('../app/lib/patterns'), S = require('../app/lib/sql'), TD = require('../app/lib/testdb');
const E = ['EMP_ID', 'F_NAME', 'L_NAME', 'SSN', 'B_DATE', 'SEX', 'ADDRESS', 'JOB_ID', 'SALARY', 'MANAGER_ID', 'DEP_ID'], D = ['DEPT_ID_DEP', 'DEP_NAME', 'MANAGER_ID', 'LOC_ID'];
const T = S.normalizeTables([{ name: 'EMPLOYEES', columns: E.map(name => ({ name })), rows: [['E1001', 'John', 'Thomas', '123456', '1976-01-09', 'M', '5631 Rice, OakPark,IL', '100', 100000, '30001', 2],
  ['E1002', 'Alice', 'James', '123457', '1972-07-31', 'F', '980 Berry ln, Elgin,IL', '200', 80000, '30002', 5], ['E1003', 'Steve', 'Wells', '123458', '1980-08-10', 'M', '291 Springs, Gary,IL', '300', 50000, '30002', 5]] },
  { name: 'DEPARTMENTS', columns: D.map(name => ({ name })), rows: [[5, 'Software Development', '30002', 'L0002'], [7, 'Design Team', '30003', 'L0003']] }]);
const data = Object.fromEntries(T.map(t => [t.name, t.rows]));
const flat = r => JSON.stringify(r.rows);
const CASES = [
  ['What is the department for James?', 'join-parent-of', r => r.rows.length === 1 && flat(r).includes('Software Development') && flat(r).includes('Alice')],
  ['Show the department name of each employee', 'join-parent-each', r => r.rows.length === 3 && flat(r).includes('Software Development')],
  ['Which employees are in Software Development?', 'join-children', r => r.rows.length === 2 && flat(r).includes('Alice') && flat(r).includes('Steve')],
  ['Count employees per department', 'join-count', r => r.rows.length === 2 && r.rows.some(x => x.includes('Software Development') && x.includes(2)) && r.rows.some(x => x.includes('Design Team') && x.includes(0))],
  ['Who is the manager of department Design Team?', 'parent-value', r => r.rows.length === 1 && flat(r).includes('30003')],
  ['¿Cuál es el departamento de James?', 'join-parent-of', r => r.rows.length === 1 && flat(r).includes('Software Development')],
  ['¿Qué empleados están en Software Development?', 'join-children', r => r.rows.length === 2],
  ['¿Cuántos empleados hay por departamento?', 'join-count', r => r.rows.length === 2],
  ['Muestra el departamento de cada empleado', 'join-parent-each', r => r.rows.length === 3]];
let pass = 0, fail = 0; const st = async (n, f) => { try { await f(); pass++; console.log('✓ ' + n); } catch (e) { fail++; console.log('✕ ' + n + ' ' + e.message); } };
(async () => {
  for (const d of Object.keys(S.DIALECTS)) await st('join patterns: ' + d, async () => { for (const [q, pat, ok] of CASES) { const m = P.match(T, q, d, /¿|Muestra/.test(q) ? 'es' : 'en');
    assert.ok(m, 'no pattern: ' + q); assert.equal(m.pattern, pat, q); const tr = d === 'sqlite' ? { sql: m.sql.replace(/;\s*$/, '') } : TD.translate(m.sql, d, T);
    const r = await TD.runSqlite(T, data, tr.sql); assert.ok(r.ok && ok(r), `${q}\n${m.sql}\n${tr.sql}\n${r.error || JSON.stringify(r.rows)}`); } });
  await st('James resolves to L_NAME, not F_NAME', () => { const m = P.match(T, 'department for James', 'postgresql', 'en'); assert.ok(/c\.L_NAME = 'James'/.test(m.sql), m.sql); });
  await st('age of each employee still uses the age pattern', () => assert.equal(P.match(T, 'age of each employee', 'mysql', 'en').pattern, 'age'));
  await st('declines unsure join questions (model decides)', () => { for (const q of ['which employees earn more than their manager', 'department budget trend']) assert.equal(P.match(T, q, 'sqlite', 'en'), null, q); });
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); })();

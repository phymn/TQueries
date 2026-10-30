// v0.5 "Instant": pattern engine — 12 standard questions × 6 dialects run on the practice copy, declines, server path with no model call.
process.env.TQ_QUIET = '1'; process.env.TQUERIES_HOME = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'tqp-'));
const assert = require('assert'), P = require('../app/lib/patterns'), S = require('../app/lib/sql'), TD = require('../app/lib/testdb'), F = require('./standard12');
const T = S.normalizeTables(F.TABLES), data = Object.fromEntries(T.map(t => [t.name, t.rows]));
let pass = 0, fail = 0; const st = async (n, f) => { try { await f(); pass++; console.log('✓ ' + n); } catch (e) { fail++; console.log('✕ ' + n + ' ' + e.message); } };
(async () => {
  const times = [];
  for (const d of Object.keys(S.DIALECTS)) await st(`12 standard questions: ${d}`, async () => { for (const [q, want] of F.Q) {
    const t = process.hrtime.bigint(), m = P.match(T, q, d, 'en'); times.push(Number(process.hrtime.bigint() - t) / 1e6);
    assert.ok(m, 'no pattern: ' + q); const tr = d === 'sqlite' ? { sql: m.sql.replace(/;\s*$/, '') } : TD.translate(m.sql, d, T);
    const r = await TD.runSqlite(T, data, tr.sql); assert.ok(r.ok && F.correct(r, want), `${q}\n${m.sql}\n${r.error || JSON.stringify(r.rows)}`); } });
  await st('Spanish questions match too', () => { for (const q of ['¿Cuántos caracteres tiene el nombre de cada empleado?', 'Muestra las iniciales de cada empleado']) assert.ok(P.match(T, q, 'mysql', 'es'), q); });
  await st('declines what it is not sure of (model decides)', () => { for (const q of ['x', 'total', 'which employees earn more than their manager', 'show the salary of Bob Smith'])
    assert.equal(P.match(T, q, 'postgresql', 'en'), null, q); });
  await st('server: pattern answer + result, no model call, timing engine', async () => { const srv = require('../app/server');
    const r = await srv.routes['POST /api/query']({ tables: F.TABLES, request: F.Q[11][0], dialect: 'oracle' });
    assert.equal(r.engine, 'pattern'); assert.equal(r.timing.sql.engine, 'pattern'); assert.ok(r.timing.sql.ms < 50); assert.ok(F.correct(r.test, F.Q[11][1])); assert.ok(r.check.ok); });
  await st('server: benchmark (pattern engine) 12/12', async () => { const b = await require('../app/server').runBench(['pattern']); assert.equal(b.pattern.ok, 12, JSON.stringify(b.pattern.rows.filter(x => !x.ok))); });
  await st('photo table names guessed from id columns', () => { const g = require('../app/server').guessName;
    assert.equal(g({ columns: ['EMP_ID', 'F_NAME'] }, 0), 'EMPLOYEES'); assert.equal(g({ columns: ['DEPT_ID_DEP', 'DEP_NAME'] }, 1), 'DEPARTMENTS'); assert.equal(g({ columns: ['DEPT_ID_DEP', 'DEP_NAME', 'MANAGER_ID'] }, 1), 'DEPARTMENTS'); assert.equal(g({ title: 'Departments', columns: ['A'] }, 0), 'DEPARTMENTS'); });
  await st('native helper: off-Mac returns null, mock binary via TQ_VISION_BIN', async () => { const N = require('../app/lib/native');
    if (process.platform !== 'darwin') assert.equal(await N.ensure(), null);
    const f = require('path').join(process.env.TQUERIES_HOME, 'mock.sh'); require('fs').writeFileSync(f, '#!/bin/sh\necho \'{"tables":[{"columns":["EMP_ID","F_NAME"],"rows":[["E1","John"]]}],"ms":5,"engine":"documents"}\'\n', { mode: 0o755 });
    N.state.bin = f; const r = await N.readImages([Buffer.from('x').toString('base64')]); assert.equal(r.tables[0].columns[1], 'F_NAME');
    const srv = require('../app/server'); const out = await srv.routes['POST /api/read-image']({ images: ['eA=='] }); assert.equal(out.model, 'apple-vision'); assert.equal(out.tables[0].name, 'EMPLOYEES'); N.state.bin = null; });
  times.sort((a, b) => a - b); console.log(`pattern match time: median ${times[times.length >> 1].toFixed(2)} ms, max ${times[times.length - 1].toFixed(2)} ms (${times.length} runs)`);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();

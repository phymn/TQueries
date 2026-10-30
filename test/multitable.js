// TQueries v0.5.3 "Swift Coder": 4-table 84logic fixture — link-table hints, transaction blocks, per-model GPU settings.
const assert = require('assert'), path = require('path'), S = require('../app/lib/sql'), TD = require('../app/lib/testdb');
const F = require('./fixtures/logic84_4tables.json'), tables = S.normalizeTables(F.tables);
const data = Object.fromEntries(F.tables.map(t => [t.name, t.rows]));
let pass = 0, fail = 0; const t = async (n, f) => { try { await f(); pass++; console.log('ok  ', n); } catch (e) { fail++; console.log('FAIL', n, e.message); } };
(async () => {
  const fks = TD.inferFks(tables);
  await t('FKs found incl. link table', () => { const s = fks.map(f => `${f.table}.${f.column}>${f.parent}`); for (const x of ['ASSIGNMENTS.EMP_ID>EMPLOYEES', 'ASSIGNMENTS.PROJ_ID>PROJECTS', 'EMPLOYEES.DEP_ID>DEPARTMENTS']) assert.ok(s.includes(x), s.join(' ')); });
  await t('prompt names the link table', () => assert.ok(/Link tables: ASSIGNMENTS links/.test(S.sqlPrompt({ tables, dialect: 'postgresql', request: 'x', joins: fks }))));
  await t('4-table join runs', async () => { const r = await TD.runSqlite(tables, data, "SELECT e.NAME, SUM(a.HOURS) h FROM EMPLOYEES e JOIN ASSIGNMENTS a ON a.EMP_ID=e.EMP_ID JOIN PROJECTS p ON p.PROJ_ID=a.PROJ_ID JOIN DEPARTMENTS d ON d.DEP_ID=p.DEP_ID WHERE d.DEP_NAME='Software Development' GROUP BY e.NAME ORDER BY e.NAME"); assert.ok(r.ok, r.error); assert.deepEqual(r.rows, [['Ana Torres', 120], ['María Gómez', 40]]); });
  await t('txn COMMIT applies multi-table UPDATE', async () => { const sql = "BEGIN TRANSACTION; UPDATE EMPLOYEES SET SALARY = SALARY * 1.1 WHERE EMP_ID IN (SELECT a.EMP_ID FROM ASSIGNMENTS a JOIN PROJECTS p ON p.PROJ_ID=a.PROJ_ID WHERE p.PROJ_NAME='84logic Portal'); DELETE FROM ASSIGNMENTS WHERE HOURS < 20; COMMIT;";
    assert.equal(TD.safeCheck(sql), null); const r = await TD.runSqlite(tables, data, sql); assert.ok(r.ok, r.error); assert.equal(r.changed, 3); assert.equal(r.txn, 'COMMIT'); assert.equal(Math.round(r.rows.find(x => x[0] === 1)[3]), 57200); });
  await t('txn ROLLBACK leaves data unchanged', async () => { const r = await TD.runSqlite(tables, data, "BEGIN; DELETE FROM EMPLOYEES; ROLLBACK;"); assert.ok(r.ok, r.error); assert.equal(r.rows.length, 3); });
  await t('plain multi-statement still refused', () => assert.equal(TD.safeCheck('SELECT 1; DROP TABLE EMPLOYEES'), 'multi'));
  await t('txn with PRAGMA blocked', () => assert.equal(TD.safeCheck('BEGIN; PRAGMA x; COMMIT;'), 'blocked'));
  console.log(`\nmultitable: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();

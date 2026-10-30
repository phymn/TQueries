// v0.5.2 "Instant Read": first reading returned at once, Apple's CSV check lands later and updates/flags cells (mock helper).
process.env.TQ_QUIET = '1'; const fs = require('fs'), path = require('path'), os = require('os');
const wordsFile = path.join(__dirname, 'fixtures', 'employee_departments.words.json');
if (!fs.existsSync(wordsFile)) { console.log('skip: employee_departments.words.json missing'); process.exit(0); }
process.env.TQUERIES_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'tqi-'));
const assert = require('assert'), W = require('./fixtures/employee_departments.words.json');
const FM = 'EMP_ID,F_NAME,L_NAME,SSN,B_DATE,SEX,ADDRESS,JOB_ID,SALARY,MANAGER_ID,DEP_ID\nE1001,John,Thomas,123456,1976-01-09,M,"5631 Rice, OakPark,IL",100,100000,30001,2\nE1002,Alice,James,123457,1972-07-31,F,"980 Berry ln, Elgin,IL",200,80000,30002,5\nE1003,Steve,Wells,123458,1980-08-10,M,"291 Springs, Gary,IL",300,50000,30002,5\nDEPT_ID_DEP,DEP_NAME,MANAGER_ID,LOC_ID\n5,Software Development,30002,L0002\n7,Design Team,30003,L0003';
const dir = process.env.TQUERIES_HOME, words = path.join(dir, 'w.json'); fs.writeFileSync(words, JSON.stringify({ words: W.words, ms: 80 }));
const mock = path.join(dir, 'mock.js'); fs.writeFileSync(mock, `#!/usr/bin/env node
const fs=require('fs');require('readline').createInterface({input:process.stdin}).on('line',l=>{const j=JSON.parse(l);
 if(j.args[0]==='--words')return console.log(JSON.stringify({id:j.id,ok:JSON.parse(fs.readFileSync(${JSON.stringify(words)}))}));
 if(j.args[0]==='--csv')return setTimeout(()=>console.log(JSON.stringify({id:j.id,ok:{csv:[${JSON.stringify(FM)},${JSON.stringify(FM)}]}})),700);
 console.log(JSON.stringify({id:j.id,ok:{ms:1}}));});`, { mode: 0o755 });
let pass = 0, fail = 0; const st = async (n, f) => { try { await f(); pass++; console.log('✓ ' + n); } catch (e) { fail++; console.log('✕ ' + n + ' ' + e.message); } };
(async () => { const N = require('../app/lib/native'); N.state.bin = mock; const srv = require('../app/server');
  let first, t0 = Date.now();
  await st('first reading comes back before the check (usable schema + rows)', async () => { first = await srv.routes['POST /api/read-image']({ images: ['eA=='] });
    assert.ok(Date.now() - t0 < 600, 'took ' + (Date.now() - t0)); assert.ok(first.checkId); assert.equal(first.tables[0].name, 'EMPLOYEES'); assert.equal(first.tables[0].rows[0][1], 'John');
    const r = await srv.routes['GET /api/check']({}, new URL('http://x/api/check?id=' + first.checkId)); assert.equal(r.state, 'running'); });
  await st('questions work on the first reading (join pattern)', async () => { const q = await srv.routes['POST /api/query']({ tables: first.tables, request: 'department for James', dialect: 'sqlserver' });
    assert.equal(q.engine, 'pattern'); assert.equal(q.test.rows.length, 1); assert.ok(JSON.stringify(q.test.rows).includes('Alice'), JSON.stringify(q.test)); }); // Vision missed Alice's DEP_ID; the check fills it
  let done;
  await st('check finishes: cells updated, changes flagged', async () => { for (let i = 0; i < 40 && !(done && done.state === 'done'); i++) { await new Promise(o => setTimeout(o, 100)); done = await srv.routes['GET /api/check']({}, new URL('http://x/api/check?id=' + first.checkId)); }
    assert.equal(done.state, 'done'); const E = done.tables[0]; assert.equal(E.columns[5].name, 'SEX'); assert.equal(E.rows[1][5], 'F');
    assert.ok(E.flags.some(f => f.r === -1 && f.c === 5)); assert.equal(E.rows[1][10], '5'); assert.ok(E.flags.some(f => f.r === 1 && f.c === 10)); });
  await st('practice DB uses the updated cells', async () => { const q = await srv.routes['POST /api/query']({ tables: done.tables, request: 'department for James', dialect: 'oracle' });
    assert.ok(JSON.stringify(q.test.rows).includes('Software Development'), JSON.stringify(q.test.rows)); });
  await st('unknown check id → friendly error', async () => { await assert.rejects(srv.routes['GET /api/check']({}, new URL('http://x/api/check?id=zz'))); });
  N.state.bin = null; console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); })();

// TQueries v0.1 tests — mock Ollama on a random port (real models not installed on the test box).
const http = require('http'), assert = require('assert'), os = require('os'), fs = require('fs'), path = require('path');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-')); process.env.TQUERIES_HOME = home;
const S = require('../app/lib/sql');
let pass = 0, fail = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const schema = [{ name: 'Clients', columns: [{ name: 'ClientID', type: 'INTEGER' }, { name: 'Name', type: 'TEXT' }] },
  { name: 'Invoices', columns: [{ name: 'InvoiceID', type: 'INTEGER' }, { name: 'ClientID', type: 'INTEGER' }, { name: 'Total', type: 'REAL' }, { name: 'InvDate', type: 'TEXT' }] }];
const GOOD = 'SELECT c.Name, SUM(i.Total) AS Total FROM Clients c JOIN Invoices i ON i.ClientID = c.ClientID GROUP BY c.Name ORDER BY Total DESC;';
test('parse "Table: a, b" text', () => { const r = S.parseSchemaText('Clients: ClientID, Name\nInvoices: InvoiceID, Total'); assert.equal(r.length, 2); assert.equal(r[1].columns[1].name, 'Total'); });
test('parse CREATE TABLE', () => { const r = S.parseSchemaText('CREATE TABLE [Order Items] ([ItemID] int NOT NULL, Qty int, PRIMARY KEY (ItemID));'); assert.equal(r[0].name, 'Order Items'); assert.deepEqual(r[0].columns.map(c => c.name), ['ItemID', 'Qty']); });
test('parse Table(col type)', () => { const r = S.parseSchemaText('Clients(ClientID int, Name text)'); assert.equal(r[0].columns[0].type, 'int'); });
test('extract JSON from chatty model', () => assert.equal(S.normalizeTables(S.extractJson('Sure!\n```json\n{"tables":[{"name":"A","columns":["x"]}]}\n```'))[0].columns[0].name, 'x'));
test('extract SQL + explanation', () => { const r = S.extractSql('```sql\nSELECT 1;\n```\nEXPLANATION: Hola.'); assert.equal(r.sql, 'SELECT 1;'); assert.equal(r.explanation, 'Hola.'); });
test('validate good query', () => assert.ok(S.validate(GOOD, schema).ok));
test('flag missing table', () => assert.ok(S.validate('SELECT * FROM Payments', schema).problems.includes('table:Payments')));
test('flag missing column via alias', () => assert.ok(S.validate('SELECT i.Amount FROM Invoices i', schema).problems.includes('column:i.Amount')));
test('write statements allowed + flagged', () => { const v = S.validate('DELETE FROM Clients', schema); assert.ok(v.changesData && !v.problems.includes('writes')); assert.ok(!S.validate('SELECT * FROM Clients', schema).changesData); });
test('CTE names not flagged', () => assert.ok(S.validate('WITH t AS (SELECT ClientID FROM Invoices) SELECT * FROM t', schema).ok));
test('prompt per dialect', () => { for (const d of Object.keys(S.DIALECTS)) assert.ok(S.sqlPrompt({ tables: schema, dialect: d, request: 'x' }).includes(S.DIALECTS[d].name)); assert.equal(Object.keys(S.DIALECTS).length, 6); });
test('sqlite EXPLAIN (if node:sqlite)', () => { const r = S.sqliteExplain(GOOD, schema); if (r.ran) { assert.ok(r.ok); assert.ok(!S.sqliteExplain('SELECT nope FROM Clients', schema).ok); } });
// --- Server with mock Ollama
let mode = 'up'; const calls = []; let lastPrompt = '', jsonCalls = 0, photoRows = false;
const aiData = JSON.stringify({ Clients: [[1, 'Ana'], [2, 'Luis'], [3, 'María']], Invoices: [[1, 1, 100.5, '2026-01-05'], [2, 2, 50, '2025-03-01'], [3, 99, 20, '2026-02-10'], [4, 3, 75, '2026-06-30']] });
const TD = require('../app/lib/testdb');
const mock = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  if (q.url === '/api/version') return s.end('{"version":"mock"}');
  if (q.url === '/api/tags') return s.end(JSON.stringify({ models: mode === 'nomodel' ? [] : [{ name: 'llava:latest' }, { name: 'qwen2.5-coder:7b' }] }));
  const j = JSON.parse(b); lastPrompt = j.prompt;
  calls.push(j); if (j.images && photoRows) return s.end(JSON.stringify({ response: '{"tables":[{"name":"Clients","columns":["ClientID","Name"],"rows":[[7,"84logic"],[9,"Atlas Print"]]}]}' }));
  if (j.images) return s.end(JSON.stringify({ response: '{"tables":[{"name":"Clients","columns":[{"name":"ClientID","type":"INT"},"Name"]}]}' }));
  if (j.prompt.includes('L_NAME')) return s.end(JSON.stringify({ response: '```sql\nSELECT d.DEP_NAME FROM EMPLOYEE e JOIN DEPARTMENTS d ON e.DEP_ID = d.DEPT_ID_DEP WHERE e.L_NAME = \'James\';\n```\nEXPLANATION: Departamento de James.' }));
  if (j.format === 'json') { jsonCalls++; return s.end(JSON.stringify({ response: aiData })); }
  if (j.prompt.includes('Translate this')) return s.end(JSON.stringify({ response: '```sql\nSELECT COUNT(*) AS n FROM Invoices\n```' }));
  if (j.prompt.includes('Rewrite this')) return s.end(JSON.stringify({ response: '```sql\nSELECT TOP 3 c.Name, COUNT(i.InvoiceID) AS N FROM Clients c LEFT JOIN Invoices i ON i.ClientID = c.ClientID GROUP BY c.Name ORDER BY N DESC;\n```\nEXPLANATION: Incluye clientes sin facturas.' }));
  if (j.images && photoRows) return s.end(JSON.stringify({ response: '{"tables":[{"name":"Clients","columns":["ClientID","Name"],"rows":[[7,"84logic"],[9,"Atlas Print"]]}]}' }));
  if (j.images) return s.end(JSON.stringify({ response: '{"tables":[{"name":"Clients","columns":[{"name":"ClientID","type":"INT"},"Name"]}]}' }));
  s.end(JSON.stringify({ response: '```sql\n' + GOOD + '\n```\nEXPLANATION: Suma por cliente.' })); }); });
async function call(port, p, b) { const r = await fetch(`http://127.0.0.1:${port}${p}`, b ? { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` }, body: JSON.stringify(b) } : {}); return { status: r.status, j: await r.json() }; }
(async () => {
  for (const [n, f] of tests) { try { await f(); pass++; console.log('✓', n); } catch (e) { fail++; console.log('✕', n, e.message); } }
  await new Promise(r => mock.listen(0, '127.0.0.1', r)); process.env.OLLAMA_HOST = 'http://127.0.0.1:' + mock.address().port;
  const { server, VERSION, sampleData, AUTO } = require('../app/server'); const MP = mock.address().port; AUTO.waitMs = 1200; AUTO.starter = () => true; await new Promise(r => server.listen(0, '127.0.0.1', r)); const P = server.address().port;
  const st = async (n, f) => { try { await f(); pass++; console.log('✓', n); } catch (e) { fail++; console.log('✕', n, e.message); } };
  await st('state + footer version', async () => { const { j } = await call(P, '/api/state'); assert.equal(j.version.number, 'v0.5.4'); assert.equal(j.version.name, 'Gemma'); assert.ok(/any column/.test(j.version.notes.join(' '))); assert.ok(/v0\.5\.4/.test(j.version.notes[0])); assert.ok(j.ollama.running); });
  await st('index serves footer + UI', async () => { const h = await (await fetch(`http://127.0.0.1:${P}/`)).text(); assert.ok(h.includes('<footer>') && h.includes('id="copy"')); });
  await st('vision falls back to llava', async () => { const { j } = await call(P, '/api/read-image', { images: ['data:image/png;base64,AAAA'] }); assert.equal(j.model, 'llava:latest'); assert.equal(j.tables[0].columns[1].name, 'Name'); });
  await st('query end-to-end (sqlite)', async () => { const { j } = await call(P, '/api/query', { tables: schema, dialect: 'sqlite', request: 'total por cliente', lang: 'es' });
    assert.ok(j.sql.startsWith('SELECT')); assert.ok(j.check.ok, JSON.stringify(j.check)); assert.ok(lastPrompt.includes('Spanish') && lastPrompt.includes('SQLite')); });
  await st('schemas saved, never dropped', async () => { await call(P, '/api/schemas', { name: 'A', tables: schema }); await call(P, '/api/schemas', { name: 'B', tables: schema }); assert.equal((await call(P, '/api/schemas')).j.length, 2); });
  await st('settings configurable', async () => { const { j } = await call(P, '/api/settings', { sqlModel: 'qwen2.5-coder:7b' }); assert.equal(j.sqlModel, 'qwen2.5-coder:7b'); });
  const SS = 'SELECT TOP 5 [c].[Name], SUM(i.Total) AS Total FROM Clients c JOIN Invoices i ON i.ClientID = c.ClientID WHERE YEAR(i.InvDate) = 2026 GROUP BY c.Name ORDER BY Total DESC;';
  await st('test: builds DB + runs translated SQL Server TOP/YEAR', async () => { await call(P, '/api/settings', { aiSampleData: true }); const { status, j } = await call(P, '/api/test', { tables: schema, sql: SS, dialect: 'sqlserver' });
    assert.equal(status, 200, JSON.stringify(j)); assert.ok(j.translated && j.via === 'rules'); assert.ok(/LIMIT 5$/.test(j.sqliteSql) && !/TOP|\[/.test(j.sqliteSql));
    assert.deepEqual(j.columns, ['Name', 'Total']); assert.ok(j.rows.length >= 1 && j.rows.length <= 5); assert.equal(j.source.Clients, 'ai'); assert.equal(jsonCalls, 1); });
  await st('test: FK consistency (Invoices.ClientID ⊂ Clients)', async () => { const d = await sampleData(schema); assert.ok(d.fks.some(f => f.table === 'Invoices' && f.column === 'ClientID'));
    const keys = new Set(d.data.Clients.map(r => String(r[0]))); assert.ok(d.data.Invoices.every(r => keys.has(String(r[1])))); });
  await st('test: cached per schema (repeatable), New sample data regenerates', async () => { const a = (await call(P, '/api/test', { tables: schema, sql: 'SELECT * FROM Invoices', dialect: 'sqlite' })).j;
    assert.equal(jsonCalls, 1); const b = (await call(P, '/api/test', { tables: schema, sql: 'SELECT * FROM Invoices', dialect: 'sqlite', regenerate: true })).j; assert.equal(jsonCalls, 2); assert.equal(a.total, b.total); });
  await st('test: photo rows used + FK parent kept consistent', async () => { photoRows = true; const r = (await call(P, '/api/read-image', { images: ['AAAA'] })).j; photoRows = false;
    assert.equal(r.tables[0].rows.length, 2); const tables = [r.tables[0], schema[1]];
    const { j } = await call(P, '/api/test', { tables, sql: 'SELECT Name FROM Clients ORDER BY Name', dialect: 'postgresql' }); assert.deepEqual(j.rows.map(x => x[0]), ['84logic', 'Atlas Print']); assert.equal(j.source.Clients, 'photo');
    const k = await call(P, '/api/test', { tables, sql: 'SELECT COUNT(*) FROM Invoices i LEFT JOIN Clients c ON c.ClientID = i.ClientID WHERE c.ClientID IS NULL', dialect: 'sqlite' }); assert.equal(k.j.rows[0][0], 0); });
  await call(P, '/api/settings', { aiSampleData: false });
  await st('test: deterministic fallback when model data fails', async () => { const t2 = [{ name: 'Products', columns: [{ name: 'ProductID', type: 'int' }, { name: 'Price', type: 'decimal' }, { name: 'Added', type: 'date' }] }];
    mode = 'nomodel'; const { j } = await call(P, '/api/test', { tables: t2, sql: "SELECT COUNT(*) AS n, MONTH(Added) > 0 AS m FROM Products", dialect: 'mysql' }); mode = 'up'; assert.equal(j.source.Products, 'sample'); assert.equal(j.rows[0][0], 12);
    assert.deepEqual(TD.fallbackRows(t2[0], 3, 5), TD.fallbackRows(t2[0], 3, 5)); });
  await st('test: model translation fallback', async () => { const { j } = await call(P, '/api/test', { tables: schema, sql: 'SELECT LEVEL FROM dual CONNECT BY LEVEL <= 3', dialect: 'oracle' }); assert.equal(j.via, 'model'); assert.equal(j.translated, true); });
  await st('test: Oracle FETCH, Access #date#/brackets', () => { assert.equal(TD.translate('SELECT * FROM t ORDER BY x FETCH FIRST 3 ROWS ONLY', 'oracle').sql, 'SELECT * FROM t ORDER BY x LIMIT 3');
    assert.equal(TD.translate("SELECT [Order Date] FROM [My T] WHERE d > #1/5/2026# AND n = '[x]'", 'access').sql, `SELECT "Order Date" FROM "My T" WHERE d > '2026-01-05' AND n = '[x]'`); });
  await st('date math: age in every dialect', async () => { const T = [{ name: 'E', columns: [{ name: 'B' }] }], D = { E: [['2000-01-01']] }, want = new Date().getUTCFullYear() - 2000 - ((new Date().getUTCMonth() === 0 && new Date().getUTCDate() < 1) ? 1 : 0);
    for (const [d, q] of [['sqlserver', 'SELECT DATEDIFF(YEAR, B, GETDATE()) FROM E'], ['mysql', 'SELECT TIMESTAMPDIFF(YEAR, B, CURDATE()) FROM E'], ['postgresql', 'SELECT EXTRACT(YEAR FROM AGE(B)) FROM E'], ['oracle', 'SELECT TRUNC(MONTHS_BETWEEN(SYSDATE, B) / 12) FROM E'], ['sqlserver', 'SELECT FLOOR(DATEDIFF(DAY, B, CAST(GETDATE() AS DATE)) / 365.25) FROM E']]) {
      const r = await TD.runSqlite(T, D, TD.translate(q, d).sql); assert.ok(r.ok, d + ' ' + r.error); assert.equal(r.rows[0][0], want, d + ' ' + q); } });
  await st('test: writes run on practice copy', async () => { let r = (await call(P, '/api/test', { tables: schema, sql: "UPDATE Clients SET Name='Zed' WHERE ClientID=1", dialect: 'sqlite' })).j; assert.ok(r.write && r.changed === 1 && r.table === 'Clients' && r.rows.some(x => x.includes('Zed')), JSON.stringify(r));
    r = (await call(P, '/api/test', { tables: schema, sql: 'DELETE FROM Clients WHERE ClientID=1', dialect: 'sqlite' })).j; assert.equal(r.changed, 1);
    for (const q of ['SELECT 1; DROP TABLE Clients', 'PRAGMA table_info(Clients)']) { const { status, j } = await call(P, '/api/test', { tables: schema, sql: q, dialect: 'sqlite' }); assert.equal(status, 400); assert.ok(['multi', 'blocked'].includes(j.error)); } });
  await st('test: row cap 200 + timeout', async () => { const { j } = await call(P, '/api/test', { tables: schema, sql: 'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x < 500) SELECT x FROM n', dialect: 'sqlite' });
    assert.equal(j.rows.length, 200); assert.equal(j.total, 500); assert.ok(j.truncated); const r = await TD.runSqlite([], {}, 'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n) SELECT COUNT(*) FROM n', { timeout: 400 }); assert.equal(r.error, 'timeout'); });
  await st('fix loop: rewrite same dialect, then test again', async () => { const { j } = await call(P, '/api/fix', { tables: schema, dialect: 'sqlserver', sql: SS, request: 'total', fix: 'incluye clientes sin facturas', lang: 'es' });
    assert.ok(j.sql.startsWith('SELECT TOP 3') && j.check.ok && lastPrompt.includes('incluye clientes sin facturas') && lastPrompt.includes('SQL Server'));
    const t = (await call(P, '/api/test', { tables: schema, sql: j.sql, dialect: 'sqlserver' })).j; assert.equal(t.columns[1], 'N'); assert.ok(t.rows.length <= 3);
    assert.equal((await call(P, '/api/fix', { tables: schema, sql: SS })).j.error, 'no_fix'); });
  await st('UI has test/fix controls + vendored sql.js license', async () => { const h = await (await fetch(`http://127.0.0.1:${P}/`)).text(); assert.ok(h.includes('id="test"') && h.includes('id="fix"') && h.includes('id="regen"'));
    assert.ok(fs.existsSync(path.join(__dirname, '../app/vendor/sql.js/LICENSE'))); });

  const EMP = [{ name: 'EMPLOYEE', columns: 'EMP_ID,F_NAME,L_NAME,SSN,B_DATE,SEX,ADDRESS,JOB_ID,SALARY,MANAGER_ID,DEP_ID'.split(','), rows: [['E1001', 'John', 'Thomas', 123456, '1976-01-09', 'M', '5631 Rice, OakPark,IL', 100, 100000, 30001, 2], ['E1002', 'Alice', 'James', 123457, '1972-07-31', 'F', '980 Berry ln, Elgin,IL', 200, 80000, 30002, 5], ['E1003', 'Steve', 'Wells', 123458, '1980-08-10', 'M', '291 Springs, Gary,IL', 300, 50000, 30002, 5]] },
    { name: 'DEPARTMENTS', columns: ['DEPT_ID_DEP', 'DEP_NAME', 'MANAGER_ID', 'LOC_ID'], rows: [[5, 'Software Development', 30002, 'L0002'], [7, 'Design Team', 30003, 'L0003']] }];
  await st('v0.4: any value in every dialect (text, dates, ages at a date, stats, conditions, casts)', async () => { const A = require('./anyvalue'); const bad = [];
    for (const [d, q, want] of A.C) { const r = await TD.runSqlite(A.T, A.D, TD.translate(q, d, A.T).sql); const got = !r.ok ? 'ERR ' + r.error : Array.isArray(want) ? r.rows.map(x => x[0]) : r.rows[0][0];
      if (!(r.ok && (Array.isArray(want) ? JSON.stringify(got) === JSON.stringify(want) : typeof want === 'number' ? Math.abs(got - want) < 1e-6 : got === want))) bad.push(d + ': ' + q + ' -> ' + JSON.stringify(got)); }
    assert.equal(bad.length, 0, bad.join('\n')); assert.ok(A.C.length >= 100); });
  await st('v0.4: typed year must be used; computed values never flagged', () => { const E = S.normalizeTables(EMP);
    assert.deepEqual(S.inputCheck("SELECT F_NAME, DATEDIFF(YEAR, B_DATE, '2019-12-31') FROM EMPLOYEE", 'age of each employee in 2020', E).missing, ['2020']);
    for (const [q, sql] of [['age of each employee in 2020', "SELECT F_NAME, DATEDIFF(YEAR, B_DATE, DATEFROMPARTS(2020, 12, 31)) AS AGE FROM EMPLOYEE"], ['number of characters in each first name', 'SELECT F_NAME, LEN(F_NAME) AS N FROM EMPLOYEE'],
      ["employees whose address contains IL", "SELECT F_NAME FROM EMPLOYEE WHERE ADDRESS LIKE '%IL%'"], ['initials of each employee', 'SELECT LEFT(F_NAME, 1) + LEFT(L_NAME, 1) FROM EMPLOYEE']]) assert.ok(S.inputCheck(sql, q, E).ok, q);
    assert.ok(/Age "in YEAR"/.test(S.sqlPrompt({ tables: E, dialect: 'sqlserver', request: 'x' }))); });
  await st('v0.2.1: downscale to 1280 long side, never upscale', () => { const R = require('../app/public/resize.js'); assert.deepEqual(R.fitSize(2560, 1440), { w: 1280, h: 720, scaled: true });
    assert.deepEqual(R.fitSize(1138, 474), { w: 1138, h: 474, scaled: false }); assert.equal(R.fitSize(900, 3000).h, 1280); });
  await st('v0.2.1: keep_alive, format json, temp 0, caps sent to Ollama', async () => { calls.length = 0; await call(P, '/api/read-image', { images: ['AAAA'] }); await call(P, '/api/query', { tables: schema, dialect: 'sqlite', request: 'x', autoTest: false });
    const [v, q] = calls; assert.equal(v.keep_alive, '30m'); assert.equal(v.format, 'json'); assert.equal(v.options.temperature, 0); assert.ok(v.options.num_predict > 0 && v.options.num_ctx > 0);
    assert.equal(q.keep_alive, '30m'); assert.equal(q.options.temperature, 0); assert.ok(q.options.num_predict <= 400); assert.equal(calls.length, 2); });
  await st('v0.2.1: wrapped headers fixed (EMP_\\nID -> EMP_ID), rows capped at 20', () => { const t = S.normalizeTables([{ name: 'E', columns: ['EMP_\nID', 'L_ NAME'] }]); assert.deepEqual(t[0].columns.map(c => c.name), ['EMP_ID', 'L_NAME']); assert.ok(/max 20/.test(S.VISION_PROMPT)); });
  await st('v0.2.1: FK inference DEP_ID -> DEPT_ID_DEP (name + values)', () => { const T2 = S.normalizeTables(EMP); assert.equal(TD.pkOf(T2[1]), 'DEPT_ID_DEP');
    const f = TD.inferFks(T2); assert.ok(f.some(k => k.table === 'EMPLOYEE' && k.column === 'DEP_ID' && k.parent === 'DEPARTMENTS' && k.parentColumn === 'DEPT_ID_DEP')); assert.ok(!f.some(k => k.column === 'MANAGER_ID')); });
  await st('v0.2.1: photo rows + joins in SQL prompt; James answer in one step', async () => { calls.length = 0; const { j } = await call(P, '/api/query', { tables: EMP, dialect: 'sqlserver', request: 'the department name for James', lang: 'en', engine: 'none' });
    const p = calls[0].prompt; assert.ok(p.includes('Alice | James') && p.includes('Software Development') && p.includes('EMPLOYEE.DEP_ID = DEPARTMENTS.DEPT_ID_DEP') && /ONLY the columns/.test(p) && /No TOP\/LIMIT/.test(p));
    assert.ok(j.check.ok); assert.deepEqual(j.test.columns, ['DEP_NAME']); assert.deepEqual(j.test.rows, [['Software Development']]); assert.equal(calls.length, 1); assert.ok(j.timing.sql.ms >= 0 && j.timing.test.ms >= 0); });
  await st('v0.2.1: deterministic sample data by default (no model call)', async () => { const before = jsonCalls; const t3 = [{ name: 'Items84', columns: [{ name: 'ItemID', type: 'int' }, { name: 'Price', type: 'decimal' }] }];
    const { j } = await call(P, '/api/test', { tables: t3, sql: 'SELECT COUNT(*) FROM Items84', dialect: 'sqlite' }); assert.equal(j.source.Items84, 'sample'); assert.equal(jsonCalls, before); });
  await st('v0.2.1: fast SQL model used when set + fast on', async () => { await call(P, '/api/settings', { sqlFastModel: 'qwen2.5-coder:7b', sqlModel: 'qwen3-coder' }); const { j } = await call(P, '/api/query', { tables: schema, request: 'x', fast: true, autoTest: false }); assert.equal(j.model, 'qwen2.5-coder:7b'); });
  await st('friendly: model missing', async () => { mode = 'nomodel'; const { status, j } = await call(P, '/api/query', { tables: schema, request: 'x' }); assert.equal(status, 400); assert.equal(j.error, 'model_missing'); mode = 'up'; });
  await st('friendly: ollama down', async () => { await new Promise(r => mock.close(r)); const { j } = await call(P, '/api/read-image', { images: ['AAAA'] }); assert.equal(j.error, 'ollama_down'); });
  await st('v0.4.1: format examples + possessives never required; real inputs still required', () => { const E = S.normalizeTables(EMP);
    const r = S.inputCheck("SELECT F_NAME, FORMAT(B_DATE, 'MMMM d, yyyy') AS BIRTH FROM EMPLOYEE", "each employee's birth date formatted like 'January 9, 1976'", E); assert.ok(r.ok, JSON.stringify(r)); assert.deepEqual(r.need, []);
    assert.deepEqual(S.inputValues("fecha de nacimiento con formato '9 de enero de 1976'", E), []); assert.deepEqual(S.inputValues('show birth dates as e.g. "1976-01-09"', E), []);
    assert.deepEqual(S.inputValues("employees' department for 'James'", E), ['James']); assert.deepEqual(S.inputValues('age of each employee in 2020', E), ['2020']); });
  await st('v0.4.1: Ollama auto-start (mock), footer', async () => { const srv = require('../app/server'); assert.equal(srv.VERSION.number, 'v0.5.4'); assert.ok(srv.VERSION.notesEs.length);
    let started = 0; srv.AUTO.waitMs = 5000; srv.AUTO.starter = () => { started++; setTimeout(() => mock.listen(MP, '127.0.0.1'), 300); return true; };
    const { j } = await call(P, '/api/query', { tables: schema, dialect: 'sqlite', request: 'x', fast: true, autoTest: false }); assert.equal(started, 1); assert.ok(j.sql, JSON.stringify(j)); assert.equal(srv.AUTO.starting, false); });
  await st('blocks foreign origin', async () => { const r = await fetch(`http://127.0.0.1:${P}/api/settings`, { method: 'POST', headers: { origin: 'http://evil.com' }, body: '{}' }); assert.equal(r.status, 403); });
  server.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();

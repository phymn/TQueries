// TQueries v0.5.3: ~10 multi-table / transaction / dialect / Spanish questions through the MODEL path (engine 'none' skips templates).
// Usage: TQ_MODEL=qwen2.5-coder:14b node test/model-multi.js   (needs Ollama running). Prints time and whether the SQL ran with the expected result.
const os = require('os'), fs = require('fs'), path = require('path');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tqm-')); process.env.TQUERIES_HOME = home; process.env.TQ_QUIET = '1';
fs.mkdirSync(path.join(home, 'data'), { recursive: true });
const F = require('./fixtures/logic84_4tables.json'), S = require('./standard12.js');
const model = process.env.TQ_MODEL || 'qwen2.5-coder:14b';
const four = F.tables.map(t => ({ ...t, rows: t.rows.map(r => r.map(String)) }));
const has = (r, ...v) => JSON.stringify(r.rows || []).includes(v[0]) && v.every(x => JSON.stringify(r.rows || []).includes(x));
const Q = [
  ['4-table join', four, 'sqlite', 'Names of employees who work on projects of the Software Development department', r => has(r, 'Ana Torres', 'María Gómez') && !has(r, 'Luis')],
  ['link + aggregate', four, 'sqlite', 'Total hours per project name', r => has(r, '84logic Portal') && JSON.stringify(r.rows).includes('160')],
  ['subquery', four, 'sqlite', 'Employees whose salary is above the average salary', r => has(r, 'Luis Pérez', 'María Gómez') && !has(r, 'Ana')],
  ['3-table aggregate', four, 'sqlite', 'Total budget of projects per department name', r => has(r, 'Software Development') && JSON.stringify(r.rows).includes('90000')],
  ['INSERT', four, 'sqlite', 'Add an assignment 104 for employee 2 on project 10 with 15 hours', r => r.write && r.changed === 1],
  ['multi-table UPDATE', four, 'sqlite', 'Raise by 10% the salary of every employee assigned to the project 84logic Portal', r => r.write && r.changed === 2],
  ['multi-table DELETE', four, 'sqlite', 'Delete the assignments of projects that belong to the Design Team department', r => r.write && r.changed === 2],
  ['transaction', four, 'sqlite', 'In a transaction, move employee 3 to department 7 and delete her assignments, then commit', r => r.txn === 'COMMIT' && r.changed >= 2],
  ['DDL', four, 'sqlite', 'Create a table CLIENTS with CLIENT_ID integer primary key and NAME text', r => r.write],
  ['Spanish', four, 'sqlite', 'Muestra el nombre de cada empleado con el nombre de su departamento', r => has(r, 'Ana Torres', 'Design Team')],
  ['PostgreSQL join', four, 'postgresql', 'Number of employees assigned to each project name', r => has(r, '84logic Portal')],
  ['SQL Server join (orig. fixture)', S.TABLES, 'sqlserver', 'First name of employees with their department name', r => has(r, 'Alice')],
];
(async () => {
  const srv = require('../app/server.js'); const { server } = srv;
  fs.writeFileSync(path.join(home, 'data', 'settings.json'), JSON.stringify({ sqlModel: model, migrated053: true }));
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const call = (p, b) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` }, body: JSON.stringify(b) }).then(r => r.json());
  let ok = 0; console.log(`model ${model}`);
  for (const [n, tables, dialect, request, chk] of Q) { const t0 = Date.now(); const j = await call('/api/query', { tables, request, dialect, engine: 'none', lang: /Muestra/.test(request) ? 'es' : 'en' });
    const good = !!(j.test && !j.test.error && chk(j.test)); ok += good;
    console.log(`${good ? 'ok  ' : 'FAIL'} ${(Date.now() - t0) / 1000}s ${n} :: ${String(j.sql || j.error).replace(/\s+/g, ' ').slice(0, 220)}${j.test && j.test.error ? ' [' + j.test.error + ': ' + String(j.test.detail).slice(0, 80) + ']' : ''}`); }
  console.log(`\n${model}: ${ok}/${Q.length} correct`); process.exit(0);
})();

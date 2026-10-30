// TQueries v0.2.1 bench — run on the Mac against REAL local Ollama (nothing leaves the device).
// Usage: cd ~/TQueries && node test/bench-mac.js [image] ["question"] [dialect] [--fast]
// Env: SQL_MODEL / FAST_MODEL / VISION_MODEL to override models for this run only.
const fs = require('fs'), os = require('os'), path = require('path');
const args = process.argv.slice(2).filter(a => a !== '--fast'), fast = process.argv.includes('--fast');
const img = args[0] || path.join(__dirname, 'fixtures', 'employee_departments.png');
if (!args[0] && !fs.existsSync(img)) { console.log('skip: employee_departments.png missing'); process.exit(0); }
const question = args[1] || 'the department name for James', dialect = args[2] || 'sqlserver';
process.env.TQUERIES_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-bench-')); // never touches your saved data
const { server } = require('../app/server');
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const P = server.address().port;
  const call = async (p, b) => { const r = await fetch(`http://127.0.0.1:${P}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${P}` }, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(p + ': ' + JSON.stringify(j)); return j; };
  const st = await (await fetch(`http://127.0.0.1:${P}/api/state`)).json();
  if (!st.ollama.running) { console.log('Ollama is not running. Open Ollama and try again.'); process.exit(1); }
  console.log('Installed models:', st.ollama.models.join(', '));
  const set = {}; if (process.env.SQL_MODEL) set.sqlModel = process.env.SQL_MODEL; if (process.env.FAST_MODEL) set.sqlFastModel = process.env.FAST_MODEL; if (process.env.VISION_MODEL) set.visionModel = process.env.VISION_MODEL;
  if (!set.sqlModel) set.sqlModel = st.ollama.models.find(m => m.startsWith('qwen3-coder')) || st.ollama.models.find(m => m.startsWith('qwen2.5-coder')) || 'qwen2.5-coder';
  if (!set.visionModel) set.visionModel = st.ollama.models.find(m => m.startsWith('qwen2.5vl')) || 'qwen2.5vl';
  set.visionFallback = st.ollama.models.find(m => m.startsWith('granite3.2-vision')) || 'llava';
  await call('/api/settings', set);
  const b64 = fs.readFileSync(img).toString('base64'), tAll = Date.now();
  let t = Date.now(); const r = await call('/api/read-image', { images: [b64] }); const vMs = Date.now() - t;
  console.log(`\n== Tables read (${r.model}, ${vMs} ms) ==`);
  for (const tb of r.tables) { console.log(`${tb.name}(${tb.columns.map(c => c.name).join(', ')})`); for (const row of tb.rows || []) console.log('   ', row.join(' | ')); }
  t = Date.now(); const q = await call('/api/query', { tables: r.tables, dialect, request: question, lang: 'en', fast });
  console.log(`\n== Question: ${question} (${dialect}) ==\n${q.sql}\n${q.explanation}\nCheck: ${q.check.ok ? 'ok' : q.check.problems.join(', ')}`);
  console.log('\n== Result ==');
  if (q.test && !q.test.error) { console.log(q.test.columns.join(' | ')); for (const row of q.test.rows) console.log(row.map(v => v ?? 'NULL').join(' | ')); }
  else console.log('Test error:', JSON.stringify(q.test));
  const T = q.timing || {};
  console.log(`\n== Timings ==\nvision read: ${vMs} ms\nSQL generation (${q.model}): ${T.sql?.ms} ms (model load ${T.sql?.loadMs} ms)\ntest run: ${T.test?.ms ?? '-'} ms\ntotal: ${Date.now() - tAll} ms`);
  const want = /DEP_NAME/i.test(q.sql) && /L_NAME/i.test(q.sql) && q.test?.rows?.[0]?.[0] === 'Software Development';
  if (!args[1]) console.log(want ? '\nPASS: James -> Software Development' : '\nCHECK: expected Software Development via L_NAME = \'James\'');
  server.close(); process.exit(0);
})().catch(e => { console.error(e.message); server.close(); process.exit(1); });

// TQueries — on-device SQL report helper. Listens on 127.0.0.1 only; AI via local Ollama (no cloud).
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const S = require('./lib/sql'), TD = require('./lib/testdb'), P = require('./lib/patterns'), N = require('./lib/native');
const VERSION = { number: 'v0.5.4', name: 'Gemma', notesEs: ['v0.5.4 Gemma · Gemma 4 E4B escribe tu SQL.', 'El modelo SQL ahora es gemma4:e4b: 12/12 correctas, carga más rápido y ocupa un tercio; los demás modelos siguen en Ajustes.', 'Se lee el SQL de cualquier bloque de código (```sqlite, ```postgresql…).', 'v0.5.3 Swift Coder · SQL más rápido en tu Mac.', 'El modelo SQL ahora es qwen2.5-coder:14b, completo en la GPU; qwen3-coder sigue disponible en Ajustes.', 'Consultas de 3 o más tablas con tablas de enlace, y transacciones BEGIN…COMMIT/ROLLBACK en la copia de práctica.', 'v0.5.2 Instant Read · La foto se lee al instante.', 'Las filas aparecen en ~0,1 s y ya puedes preguntar; el modelo de Apple verifica las celdas en segundo plano y marca en naranja lo que cambió.', 'Preguntas entre dos tablas al instante: el departamento de James, empleados por departamento, y más, en los 6 dialectos.', 'v0.5.1 Clean Cells · Cada celda en su lugar.', 'El modelo de Apple convierte cada tabla de la foto en CSV; Apple Vision lo verifica por posición, celda por celda.', 'Las celdas en dos líneas y los valores pegados se separan bien. Lo que no coincide se marca en naranja para revisar.', 'Vision y el modelo de Apple se cargan al abrir la app: la primera foto ya es rápida.', 'v0.5 Instant · Preguntas comunes al instante con plantillas, en los 6 dialectos. Prueba de velocidad de tres motores.', 'v0.4.1 · Los ejemplos de formato se entienden, nunca se marcan. Ollama se abre solo.', 'Calcula cualquier valor de cualquier columna. Cualquier SQL, en una copia de práctica.'], notes: ['v0.5.4 Gemma · Gemma 4 E4B writes your SQL.', 'The SQL model is now gemma4:e4b: 12/12 correct, loads faster and is a third of the size; the other models stay in Settings.', 'SQL is read from any code block (```sqlite, ```postgresql…).', 'v0.5.3 Swift Coder · Faster SQL on your Mac.', 'The SQL model is now qwen2.5-coder:14b, fully on the GPU; qwen3-coder is still selectable in Settings.', 'Questions across 3+ tables through link tables, and BEGIN…COMMIT/ROLLBACK transactions on the practice copy.', 'v0.5.2 Instant Read · Your photo, read instantly.', 'Rows appear in ~0.1 s and you can ask right away; Apple’s model double-checks the cells in the background and marks what changed in orange.', 'Two-table questions are instant: James’s department, employees per department and more, in all 6 dialects.', 'v0.5.1 Clean Cells · Every cell in its place.', 'Apple’s model turns each table in your photo into CSV; Apple Vision checks it by position, cell by cell.', 'Wrapped cells and glued values come apart cleanly. Anything the two disagree on is marked orange to check.', 'Vision and Apple’s model load when the app opens, so the first photo is already fast.', 'v0.5 Instant · Common questions answered instantly by templates, in all 6 dialects. Three-engine benchmark.', 'v0.4.1 · Format examples are understood, never flagged. Ollama starts by itself.', 'Compute anything from any column. Any SQL, on a practice copy.'] };
const PORT = +process.env.PORT || 4321;
const BASE = path.resolve(process.env.TQUERIES_HOME || (process.platform === 'darwin' ? path.join(os.homedir(), 'TQueries') : path.join(__dirname, '..')));
const DATA = path.join(BASE, 'data'); fs.mkdirSync(DATA, { recursive: true });
const SAMPLES = path.join(DATA, 'samples'); fs.mkdirSync(SAMPLES, { recursive: true });
const SCHEMAS = path.join(DATA, 'schemas.json'), SETTINGS = path.join(DATA, 'settings.json');
const OLLAMA = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const DEF = { visionModel: 'qwen2.5vl', visionFallback: 'llava', sqlModel: 'gemma4:e4b', sqlFastModel: '', keepAlive: '30m', aiSampleData: false, sqlEngine: 'qwen', patterns: true, nativeVision: true };
// Per-task Ollama options: temperature 0, small context, capped output = short waits.
const OPTS = { vision: { num_ctx: 6144, num_predict: 2048 }, sql: { num_ctx: 4096, num_predict: 400 }, data: { num_ctx: 4096, num_predict: 2048 } };
const log = (...a) => { if (!process.env.TQ_QUIET) console.log('[TQ]', ...a); };
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJ = (f, v) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 2)); fs.renameSync(tmp, f); };
// v0.5.3 "Swift Coder": GPU layers per model. 14b fits fully on a 24 GB Mac (no cap); qwen3-coder keeps its 40-layer cap.
// Gemma 4 / qwen3 thinking models: think:false so the reply is just the SQL block (v0.5.3).
const gpuFor = model => /qwen3-coder/i.test(model || '') ? { num_gpu: 40 } : {};
// One-time move of a saved qwen3-coder / blank / untagged SQL model to 14b; qwen3-coder stays selectable in Settings.
function migrate053() { const cur = readJ(SETTINGS, null); if (!cur || cur.migrated053) return;
  if (!cur.sqlModel || /^qwen3-coder/i.test(cur.sqlModel) || !cur.sqlModel.includes(':')) cur.sqlModel = DEF.sqlModel; // v0.5.4: gemma4:e4b; an explicit tagged choice (e.g. gemma4:e4b, qwen2.5-coder:14b) is never changed
  cur.migrated053 = true; writeJ(SETTINGS, cur); }
const settings = () => ({ ...DEF, ...readJ(SETTINGS, {}) });

// v0.4.1: Ollama auto-start. If 127.0.0.1:11434 is unreachable, open it (macOS app / Windows app / Linux serve), wait up to ~30 s, then warm up.
const { spawn } = require('child_process');
const AUTO = { starting: false, tried: 0, waitMs: +process.env.TQ_OLLAMA_WAIT_MS || 30000, starter: null, lastStart: 0 };
function startOllamaProcess() {
  if (AUTO.starter) return AUTO.starter();
  const opt = { detached: true, stdio: 'ignore' };
  const run = (cmd, args) => { try { const c = spawn(cmd, args, opt); c.on('error', () => {}); c.unref(); return true; } catch { return false; } };
  if (process.platform === 'darwin') return run('open', ['-a', 'Ollama']);
  if (process.platform === 'win32') return run('cmd', ['/c', 'start', '""', 'ollama app']) || run('ollama', ['serve']);
  return run('ollama', ['serve']);
}
async function ollamaUp() { try { const r = await fetch(OLLAMA + '/api/version', { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } }
let ensuring = null;
async function ensureOllama() {
  if (await ollamaUp()) return true;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(OLLAMA)) return false; // only start a local Ollama
  if (ensuring) return ensuring;
  ensuring = (async () => { AUTO.starting = true; AUTO.tried++; AUTO.lastStart = Date.now(); log('Ollama not reachable: starting it'); startOllamaProcess();
    const end = Date.now() + AUTO.waitMs; let ok = false;
    while (Date.now() < end) { await new Promise(r => setTimeout(r, 500)); if (await ollamaUp()) { ok = true; break; } }
    AUTO.starting = false; log('Ollama auto-start: ' + (ok ? 'up in ' + (Date.now() - AUTO.lastStart) + ' ms' : 'timed out'));
    if (ok) { lastWarm = 0; warmUp(); } return ok; })().finally(() => { ensuring = null; });
  return ensuring;
}
let lastWarm = 0;
async function ollamaTags() {
  try { const r = await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(2500) }); if (!r.ok) throw 0;
    return { running: true, models: ((await r.json()).models || []).map(m => m.name) }; }
  catch { return { running: false, models: [] }; }
}
const has = (models, want) => models.some(m => m === want || m.split(':')[0] === want.split(':')[0] && !want.includes(':'));
class Friendly extends Error { constructor(code, extra) { super(code); this.code = code; Object.assign(this, extra); } }
async function generate(model, prompt, images, json, task = 'sql', timing) {
  const t0 = Date.now();
  const req = () => fetch(OLLAMA + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, images, stream: false, keep_alive: settings().keepAlive || '30m', ...(json ? { format: 'json' } : {}), ...(/gemma|qwen3(?!-coder)/i.test(model) ? { think: false } : {}), options: { temperature: 0, ...(OPTS[task] || OPTS.sql), ...(task === 'vision' ? {} : gpuFor(model)) } }) });
  const r = await req().catch(async () => { if (await ensureOllama()) return req().catch(() => { throw new Friendly('ollama_down'); }); throw new Friendly('ollama_down'); });
  if (r.status === 404) throw new Friendly('model_missing', { model });
  if (!r.ok) throw new Friendly('ollama_error', { detail: (await r.text()).slice(0, 300) });
  const j = await r.json(), ms = Date.now() - t0, load = Math.round((j.load_duration || 0) / 1e6);
  log(`${task} ${model}: ${ms} ms (model load ${load} ms, prompt ${j.prompt_eval_count ?? '?'} tok, out ${j.eval_count ?? '?'} tok)`);
  if (timing) timing[task] = { ms, loadMs: load, model };
  return j.response || '';
}
async function pickModel(kind, fast) {
  const st = settings(); let t = await ollamaTags();
  if (!t.running && await ensureOllama()) t = await ollamaTags();
  if (!t.running) throw new Friendly('ollama_down');
  const opts = kind === 'vision' ? [st.visionModel, st.visionFallback] : fast && st.sqlFastModel ? [st.sqlFastModel, st.sqlModel] : [st.sqlModel, 'gemma4:e4b', 'qwen2.5-coder:14b', 'qwen2.5-coder', 'qwen3-coder'];
  for (const o of opts) { if (!o) continue; const hit = t.models.find(m => m === o) || (has(t.models, o) && t.models.find(m => m.split(':')[0] === o)); if (hit) return hit; }
  throw new Friendly('model_missing', { model: opts[0] });
}
function body(req, limit = 40e6) {
  return new Promise((ok, no) => { let n = 0, b = []; req.on('data', c => { n += c.length; if (n > limit) { no(new Friendly('too_big')); req.destroy(); } else b.push(c); });
    req.on('end', () => { try { ok(b.length ? JSON.parse(Buffer.concat(b)) : {}); } catch { no(new Friendly('bad_json')); } }); });
}
const send = (res, code, v) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(v)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// Practice data: photo rows win; else deterministic generator (instant). Local-model data only if turned on.
async function sampleData(tables, regenerate, useAi = settings().aiSampleData) {
  const key = TD.schemaHash(tables) + (useAi ? '-ai' : ''), f = path.join(SAMPLES, key + '.json');
  let cache = regenerate ? null : readJ(f, null);
  if (!cache) {
    const gen = tables.filter(t => !t.rows), n = 12, seed = regenerate ? Date.now() % 1e6 : 42;
    const data = {}, source = {}; let ai = null;
    if (gen.length && useAi) try { const model = await pickModel('sql'); const fks = TD.inferFks(tables);
      ai = S.extractJson(await generate(model, TD.dataPrompt(gen, fks.filter(k => gen.some(g => g.name === k.table)), n), undefined, true, 'data')); } catch {}
    for (const t of gen) { const hit = ai && !Array.isArray(ai) && Object.entries(ai).find(([k]) => k.toLowerCase() === t.name.toLowerCase());
      const rows = hit ? TD.alignRows(t, hit[1]).filter(r => r.some(v => v != null)) : [];
      if (rows.length >= 3) { data[t.name] = rows.slice(0, 20); source[t.name] = 'ai'; } else { data[t.name] = TD.fallbackRows(t, n, seed + t.name.length); source[t.name] = 'sample'; } }
    cache = { key, created: new Date().toISOString(), data, source }; writeJ(f, cache);
  }
  const data = JSON.parse(JSON.stringify(cache.data)), source = { ...cache.source };
  for (const t of tables) { if (t.rows) { data[t.name] = t.rows; source[t.name] = 'photo'; } else if (!data[t.name]) { data[t.name] = TD.fallbackRows(t, 12, 42); source[t.name] = 'sample'; } }
  const fks = TD.fixFks(tables, data, source);
  return { data, source, fks, counts: Object.fromEntries(tables.map(t => [t.name, data[t.name].length])) };
}
function txnTranslate(sql, dialect, tables) { const p = TD.splitSql(sql), notes = []; let changed = false;
  const out = p.map(x => { if (dialect === 'sqlite' || /^(begin|start|set\s+transaction|commit|rollback)\b/i.test(x)) return x; const t = TD.translate(x, dialect, tables); changed = changed || t.changed; notes.push(...(t.notes || [])); return t.sql.replace(/;\s*$/, ''); });
  return { sql: out.join(';\n') + ';', changed, notes }; }
async function testQuery(b) { const t0 = Date.now();
  const tables = S.normalizeTables(b.tables || []); if (!tables.length) throw new Friendly('no_schema');
  const sql = String(b.sql || '').trim(), dialect = S.DIALECTS[b.dialect] ? b.dialect : 'postgresql';
  const bad = TD.safeCheck(sql); if (bad) throw new Friendly(bad);
  const { data, source, fks, counts } = await sampleData(tables, !!b.regenerate, b.aiData === undefined ? undefined : !!b.aiData);
  const tr = TD.isTxn(sql) ? txnTranslate(sql, dialect, tables) : dialect === 'sqlite' ? { sql: sql.replace(/;\s*$/, ''), changed: false, notes: [] } : TD.translate(sql, dialect, tables);
  let r = await TD.runSqlite(tables, data, tr.sql), via = tr.changed ? 'rules' : 'none', ran = tr.sql;
  if (!r.ok && r.error !== 'timeout' && dialect !== 'sqlite') { // ask the local model for a SQLite translation
    try { const model = await pickModel('sql'); const alt = S.extractSql(await generate(model, S.sqliteTranslatePrompt(sql, dialect, tables), undefined, false, 'translate')).sql;
      if (alt && !TD.safeCheck(alt)) { const r2 = await TD.runSqlite(tables, data, alt.replace(/;\s*$/, '')); if (r2.ok) { r = r2; via = 'model'; ran = alt; } } } catch {}
  }
  if (!r.ok) throw new Friendly(r.error === 'timeout' ? 'timeout' : 'test_failed', { detail: r.error, ran });
  log(`test: ${Date.now() - t0} ms (via ${via})`);
  return { ...r, translated: via !== 'none', via, sqliteSql: ran, notes: tr.notes, source, counts, fks, maxRows: TD.MAX_ROWS };
}
const routes = {
  'POST /api/test': testQuery,
  'POST /api/fix': async b => {
    const tables = S.normalizeTables(b.tables || []); const fix = String(b.fix || '').trim(), sql0 = String(b.sql || '').trim();
    if (!tables.length) throw new Friendly('no_schema'); if (!fix) throw new Friendly('no_fix'); if (!sql0) throw new Friendly('no_request');
    const dialect = S.DIALECTS[b.dialect] ? b.dialect : 'postgresql'; const model = await pickModel('sql');
    const raw = await generate(model, S.fixPrompt({ tables, dialect, sql: sql0, request: b.request, fix, lang: b.lang, result: b.result ? String(b.result).slice(0, 600) : '' }));
    const { sql, explanation } = S.extractSql(raw); const check = S.validate(sql, tables);
    return { model, dialect, sql, explanation, check }; },
  'GET /api/state': async () => { if (require.main === module) warmUp(); const o = await ollamaTags(); if (!o.running && require.main === module && Date.now() - AUTO.lastStart > 45000) ensureOllama(); return { version: VERSION, settings: settings(), native: { platform: process.platform, ready: !!N.state.bin, error: N.state.error }, ollama: { ...o, starting: AUTO.starting }, dialects: Object.fromEntries(Object.entries(S.DIALECTS).map(([k, v]) => [k, v.name])) }; },
  'POST /api/settings': async b => { const cur = readJ(SETTINGS, {}); for (const k of Object.keys(DEF)) { if (typeof DEF[k] === 'boolean') { if (typeof b[k] === 'boolean') cur[k] = b[k]; }
    else if (typeof b[k] === 'string' && (b[k].trim() || k === 'sqlFastModel')) cur[k] = b[k].trim(); } if (cur.sqlEngine && !['qwen', 'apple'].includes(cur.sqlEngine)) cur.sqlEngine = 'qwen'; writeJ(SETTINGS, cur); return settings(); },
  'GET /api/schemas': async () => readJ(SCHEMAS, []),
  'POST /api/schemas': async b => { // save (upsert by id); never deletes other schemas
    const list = readJ(SCHEMAS, []); const name = String(b.name || '').trim() || 'Untitled';
    const tables = S.normalizeTables(b.tables || []); const id = b.id || Date.now().toString(36);
    const i = list.findIndex(x => x.id === id); const rec = { id, name, tables, updated: new Date().toISOString() };
    if (i >= 0) list[i] = rec; else list.push(rec); writeJ(SCHEMAS, list); return rec; },
  'POST /api/bench': async b => runBench(b.engines),
  'POST /api/parse-schema': async b => ({ tables: S.parseSchemaText(b.text) }),
  'POST /api/read-image': async b => {
    const imgs = (b.images || []).map(x => String(x).replace(/^data:[^,]+,/, '')).filter(Boolean);
    if (!imgs.length) throw new Friendly('no_image');
    const timing = {}, t0 = Date.now(); let tables = [], model = null;
    let checkId = null;
    if (settings().nativeVision !== false) try { const r = await N.readFast(imgs, log); // v0.5.2: Vision positions now, Apple's CSV check in the background
      const shape = list => { const tb = (list || []).filter(t => t.columns && t.columns.length).map((t, i) => ({ name: guessName(t, i), columns: t.columns, rows: t.rows, flags: t.flags || [] }));
        return S.normalizeTables(tb).map((t, i) => (tb[i] && tb[i].flags.length ? { ...t, flags: tb[i].flags } : t)); };
      tables = shape(r.tables);
      if (tables.length) { model = 'apple-vision'; timing.vision = { ms: r.ms, engine: r.engine }; log(`read-image: first read ${r.ms} ms (vision positions)`);
        checkId = startCheck(r.check.then(x => { const after = shape(x.tables); log(`read-image: check done ${x.ms} ms (${x.engine}), ${after.reduce((n, t) => n + (t.flags || []).length, 0)} cell(s) flagged`); return { ...x, tables: updated(tables, after) }; })); }
      else r.check.catch(() => {}); }
    catch (e) { if (process.platform === 'darwin') log('native reader unavailable: ' + e.message);
      try { const r = await N.readImages(imgs); const tb = (r.tables || []).filter(t => t.columns && t.columns.length).map((t, i) => ({ name: guessName(t, i), columns: t.columns, rows: t.rows }));
        tables = S.normalizeTables(tb); if (tables.length) { model = 'apple-vision'; timing.vision = { ms: r.ms, engine: r.engine }; } } catch {} }
    if (!tables.length) { model = await pickModel('vision');
      for (const img of imgs) { const out = await generate(model, S.VISION_PROMPT, [img], true, 'vision', timing); tables.push(...S.normalizeTables(S.extractJson(out) || [])); } }
    log(`read-image: ${imgs.length} image(s), ${Date.now() - t0} ms`);
    const merged = []; for (const t of tables) { const e = merged.find(x => x.name.toLowerCase() === t.name.toLowerCase());
      if (e) for (const c of t.columns) { if (!e.columns.some(x => x.name.toLowerCase() === c.name.toLowerCase())) e.columns.push(c); } else merged.push(t); }
    if (!merged.length) throw new Friendly('no_tables', { model });
    for (const t of merged) if (t.rows) t.rows = t.rows.slice(0, 20);
    return { model, tables: merged, ms: Date.now() - t0, timing, checkId }; },
  'GET /api/check': async (b, u) => { const j = CHECKS.get(String(u && u.searchParams.get('id'))); if (!j) throw new Friendly('no_check'); return j.done ? { state: 'done', ...j.done } : j.error ? { state: 'failed', error: j.error } : { state: 'running' }; },
  'POST /api/query': async b => {
    const tables = S.normalizeTables(b.tables || []); const request = String(b.request || '').trim();
    if (!tables.length) throw new Friendly('no_schema'); if (!request) throw new Friendly('no_request');
    const dialect = S.DIALECTS[b.dialect] ? b.dialect : 'postgresql', st = settings(), t0 = Date.now();
    const fast = await fastSql(tables, request, dialect, b.lang, b.engine || (st.patterns === false ? st.sqlEngine : 'auto'));
    if (!fast && b.engine === 'pattern') throw new Friendly('no_pattern');
    if (fast) return finish(b, tables, dialect, fast.engine, fast.sql, fast.explanation, fast.input, { sql: { ms: fast.ms, engine: fast.engine } }, t0, fast.pattern);
    const model = await pickModel('sql', !!b.fast), timing = {};
    const prompt = S.sqlPrompt({ tables, dialect, request, lang: b.lang, joins: TD.inferFks(tables) });
    let { sql, explanation } = S.extractSql(await generate(model, prompt, undefined, false, 'sql', timing));
    let input = S.inputCheck(sql, request, tables);
    if (!input.ok && input.wrongColumn.length && !input.missing.length && !input.swapped.length) { // fix the column directly, no second model call
      const fixed = S.fixColumns(sql, input.wrongColumn), i2 = S.inputCheck(fixed, request, tables);
      if (i2.ok) { sql = fixed; input = i2; log('input check: column fixed directly'); } }
    if (!input.ok) { // verify the input: retry once, telling the model exactly which typed values it dropped or swapped
      const t2 = {}; const fixNote = `\nYour previous query was WRONG: ${input.missing.length ? 'it must use these values exactly as typed: ' + input.missing.map(v => `'${v}'`).join(', ') + '. ' : ''}${input.swapped.length ? 'it used values the user never typed: ' + input.swapped.map(v => `'${v}'`).join(', ') + '. ' : ''}${input.wrongColumn.length ? input.wrongColumn.map(w => `'${w.value}' is stored in ${w.columns.join(' or ')}; filter on that column. `).join('') : ''}Write it again.`;
      const again = S.extractSql(await generate(model, prompt + fixNote, undefined, false, 'sql', t2));
      const input2 = S.inputCheck(again.sql, request, tables); log(`input check retry: ${input2.ok ? 'fixed' : 'still wrong'} (${t2.sql?.ms ?? '?'} ms)`);
      if (input2.ok || input2.missing.length + input2.swapped.length < input.missing.length + input.swapped.length) { sql = again.sql; explanation = again.explanation; input = input2; }
      timing.retry = t2.sql; }
    if (!input.ok && input.wrongColumn.length) { const fixed = S.fixColumns(sql, input.wrongColumn), i3 = S.inputCheck(fixed, request, tables);
      log('input check final fix: ' + (i3.ok ? 'fixed' : 'no') + ' :: ' + JSON.stringify(sql).slice(0, 300)); if (i3.ok || i3.wrongColumn.length < input.wrongColumn.length) { sql = fixed; input = i3; } }
    timing.sql = { ...(timing.sql || {}), engine: 'qwen' };
    return finish(b, tables, dialect, model, sql, explanation, input, timing, t0); },
};
async function finish(b, tables, dialect, model, sql, explanation, input, timing, t0, pattern) {
    const check = S.validate(sql, tables);
    check.input = input; if (!input.ok) { check.ok = false; check.problems = [...(check.problems || []), ...input.missing.map(v => 'input_missing:' + v), ...input.swapped.map(v => 'input_swapped:' + v), ...input.wrongColumn.map(w => 'input_column:' + w.value)]; }
    if (dialect === 'sqlite') check.explain = S.sqliteExplain(sql, tables);
    const out = { model, dialect, sql, explanation, check, timing, engine: timing.sql?.engine || 'qwen', pattern };
    if (b.autoTest !== false && !TD.safeCheck(sql)) { const t1 = Date.now(); // one step: query + its result
      try { out.test = await testQuery({ tables, sql, dialect }); } catch (e) { out.test = { error: e.code || 'server', detail: e.detail }; }
      timing.test = { ms: Date.now() - t1 }; }
    log(`query: total ${Date.now() - t0} ms (${out.engine} ${timing.sql?.ms} ms, test ${timing.test?.ms ?? '-'} ms)`);
    return out; }
// v0.5: instant engines. 'auto' = pattern, then the chosen engine; 'pattern' / 'apple' / 'qwen' force one (benchmark).
async function fastSql(tables, request, dialect, lang, engine) {
  const st = settings();
  if (engine === 'auto' || engine === 'pattern') { const m = P.match(tables, request, dialect, lang);
    if (m) return { engine: 'pattern', sql: m.sql, explanation: m.explanation, ms: m.ms, pattern: m.pattern, input: S.inputCheck(m.sql, request, tables) };
    if (engine === 'pattern') return null; }
  if (engine === 'apple' || (engine === 'auto' && st.sqlEngine === 'apple')) { const t = Date.now();
    try { const r = await N.sql(S.schemaText(tables), S.DIALECTS[dialect].name, request); const sql = S.extractSql('```sql\n' + r.sql.replace(/^```\w*\n?|```$/g, '') + '\n```').sql;
      if (sql) return { engine: 'apple', sql, explanation: '', ms: Date.now() - t, input: S.inputCheck(sql, request, tables) }; } catch (e) { log('apple sql unavailable: ' + e.message); if (engine === 'apple') throw new Friendly('apple_unavailable', { detail: e.message }); } }
  return null;
}
// v0.5.2: background cell checks (kept in memory, newest 20)
const CHECKS = new Map(); let checkN = 0;
function startCheck(p) { const id = 'c' + Date.now().toString(36) + (++checkN), j = { started: Date.now() }; CHECKS.set(id, j);
  p.then(x => { j.done = x; }, e => { j.error = e.message || 'failed'; log('read-image check failed: ' + j.error); });
  while (CHECKS.size > 20) CHECKS.delete(CHECKS.keys().next().value); return id; }
// cells the check changed vs the first reading get an extra 'updated' flag (unless already flagged)
function updated(before, after) { return after.map(t => { const b = before.find(x => x.name === t.name); const flags = [...(t.flags || [])];
  if (b && b.rows && t.rows) t.rows.forEach((row, r) => row.forEach((v, c) => { const o = b.rows[r] ? b.rows[r][c] : undefined;
    if (String(o ?? '') !== String(v ?? '') && !flags.some(f => f.r === r && f.c === c)) flags.push({ r, c, alt: String(o ?? ''), why: 'updated' }); }));
  if (b) t.columns.forEach((col, c) => { const o = b.columns[c]; if (o && o.name !== col.name && !flags.some(f => f.r === -1 && f.c === c)) flags.push({ r: -1, c, alt: o.name, why: 'updated' }); });
  return flags.length ? { ...t, flags } : t; }); }
// Table name from the photo's title, else from the id column (EMP_ID → EMPLOYEES), else TABLE1…
function guessName(t, i) { if (t.title && /\w/.test(t.title)) return String(t.title).trim().toUpperCase().replace(/\W+/g, '_').replace(/^_|_$/g, '');
  const id = (t.columns || []).map(String).find(c => /^[A-Za-z]+_?ID$/i.test(c.replace(/\s/g, '')));
  const map = { EMP: 'EMPLOYEES', DEPT: 'DEPARTMENTS', DEP: 'DEPARTMENTS', CUST: 'CUSTOMERS', PROD: 'PRODUCTS', ORD: 'ORDERS' };
  const first = String((t.columns || [])[0] || '').replace(/\s/g, '').toUpperCase().match(/^([A-Z]+)_?ID(_|$)/); // v0.5.1: the key column names the table (DEPT_ID_DEP → DEPARTMENTS)
  if (first && map[first[1]]) return map[first[1]];
  if (id) { const k = id.replace(/\s/g, '').toUpperCase().replace(/_?ID$/, ''); return map[k] || (k.endsWith('S') ? k : k + 'S'); }
  return 'TABLE' + (i + 1); }

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), key = req.method + ' ' + u.pathname;
  if (routes[key]) {
    if (req.method === 'POST' && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(req.headers.origin || 'http://127.0.0.1:')) return send(res, 403, { error: 'origin' });
    try { send(res, 200, await routes[key](req.method === 'POST' ? await body(req) : {}, u)); }
    catch (e) { send(res, e.code ? 400 : 500, { error: e.code || 'server', model: e.model, detail: e.detail || (e.code ? undefined : e.message) }); }
    return;
  }
  const f = path.join(__dirname, 'public', u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^([/\\])+/, ''));
  if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
// Warm-up: load the SQL model into memory at launch (empty prompt = load only), so the first question is fast.
async function warmUp() { if (Date.now() - lastWarm < 60000) return; lastWarm = Date.now();
  try { const model = await pickModel('sql'); const t = Date.now();
    await fetch(OLLAMA + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt: '', keep_alive: settings().keepAlive || '30m', options: { num_ctx: OPTS.sql.num_ctx, ...gpuFor(model) } }) });
    log(`warm-up ${model}: ${Date.now() - t} ms`); } catch {} }
if (require.main === module) migrate053();
if (require.main === module) server.listen(PORT, '127.0.0.1', () => { console.log(`TQueries ${VERSION.number} → http://127.0.0.1:${PORT}  (data: ${DATA})`); ensureOllama().then(up => up && warmUp()); if (process.platform === 'darwin') N.ensure().then(async b => { log(b ? 'Apple on-device helper ready' : 'Apple helper not built: ' + (N.state.error || 'unavailable')); if (b && settings().nativeVision !== false) try { const w = await N.warm(); log(`warm-up Apple Vision + model: ${w.ms} ms`); } catch (e) { log('Apple warm-up skipped: ' + e.message); } }); });
// v0.5 benchmark: the 12 standard questions × engines, timed, results checked on the practice DB.
async function runBench(engines = ['pattern', 'apple', 'qwen'], dialect = 'sqlite') {
  const F = require('../test/standard12'), tables = S.normalizeTables(F.TABLES), out = {};
  for (const e of engines) { const rows = []; let ok = 0, ms = 0;
    for (const [q, want] of F.Q) { const t = Date.now(); let r = null, err = null;
      try { r = await routes['POST /api/query']({ tables, request: q, dialect, engine: e === 'qwen' ? 'none' : e }); } catch (x) { err = x.code || x.message; if (['apple_unavailable', 'ollama_down', 'model_missing'].includes(err)) { rows.push({ q, error: err }); break; } }
      const good = !!(r && r.engine === e && r.test && F.correct(r.test, want)); if (good) ok++;
      const m = r ? r.timing.sql?.ms ?? Date.now() - t : null; if (m != null) ms += m;
      rows.push({ q, engine: r?.engine || null, ms: m, ok: good, sql: r?.sql, error: err || r?.test?.error }); }
    out[e] = { ok, total: F.Q.length, ms, rows }; }
  return out; }
module.exports = { runBench, routes, guessName, server, VERSION, sampleData, DEF, OPTS, AUTO, ensureOllama };

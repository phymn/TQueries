const $ = s => document.querySelector(s);
const T = {
 en: { tag: 'Your reports. Written in SQL. On this device.', s1: 'Show me your tables.', s1sub: 'Drop screenshots. Fix anything I misread. Saved once, ready forever.',
  sname: 'Schema name — e.g. 84logic Accounting', save: 'Save', new: 'New', drop: 'Drop table screenshots here', drop2: 'or click to choose · PNG, JPG',
  read: 'Read tables', manual: 'Type or paste instead', mph: 'Clients(ClientID int, Name text)\nInvoices: InvoiceID, ClientID, Total, Date\n— or paste CREATE TABLE statements', parse: 'Add these tables',
  addT: '+ Table', s2: 'Tell me the report.', rph: 'e.g. Total invoiced per client this month, highest first', go: 'Write the query', s3: 'Your query.', copy: 'Copy', copied: 'Copied ✓',
  eng: 'SQL engine', engQwen: 'qwen (default)', engApple: 'Apple Foundation Models (Mac)', bench: 'Run benchmark', benching: 'Timing 12 questions…', benchOk: (e, ok, n, s) => `${e}: ${ok}/${n} correct · ${s} s`, benchNa: e => `${e}: not available here`, apple_unavailable: 'Apple Foundation Models isn’t available on this Mac.', no_pattern: 'No instant template for this question.',
  models: 'On-device models', vm: 'Vision model', vf: 'Vision fallback', sm: 'SQL model', fm: 'Fast SQL model (optional, e.g. qwen2.5-coder:7b)', fast: 'Fast mode', aid: 'AI sample data (slower)', cancel: 'Cancel', tname: 'Table name', cname: 'column', ctype: 'type', addC: '+ column',
  aiOn: 'AI ready · on device', aiOff: 'AI offline', reading: 'Reading…', writing: 'Writing…', saved: 'Saved ✓', pick: '— Saved schemas —',
  aiStarting: 'Starting the on-device AI… one moment.', ollama_down: 'Ollama isn’t running. Install it free from <b>ollama.com</b>, open it, then try again. Manual table entry still works.',
  model_missing: m => `Model <b>${m}</b> isn’t installed yet. In Terminal run: <code>ollama pull ${m}</code>`,
  flagTip: (alt, why) => why === 'missing' ? 'Only Apple’s model saw this value. Please check it.' : `Readers disagreed (other reading: “${alt}”). Please check it.`, flagN: n => `${n} cell${n === 1 ? '' : 's'} to check`, preview: 'Photo rows', checking: 'Double-checking cells…', checked: 'Checked', checkFail: 'Check unavailable · first reading kept', updTip: o => `Updated by the check (first reading: “${o}”).`,
  no_tables: 'I couldn’t find tables in that image. Try a sharper screenshot, or type them instead.', no_schema: 'Add at least one table first.', no_request: 'Describe the report you need.',
  no_image: 'Drop a screenshot first.', ok: '✓ Every table and column exists in your schema.', explainOk: '✓ SQLite EXPLAIN passed on an empty test database.',
  explainBad: e => '✕ SQLite says: ' + e, not_select: '✕ This isn’t a SELECT query.', writes: '⚠︎ This changes data. Tested only on the practice copy. Back up before running it on your real database.', changed: (n, t) => `${n} row(s) changed in ${t} · practice copy · table after the change:`, input_missing: v => `✕ Your value “${v}” is missing from the query.`, input_swapped: v => `✕ The query uses “${v}”, which you didn’t ask for.`, input_column: v => `✕ “${v}” isn’t filtered on the column that holds it.`, blocked: 'That command can’t run, even on the practice copy.',
  table: x => `✕ Table “${x}” isn’t in your schema.`, column: x => `✕ Column “${x}” isn’t in that table.`, unknown: x => `⚠ “${x}” not found in the schema — check it.`, err: 'Something went wrong: ',
  test: 'Test query', regen: 'New sample data', testing: 'Testing…', fph: 'What to fix? e.g. also show clients with no orders', fixGo: 'Fix and rewrite', fixing: 'Rewriting…',
  rows: n => `${n} row${n === 1 ? '' : 's'}`, meta: (n, sh, tr) => `${n} row${n === 1 ? '' : 's'}${tr ? ` · showing first ${sh}` : ''} · practice data, never your real database`,
  src: { photo: 'from your photo', ai: 'AI sample', sample: 'sample' }, tnote: v => v === 'model' ? 'ⓘ The local model translated your query to SQLite for this test. Your query above is unchanged.' : 'ⓘ Translated to SQLite for this test only. Your query above is unchanged.',
  timeout: 'The test took too long and was stopped.', test_failed: 'The practice database couldn’t run it: ', no_fix: 'Tell me what to fix.', multi: 'Only one statement can be tested at a time.' },
 es: { tag: 'Tus reportes. Escritos en SQL. En este equipo.', s1: 'Muéstrame tus tablas.', s1sub: 'Suelta capturas. Corrige lo que lea mal. Se guarda una vez, listo siempre.',
  sname: 'Nombre del esquema — ej. Contabilidad 84logic', save: 'Guardar', new: 'Nuevo', drop: 'Suelta aquí las capturas de tablas', drop2: 'o haz clic para elegir · PNG, JPG',
  read: 'Leer tablas', manual: 'Escribir o pegar', mph: 'Clientes(ClienteID int, Nombre text)\nFacturas: FacturaID, ClienteID, Total, Fecha\n— o pega sentencias CREATE TABLE', parse: 'Agregar estas tablas',
  addT: '+ Tabla', s2: 'Dime el reporte.', rph: 'ej. Total facturado por cliente este mes, de mayor a menor', go: 'Escribir la consulta', s3: 'Tu consulta.', copy: 'Copiar', copied: 'Copiado ✓',
  eng: 'Motor SQL', engQwen: 'qwen (predeterminado)', engApple: 'Apple Foundation Models (Mac)', bench: 'Probar velocidad', benching: 'Midiendo 12 preguntas…', benchOk: (e, ok, n, s) => `${e}: ${ok}/${n} correctas · ${s} s`, benchNa: e => `${e}: no disponible aquí`, apple_unavailable: 'Apple Foundation Models no está disponible en este Mac.', no_pattern: 'No hay plantilla instantánea para esta pregunta.',
  models: 'Modelos en el equipo', vm: 'Modelo de visión', vf: 'Visión alterno', sm: 'Modelo SQL', fm: 'Modelo SQL rápido (opcional, ej. qwen2.5-coder:7b)', fast: 'Modo rápido', aid: 'Datos de prueba con IA (más lento)', cancel: 'Cancelar', tname: 'Nombre de tabla', cname: 'columna', ctype: 'tipo', addC: '+ columna',
  aiOn: 'IA lista · en el equipo', aiOff: 'IA apagada', reading: 'Leyendo…', writing: 'Escribiendo…', saved: 'Guardado ✓', pick: '— Esquemas guardados —',
  aiStarting: 'Iniciando la IA en tu equipo… un momento.', ollama_down: 'Ollama no está abierto. Instálalo gratis desde <b>ollama.com</b>, ábrelo e inténtalo otra vez. Puedes escribir las tablas a mano.',
  model_missing: m => `El modelo <b>${m}</b> no está instalado. En Terminal ejecuta: <code>ollama pull ${m}</code>`,
  flagTip: (alt, why) => why === 'missing' ? 'Solo el modelo de Apple vio este valor. Revísalo.' : `Las lecturas no coinciden (otra lectura: “${alt}”). Revísalo.`, flagN: n => `${n} celda${n === 1 ? '' : 's'} por revisar`, preview: 'Filas de la foto', checking: 'Verificando celdas…', checked: 'Verificado', checkFail: 'Verificación no disponible · se mantiene la primera lectura', updTip: o => `Actualizado por la verificación (primera lectura: “${o}”).`,
  no_tables: 'No encontré tablas en esa imagen. Prueba una captura más nítida o escríbelas.', no_schema: 'Agrega al menos una tabla.', no_request: 'Describe el reporte que necesitas.',
  no_image: 'Suelta una captura primero.', ok: '✓ Todas las tablas y columnas existen en tu esquema.', explainOk: '✓ EXPLAIN de SQLite pasó en una base de prueba vacía.',
  explainBad: e => '✕ SQLite dice: ' + e, not_select: '✕ Esto no es una consulta SELECT.', writes: '⚠︎ Esto cambia datos. Solo se probó en la copia de práctica. Haz un respaldo antes de usarla en tu base real.', changed: (n, t) => `${n} fila(s) cambiadas en ${t} · copia de práctica · tabla después del cambio:`, input_missing: v => `✕ Tu valor “${v}” no está en la consulta.`, input_swapped: v => `✕ La consulta usa “${v}”, que no pediste.`, input_column: v => `✕ “${v}” no se filtra en la columna que lo contiene.`, blocked: 'Ese comando no se puede ejecutar, ni en la copia de práctica.',
  table: x => `✕ La tabla “${x}” no está en tu esquema.`, column: x => `✕ La columna “${x}” no está en esa tabla.`, unknown: x => `⚠ “${x}” no aparece en el esquema — revísalo.`, err: 'Algo salió mal: ',
  test: 'Probar consulta', regen: 'Nuevos datos de prueba', testing: 'Probando…', fph: '¿Qué corregir? ej. muestra también clientes sin pedidos', fixGo: 'Corregir y reescribir', fixing: 'Reescribiendo…',
  rows: n => `${n} fila${n === 1 ? '' : 's'}`, meta: (n, sh, tr) => `${n} fila${n === 1 ? '' : 's'}${tr ? ` · mostrando las primeras ${sh}` : ''} · datos de práctica, nunca tu base real`,
  src: { photo: 'de tu foto', ai: 'ejemplo IA', sample: 'ejemplo' }, tnote: v => v === 'model' ? 'ⓘ El modelo local tradujo tu consulta a SQLite para esta prueba. Tu consulta de arriba no cambia.' : 'ⓘ Traducida a SQLite solo para esta prueba. Tu consulta de arriba no cambia.',
  timeout: 'La prueba tardó demasiado y se detuvo.', test_failed: 'La base de práctica no pudo ejecutarla: ', no_fix: 'Dime qué corregir.', multi: 'Solo se puede probar una instrucción a la vez.' } };
let lang = localStorage.lang || 'en', st = {}, schemas = [], cur = { id: null, name: '', tables: [] }, images = [];
const t = k => T[lang][k];
async function api(p, b) { const r = await fetch(p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : {}); const j = await r.json(); if (!r.ok) throw j; return j; }
function showErr(e) { const n = $('#notice'); const f = T[lang][e.error]; n.innerHTML = e.error === 'test_failed' ? esc(f + (e.detail || '')) : typeof f === 'function' ? f(e.model) : f || (t('err') + (e.detail || e.error || e.message || e)); n.classList.remove('hidden'); n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
const clearErr = () => $('#notice').classList.add('hidden');
function applyLang() {
  document.documentElement.lang = lang; $('#lang').textContent = lang === 'en' ? 'ES' : 'EN';
  document.querySelectorAll('[data-t]').forEach(e => e.textContent = t(e.dataset.t));
  document.querySelectorAll('[data-ph]').forEach(e => e.placeholder = t(e.dataset.ph));
  renderAi(); renderSaved(); renderTables(); renderCheck();
}
function renderAi() { const o = st.ollama || {}; const p = $('#ai'); p.textContent = o.running ? t('aiOn') : o.starting ? t('aiStarting') : t('aiOff'); p.className = 'pill ' + (o.running ? 'on' : 'off'); if (!o.running && o.starting) setTimeout(async () => { try { st.ollama = (await api('/api/state')).ollama; renderAi(); } catch {} }, 3000); }
function renderSaved() { $('#saved').innerHTML = `<option value="">${t('pick')}</option>` + schemas.map(s => `<option value="${s.id}" ${s.id === cur.id ? 'selected' : ''}>${esc(s.name)}</option>`).join(''); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderTables() {
  $('#tables').innerHTML = cur.tables.map((tb, i) => `<div class="tbl" data-i="${i}"><div class="col"><input class="tn" data-k="name" value="${esc(tb.name)}" placeholder="${t('tname')}"><span class="rc">${tb.rows ? esc(t('rows')(tb.rows.length) + ' · ' + t('src').photo) : ''}</span><button class="x" data-rmt="${i}">✕</button></div>` +
    tb.columns.map((c, j) => `<div class="col"><input data-c="${j}" data-k="name" value="${esc(c.name)}" placeholder="${t('cname')}"><input data-c="${j}" data-k="type" value="${esc(c.type)}" placeholder="${t('ctype')}"><button class="x" data-rmc="${j}">✕</button></div>`).join('') +
    `<button class="ghost small" data-addc="${i}">${t('addC')}</button>` + preview(tb) + `</div>`).join('');
}
// v0.5.1: photo rows with any cell the two readers disagreed on highlighted for review
function preview(tb) { if (!tb.rows || !tb.rows.length) return ''; const fl = tb.flags || [], f = (r, c) => fl.find(x => x.r === r && x.c === c);
  const td = (v, r, c, tag) => { const x = f(r, c); return `<${tag}${x ? ` class="flag" title="${esc(x.why === 'updated' ? t('updTip')(x.alt) : t('flagTip')(x.alt, x.why))}"` : ''}>${esc(v ?? '')}</${tag}>`; };
  return `<details class="prev"${fl.length ? ' open' : ''}><summary class="rc">${t('preview')}${fl.length ? ' · ' + esc(t('flagN')(fl.length)) : ''}</summary><div class="pw"><table><tr>${tb.columns.map((c, j) => td(c.name, -1, j, 'th')).join('')}</tr>` +
    tb.rows.map((row, r) => '<tr>' + row.map((v, c) => td(v, r, c, 'td')).join('') + '</tr>').join('') + '</table></div></details>';
}
$('#tables').addEventListener('input', e => { const box = e.target.closest('.tbl'); if (!box) return; const tb = cur.tables[box.dataset.i];
  if (e.target.dataset.c !== undefined) tb.columns[e.target.dataset.c][e.target.dataset.k] = e.target.value; else tb.name = e.target.value; });
$('#tables').addEventListener('click', e => { const d = e.target.dataset, box = e.target.closest('.tbl');
  if (d.rmt !== undefined) cur.tables.splice(+d.rmt, 1); else if (d.rmc !== undefined) cur.tables[box.dataset.i].columns.splice(+d.rmc, 1);
  else if (d.addc !== undefined) cur.tables[+d.addc].columns.push({ name: '', type: '' }); else return; renderTables(); });
$('#addT').onclick = () => { cur.tables.push({ name: '', columns: [{ name: '', type: '' }] }); renderTables(); };
function addTables(list) { for (const tb of list) { const e = cur.tables.find(x => x.name.toLowerCase() === tb.name.toLowerCase());
  if (e) tb.columns.forEach(c => e.columns.some(x => x.name.toLowerCase() === c.name.toLowerCase()) || e.columns.push(c)); else cur.tables.push(tb); } renderTables(); }
// Images
const drop = $('#drop');
drop.onclick = () => $('#file').click(); $('#file').onchange = e => addFiles(e.target.files);
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); };
document.addEventListener('paste', e => { const f = [...e.clipboardData.files].filter(x => x.type.startsWith('image/')); if (f.length) addFiles(f); });
function addFiles(files) { [...files].filter(f => f.type.startsWith('image/')).forEach(f => { const r = new FileReader(); r.onload = async () => { const small = await TQResize.downscale(r.result); images.push(small);
  $('#thumbs').insertAdjacentHTML('beforeend', `<img src="${small}">`); $('#read').disabled = false; }; r.readAsDataURL(f); }); }
async function busy(btn, label, fn) { const old = btn.textContent; btn.disabled = true; btn.textContent = label; btn.classList.add('spin'); clearErr();
  try { await fn(); } catch (e) { showErr(e); } finally { btn.disabled = false; btn.textContent = old; btn.classList.remove('spin'); } }
$('#read').onclick = () => busy($('#read'), t('reading'), async () => { const r = await api('/api/read-image', { images }); addTables(r.tables); if (r.checkId) watchCheck(r.checkId, r.tables.map(x => x.name)); images = []; $('#thumbs').innerHTML = ''; $('#read').disabled = true; });
// v0.5.2 "Instant Read": the first reading is usable at once; Apple's cell check lands here when it finishes.
let checkState = '';
function renderCheck() { const e = $('#checkSt'); if (!e) return; e.textContent = checkState ? t(checkState) : ''; e.className = 'rc check ' + checkState; }
async function watchCheck(id, names) { checkState = 'checking'; renderCheck();
  for (let i = 0; i < 300; i++) { await new Promise(ok => setTimeout(ok, 600)); let j; try { j = await api('/api/check?id=' + encodeURIComponent(id)); } catch { break; }
    if (j.state === 'running') continue;
    if (j.state === 'done') { for (const nt of j.tables || []) { const k = cur.tables.findIndex(x => names.includes(x.name) && x.name.toLowerCase() === nt.name.toLowerCase()); if (k >= 0) cur.tables[k] = { ...cur.tables[k], columns: nt.columns, rows: nt.rows, flags: nt.flags }; }
      renderTables(); checkState = 'checked'; renderCheck(); setTimeout(() => { if (checkState === 'checked') { checkState = ''; renderCheck(); } }, 4000); return; }
    break; }
  checkState = 'checkFail'; renderCheck(); }
$('#manualBtn').onclick = () => $('#manual').classList.toggle('hidden');
$('#parse').onclick = async () => { const r = await api('/api/parse-schema', { text: $('#mtext').value }); addTables(r.tables); if (r.tables.length) $('#mtext').value = ''; };
// Schemas
$('#save').onclick = async () => { cur.name = $('#sname').value; const r = await api('/api/schemas', cur); cur.id = r.id; schemas = await api('/api/schemas'); renderSaved();
  const b = $('#save'); b.textContent = t('saved'); setTimeout(() => b.textContent = t('save'), 1400); };
$('#new').onclick = () => { cur = { id: null, name: '', tables: [] }; $('#sname').value = ''; renderSaved(); renderTables(); };
$('#saved').onchange = e => { const s = schemas.find(x => x.id === e.target.value); if (!s) return; cur = JSON.parse(JSON.stringify(s)); $('#sname').value = s.name; localStorage.last = s.id; renderTables(); };
// Query
$('#dialect').onchange = e => localStorage.dialect = e.target.value;
$('#go').onclick = () => busy($('#go'), t('writing'), async () => {
  const r = await api('/api/query', { tables: cur.tables, dialect: $('#dialect').value, request: $('#req').value, lang, fast: $('#fastOn').checked }); showQuery(r);
  if (r.test && !r.test.error) showResult(r.test); else if (r.test) showErr(r.test); });
let lastSql = { sql: '', dialect: '' }, lastResult = '';
function showQuery(r) { lastSql = { sql: r.sql, dialect: r.dialect }; $('#result').classList.add('hidden'); $('#fixbox').classList.add('hidden');
  $('#out').classList.remove('hidden'); $('#sql').textContent = r.sql; $('#expl').textContent = r.explanation;
  const c = r.check, lines = [];
  if (c.ok) lines.push(`<div class="ok">${t('ok')}</div>`);
  c.problems.forEach(p => { const [k, v] = p.split(/:(.*)/); const f = t(k); lines.push(`<div class="bad">${esc(typeof f === 'function' ? f(v) : f)}</div>`); });
  if (c.changesData) lines.push(`<div class="warn">${esc(t('writes'))}</div>`);
  c.warnings.forEach(p => lines.push(`<div class="warn">${esc(t('unknown')(p.split(/:(.*)/)[1]))}</div>`));
  if (c.explain && c.explain.ran) lines.push(c.explain.ok ? `<div class="ok">${t('explainOk')}</div>` : `<div class="bad">${esc(t('explainBad')(c.explain.error))}</div>`);
  const ms = (r.timing && r.timing.sql && r.timing.sql.ms) || 0; $('#timing').textContent = `${(ms / 1000).toFixed(2)} s · ${r.engine || 'qwen'}`;
  $('#check').innerHTML = lines.join(''); $('#out').scrollIntoView({ behavior: 'smooth' }); }
const runTest = regenerate => busy($('#test'), t('testing'), async () => {
  showResult(await api('/api/test', { tables: cur.tables, sql: lastSql.sql, dialect: lastSql.dialect, regenerate })); });
function showResult(r) {
  const num = v => typeof v === 'number';
  $('#grid').innerHTML = '<tr>' + r.columns.map(c => `<th>${esc(c)}</th>`).join('') + '</tr>' + r.rows.map(row => '<tr>' + row.map(v => `<td class="${num(v) ? 'n' : ''}">${v == null ? '<span class="rc">NULL</span>' : esc(num(v) && !Number.isInteger(v) ? v.toFixed(2) : v)}</td>`).join('') + '</tr>').join('');
  $('#rmeta').textContent = (r.write ? t('changed')(r.changed, r.table || '?') : t('meta')(r.total, r.rows.length, r.truncated)) + ' · ' + Object.entries(r.counts).map(([k, n]) => `${k}: ${n} (${t('src')[r.source[k]]})`).join(', ');
  $('#tnote').textContent = r.translated ? t('tnote')(r.via) : ''; lastResult = r.columns.join(' | ') + ' / ' + r.rows.slice(0, 5).map(x => x.join(' | ')).join(' / ');
  $('#result').classList.remove('hidden'); $('#fixbox').classList.remove('hidden'); }
$('#test').onclick = () => runTest(false); $('#regen').onclick = () => runTest(true);
$('#fastOn').checked = localStorage.fast === '1'; $('#fastOn').onchange = e => localStorage.fast = e.target.checked ? '1' : '';
$('#fixGo').onclick = () => busy($('#fixGo'), t('fixing'), async () => {
  const r = await api('/api/fix', { tables: cur.tables, dialect: lastSql.dialect, sql: lastSql.sql, request: $('#req').value, fix: $('#fix').value, lang, result: lastResult });
  showQuery(r); $('#fix').value = ''; await runTest(false); });
$('#copy').onclick = async () => { const s = $('#sql').textContent; try { await navigator.clipboard.writeText(s); } catch { const ta = document.createElement('textarea'); ta.value = s; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  $('#copy').textContent = t('copied'); setTimeout(() => $('#copy').textContent = t('copy'), 1400); };
// Settings
$('#gear').onclick = () => { $('#vm').value = st.settings.visionModel; $('#vf').value = st.settings.visionFallback; $('#sm').value = st.settings.sqlModel; $('#fm').value = st.settings.sqlFastModel || ''; $('#aid').checked = !!st.settings.aiSampleData; $('#eng').value = st.settings.sqlEngine || 'qwen'; $('#benchOut').textContent = ''; $('#dlg').showModal(); };
$('#dlgX').onclick = () => $('#dlg').close();
$('#dlgOk').onclick = async () => { st.settings = await api('/api/settings', { visionModel: $('#vm').value, visionFallback: $('#vf').value, sqlModel: $('#sm').value, sqlFastModel: $('#fm').value, aiSampleData: $('#aid').checked, sqlEngine: $('#eng').value }); $('#dlg').close(); };
$('#benchBtn').onclick = async () => { const o = $('#benchOut'), b = $('#benchBtn'); b.disabled = true; o.textContent = t('benching');
  try { const r = await api('/api/bench', {}); o.innerHTML = Object.entries(r).map(([e, x]) => `<div>${esc(x.rows.some(y => /unavailable|down|missing/.test(y.error || '')) && !x.ok ? t('benchNa')(e) : t('benchOk')(e, x.ok, x.total, (x.ms / 1000).toFixed(2)))}</div>`).join(''); }
  catch (e) { o.textContent = String(e.error || e.message || e); } finally { b.disabled = false; } };
$('#lang').onclick = () => { lang = lang === 'en' ? 'es' : 'en'; localStorage.lang = lang; applyLang(); if (st.version) $('#notes').textContent = ((lang === 'es' && st.version.notesEs) || st.version.notes).join(' '); };
(async () => { st = await api('/api/state'); schemas = await api('/api/schemas');
  $('#dialect').innerHTML = Object.entries(st.dialects).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); $('#dialect').value = localStorage.dialect || 'sqlserver';
  $('#ver').textContent = `TQueries ${st.version.number} · ${st.version.name}`; $('#notes').textContent = ((lang === 'es' && st.version.notesEs) || st.version.notes).join(' ');
  const last = schemas.find(s => s.id === localStorage.last); if (last) { cur = JSON.parse(JSON.stringify(last)); $('#sname').value = last.name; }
  applyLang(); setInterval(async () => { try { st.ollama = (await api('/api/state')).ollama; renderAi(); } catch {} }, 15000); })();

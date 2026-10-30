// TQueries v0.5 / v0.5.1: on-device macOS helper (Apple Vision + Foundation Models). Compiled once with swiftc, cached in app/native/bin.
// Everything runs locally; on other systems (or if the build fails) callers fall back to the Ollama models.
const fs = require('fs'), path = require('path'), os = require('os'), { spawn, execFile } = require('child_process');
const DIR = path.join(__dirname, '..', 'native'), SRC = path.join(DIR, 'tq-vision.swift'), BIN = path.join(DIR, 'bin', 'tq-vision');
const st = { bin: process.env.TQ_VISION_BIN || null, building: null, error: null, caps: null };
const exec = (cmd, args, ms) => new Promise(ok => execFile(cmd, args, { timeout: ms }, (e, out, err) => ok({ ok: !e, out: String(out || ''), err: String(err || e?.message || '') })));
function stale() { try { return fs.statSync(BIN).mtimeMs < fs.statSync(SRC).mtimeMs; } catch { return true; } }
async function ensure() { // → path to the helper, or null
  if (st.bin) return st.bin; if (process.platform !== 'darwin') return null; if (st.error) return null;
  if (!stale()) return (st.bin = BIN);
  return st.building || (st.building = (async () => { fs.mkdirSync(path.dirname(BIN), { recursive: true });
    const tmp = BIN + '.tmp', r = await exec('xcrun', ['swiftc', '-O', '-parse-as-library', SRC, '-o', tmp], 240000);
    if (r.ok && fs.existsSync(tmp)) { fs.renameSync(tmp, BIN); return (st.bin = BIN); }
    st.error = r.err.slice(0, 400); return null; })().finally(() => { st.building = null; }));
}
function run(args, input, ms = 30000) { return new Promise(async (ok, no) => { const bin = await ensure(); if (!bin) return no(new Error('native_unavailable'));
  const p = spawn(bin, args), out = [], err = []; const t = setTimeout(() => p.kill('SIGKILL'), ms);
  p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => err.push(d)); p.on('error', e => { clearTimeout(t); no(e); });
  p.on('close', code => { clearTimeout(t); let j = null; try { j = JSON.parse(Buffer.concat(out).toString().trim().split('\n').pop()); } catch {}
    if (code === 0 && j && !j.error) ok(j); else no(new Error((j && j.error) || Buffer.concat(err).toString().slice(0, 300) || 'native_failed')); });
  p.stdin.on('error', () => {}); if (input !== undefined) p.stdin.end(JSON.stringify(input)); else p.stdin.end(); }); }
// v0.5.1: one long-lived helper (--serve) keeps Vision and Apple's model loaded between pictures.
const srv = { p: null, n: 0, wait: new Map(), buf: '' };
function serve() { if (srv.p) return srv.p; const bin = st.bin; if (!bin) return null;
  const p = spawn(bin, ['--serve']); srv.p = p; p.stdin.on('error', () => {});
  p.stdout.on('data', d => { srv.buf += d; let i; while ((i = srv.buf.indexOf('\n')) >= 0) { const line = srv.buf.slice(0, i); srv.buf = srv.buf.slice(i + 1);
    let j; try { j = JSON.parse(line); } catch { continue; } const w = srv.wait.get(j.id); if (!w) continue; srv.wait.delete(j.id); clearTimeout(w.t);
    j.error ? w.no(new Error(j.error)) : w.ok(j.ok); } });
  const down = () => { if (srv.p !== p) return; srv.p = null; srv.buf = ''; for (const w of srv.wait.values()) { clearTimeout(w.t); w.no(new Error('native_failed')); } srv.wait.clear(); };
  p.on('close', down); p.on('error', down); return p; }
async function ask(args, input, ms = 60000) { const bin = await ensure(); if (!bin) throw new Error('native_unavailable');
  const p = serve(); if (!p) return run(args, input, ms);
  return new Promise((ok, no) => { const id = ++srv.n; const t = setTimeout(() => { srv.wait.delete(id); no(new Error('native_timeout')); }, ms);
    srv.wait.set(id, { ok, no, t }); p.stdin.write(JSON.stringify({ id, args, input }) + '\n'); }); }
const warm = () => ask(['--warm'], undefined, 60000);
// v0.5.1 "Clean Cells": Apple's model reads each table crop as CSV, cross-checked against Vision word positions.
async function readCells(imgs, log = () => {}) { const C = require('./cells'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-')); const t0 = Date.now(), out = [], timing = { words: 0, csv: 0 }; let fm = true;
  try { for (const [i, b] of imgs.entries()) { const f = path.join(dir, `img${i}.png`); fs.writeFileSync(f, Buffer.from(b, 'base64'));
      const w = await ask(['--words', f], undefined, 90000); timing.words += w.ms || 0; const pos = C.positionTables(w.words || []);
      let csv = []; if (fm && pos.length) try { const t = Date.now(); csv = (await ask(['--csv', f, ...pos.map(p => C.cropRect(p.box).join(','))], undefined, 120000)).csv || []; timing.csv += Date.now() - t; }
        catch (e) { fm = false; log('apple model csv unavailable: ' + e.message); }
      if (!pos.length && fm) try { const t = Date.now(); csv = (await ask(['--csv', f], undefined, 120000)).csv || []; timing.csv += Date.now() - t; out.push(...csv.flatMap(C.csvTables).map(x => ({ ...x, flags: [] }))); continue; } catch { fm = false; }
      out.push(...C.crossCheck(pos, csv)); } }
  finally { fs.rmSync(dir, { recursive: true, force: true }); } // our own temp copies only
  return { tables: out, ms: Date.now() - t0, timing, engine: fm ? 'apple-csv+vision' : 'vision-position' }; }
// v0.5.2 "Instant Read": Vision positions first (~0.1 s), Apple's CSV cross-check afterwards in the background.
async function readFast(imgs, log = () => {}) { const C = require('./cells'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-')), t0 = Date.now(), per = [];
  try { for (const [i, b] of imgs.entries()) { const f = path.join(dir, `img${i}.png`); fs.writeFileSync(f, Buffer.from(b, 'base64'));
      const w = await ask(['--words', f], undefined, 90000); per.push({ f, pos: C.positionTables(w.words || []) }); } }
  catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  const tables = per.flatMap(p => C.crossCheck(p.pos, [])), ms = Date.now() - t0;
  const check = (async () => { const t = Date.now(), out = []; let fm = true;
    try { for (const p of per) { let csv = [];
        if (fm && p.pos.length) try { csv = (await ask(['--csv', p.f, ...p.pos.map(x => C.cropRect(x.box).join(','))], undefined, 120000)).csv || []; } catch (e) { fm = false; log('apple model csv unavailable: ' + e.message); }
        out.push(...C.crossCheck(p.pos, csv)); } }
    finally { fs.rmSync(dir, { recursive: true, force: true }); } // our own temp copies only
    return { tables: out, ms: Date.now() - t, engine: fm ? 'apple-csv+vision' : 'vision-position' }; })();
  return { tables, ms, check, engine: 'vision-position' }; }
async function caps() { if (st.caps) return st.caps; try { return (st.caps = await run(['--check'], undefined, 10000)); } catch { return { documents: false, fm: false }; } }
// images: base64 strings → {tables, ms, engine}
async function readImages(imgs) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-')); try {
  const files = imgs.map((b, i) => { const f = path.join(dir, `img${i}.png`); fs.writeFileSync(f, Buffer.from(b, 'base64')); return f; });
  return await run(files); } finally { fs.rmSync(dir, { recursive: true, force: true }); } } // our own temp copies only
const tidy = tables => run(['--fm'], { tables }, 20000);
const sql = (schema, dialect, question) => run(['--sql'], { schema, dialect, question }, 30000);
module.exports = { ask, warm, readCells, readFast, ensure, run, caps, readImages, tidy, sql, state: st, BIN, SRC };

// v0.5 benchmark: node test/bench.js [pattern apple qwen] — 12 standard questions, time + correctness on the practice copy.
process.env.TQ_QUIET = '1';
const engines = process.argv.slice(2).length ? process.argv.slice(2) : ['pattern', 'apple', 'qwen'];
(async () => { const b = await require('../app/server').runBench(engines);
  for (const [e, r] of Object.entries(b)) { console.log(`\n${e}: ${r.ok}/${r.total} correct, ${(r.ms / 1000).toFixed(2)} s total`);
    for (const x of r.rows) console.log(`  ${x.ok ? '✓' : '✕'} ${x.ms != null ? (x.ms / 1000).toFixed(3) + ' s' : '   -   '}  ${x.q}${x.error ? '  [' + x.error + ']' : ''}${!x.ok && x.engine && x.engine !== e ? '  [answered by ' + x.engine + ']' : ''}`); }
  process.exit(0); })();

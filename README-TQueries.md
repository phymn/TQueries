# TQueries v0.1 "First Query" (dev)
On-device SQL report helper. Drop table screenshots → editable schema → pick dialect → describe the report (ES/EN) → SQL + explanation + Copy.
Setup once: install Node.js (LTS) and Ollama (ollama.com), then: `ollama pull qwen2.5vl` (fallback `ollama pull llava`) and `ollama pull qwen2.5-coder`.
Start: double-click "Start TQueries.command" (Mac) or "Start TQueries.bat" (Windows). Runs at http://127.0.0.1:4321. Data: ~/TQueries/data (Mac).
Tests: `node test/run.js`

## v0.2 · Test Drive
- **Test query / Probar consulta:** runs your query on a practice SQLite copy rebuilt from your photos (never your real database). Uses data rows seen in the photo; otherwise realistic sample rows from the local model (fallback: built-in generator), with matching keys across tables. Cached per schema in `data/samples/`; **New sample data** regenerates.
- Other dialects are translated to SQLite for the test only (your query stays as written). Only SELECT/WITH runs; 200 rows shown max, 5 s limit.
- **What to fix? / ¿Qué corregir?** rewrites the query in the same dialect and tests again.
- Bundles sql.js 1.13.0 (MIT, WebAssembly; license in `app/vendor/sql.js/`). Works on any Node version.

## v0.2.1 · Quick & Exact
- **Faster:** screenshots shrink to 1280 px max before reading; short vision prompt, JSON mode, max 20 rows per table; models stay loaded (`keep_alive` 30m); temperature 0 and capped output. Sample data now comes from your photo rows or the built-in generator (instant); AI sample data is an option in ⚙︎.
- **More exact:** the SQL prompt includes your photo rows and detected joins, and asks for only the columns you want, no TOP/LIMIT unless asked. Joins are detected even when names differ (DEP_ID = DEPT_ID_DEP) by name and matching values. Wrapped headers (EMP_ + ID) are joined.
- **One step:** Write the query also runs the test and shows the result.
- **Fast mode:** set a "Fast SQL model" in ⚙︎ (e.g. `ollama pull qwen2.5-coder:7b`) and tick Fast mode. On 24 GB, qwen3-coder (18 GB) + qwen2.5vl (6 GB) may not both stay loaded, so Ollama swaps them; the 7B coder avoids that.
- **Timings:** the Terminal window logs ms per step (vision, sql, model load, test).
- **Bench:** `cd ~/TQueries && node test/bench-mac.js` (add `--fast`, or `SQL_MODEL=qwen2.5-coder:7b node test/bench-mac.js`).

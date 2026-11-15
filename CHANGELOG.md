# Changelog: TQueries

Version names and notes come from the `VERSION` object in each saved version (`Versions/vX`). Exact dates before publishing were not recorded; the order is certain.

## 2026-11-15 — API study guide
- Added `docs/API-GUIDE.md`: every significant API this project calls, where it is used, what it does here, why it was chosen, plus a beginner glossary. Meant as a study guide (one API a day).

## 2026-11-14 — Documentation pass (no version bump)
- Doc comments on every named function in `app/` and `test/`. Comments only. Every documented function/type got a comment saying what it does and why it calls each API. Proven behavior-identical: JavaScript token streams (comments excluded) are byte-equal to the previous version; Python ASTs are equal; Swift text is equal after stripping comments/whitespace.
- Added `CHANGELOG.md` and `docs/DECISIONS.md`.
- Tests re-run after the pass: patterns 12/12, joins 9/9, multitable 7/7 (same as before; cells/instant skip because their screenshot fixtures are intentionally not in this public repo).

## v0.5.4 "Gemma" — published 2026-10-30 (`d4d69fc`)
- Gemma 4 E4B (`gemma4:e4b`) writes the SQL (12/12 on the standard set, loads faster, about a third of the size); other models stay selectable in Settings. SQL is read from any code block.
## v0.5.3 "Swift Coder"
- Release note: "Faster SQL on your Mac."
## v0.5.2 "Instant Read"
- Release note: "Your photo, read instantly."
## v0.5.1 "Clean Cells"
- Release note: "Every cell in its place." (code: OCR word positions are cross-checked with the model's reading and disagreements flagged, see `app/lib/cells.js`).
## v0.5 "Instant"
- Release note: "Picture to query in an instant." (code: pattern-based SQL for common requests, see `app/lib/patterns.js`).
## v0.4.1 "Any Value"
- Format examples like "January 9, 1976" are understood and never flagged. Ollama starts by itself when closed.
## v0.4 "Any Value"
- Compute anything from any column: text, dates, ages at any date, stats, conditions.
## v0.3.3 "Age Math"
- Age and date math works in every dialect.
## v0.3.2 "Warm Start"
- The SQL model loads when the app opens and leaves GPU headroom.
## v0.3.1 "Any Operation"
- Typed values on the wrong column are fixed instantly; photo numbers compare as numbers.
## v0.3 "Any Operation"
- Any SQL (read, insert, update, delete, functions); changes run on a practice copy; typed values verified.
## v0.2.3 "Exact Input"
- Every typed value is verified in the query; swapped values are rewritten.
## v0.2.2 "Quick & Exact"
- Reads every table in a screenshot and names unnamed ones.
## v0.2.1 "Quick & Exact"
- Faster reads (smaller images, models kept loaded); answers use photo rows; result shown right away.
## v0.2 "Test Drive"
- Test query on a practice SQLite copy rebuilt from the photos, with a fix-and-retest box. Bundles sql.js 1.13.0 (MIT).
## v0.1.2 "First Query"
- Example name changed to 84logic; screenshot reading fix.
## v0.1.1 "First Query"
- Reads screenshots when the model answers with a plain list of tables.
## v0.1 "First Query"
- Screenshots to schema, 6 SQL dialects, ES/EN, on-device AI.

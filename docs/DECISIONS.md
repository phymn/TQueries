# Decisions: TQueries

| Date | Decision | Why |
|---|---|---|
| v0.1 (date not recorded) | All AI runs locally (Ollama on 127.0.0.1, later Apple Vision/Foundation Models on the Mac). The server listens on 127.0.0.1 only. | Schemas and data never leave the machine. |
| v0.1.2 | Example company name is 84logic. | No real customer names in examples. |
| v0.2 | Queries are tested on a practice SQLite copy rebuilt from the photos, never the real database. Other dialects are translated to SQLite only for the test; the user's query stays as written. | Safe testing. |
| v0.2 | Bundle sql.js (MIT) instead of a native SQLite module. | Works on any Node version, no build step. |
| v0.3 | Allow write statements (insert/update/delete) only against the practice copy, with row and time limits. | Users need any SQL, but nothing real may change. |
| v0.5–v0.5.3 | Use Apple on-device engines on macOS (Vision OCR, document reader, Foundation Models) with a persistent Swift helper. | Faster and lighter than a large vision model; uses the Neural Engine. |
| v0.5.4 (2026-10-30) | Default SQL model `gemma4:e4b`. | 12/12 on the standard benchmark, faster load, a third of the size. |
| 2026-10-30 | Public repo excludes the screenshot test fixtures (`employee_departments.*`); the tests that need them skip. | Privacy check before publishing. |
| Open | Windows build pending; Mac runs v0.5.4. | Not done yet. |

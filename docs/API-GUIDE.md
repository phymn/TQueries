# TQueries v0.5.4 — API guide

Every significant API the app uses, where it is called, why it was picked, and what leaves the machine.

TQueries is a **local** web app: a Node server on `127.0.0.1` reads table screenshots, writes SQL with a local model, and runs it on a practice SQLite copy. Screenshots and prompts are not uploaded to a public cloud API. Employee screenshot fixtures are intentionally not in this public repo.

How to study: one row a day, starting with the local web server, then Ollama, then Apple Vision / Foundation Models.

Related: [DECISIONS.md](DECISIONS.md) · [CHANGELOG.md](../CHANGELOG.md) · [README.md](../README.md).

Status words: **Verified in code** = read from the files named below.

## Local server, models and SQL

| API | Where it is called (file → function) | What it does in this app | Why this one was chosen | Notes |
|---|---|---|---|---|
| **`node:http` `createServer`** | `app/server.js` (listens at startup) | Serves the UI and JSON routes only on `127.0.0.1` (not on the public network). | Built into Node, little code. Rejected: a hosted web app (screenshots would leave the Mac). | Local. Default port is printed at startup. |
| **Ollama HTTP API** (`/api/version`, `/api/tags`, `/api/generate`) | `app/server.js` → `ollamaUp()`, `ensureOllama()`, `ollamaTags()`, generate helper | Talks to the local Ollama server (default `http://127.0.0.1:11434`) so a local model can write SQL (default `gemma4:e4b`) and, when native Vision is off or unavailable, read screenshots (`qwen2.5vl`, with `llava` as fallback). | Models stay on the machine; no cloud API key. Other SQL models remain selectable in Settings. Rejected: a hosted LLM API as the default (prompts would leave the Mac). | Localhost only. If Ollama is down, `ensureOllama()` may start it. |
| **`child_process` `spawn` / `execFile`** | `app/server.js` → `startOllamaProcess()`; `app/lib/native.js` → `exec`, `ensure()`, `run()`, `serve()` | Starts Ollama when needed, compiles/runs the Swift helper `tq-vision`, and talks to it with stdin/stdout (or a long-running `--serve` process). Uses argument lists, not a shell string. | Built-in way to run local programs. | Local Mac/Windows helpers only. |
| **`fetch` + `AbortSignal.timeout`** | `app/server.js` → `ollamaUp()`, `ollamaTags()`, generate | Calls Ollama with a short timeout so a hung local server does not stall the UI forever. | Built-in HTTP; `AbortSignal` cancels the wait. | Localhost. |
| **sql.js** (SQLite compiled to **WebAssembly**) | `app/lib/testdb.js` (worker loads `vendor/sql.js/sql-wasm.js`, then `new SQL.Database()`) | Builds a practice database from the schema/rows read from the photos and runs the generated SQL there. Never connects to a real company database. | Real SQLite locally, no native SQLite build, MIT licensed (bundled 1.13.0). Rejected: pointing the app at a live database. | Local. Capped rows and a timeout protect the UI. |
| **Node `worker_threads`** | `app/lib/testdb.js` | Runs that SQLite work off the main Node thread so a slow query cannot freeze the server. | Same idea as a browser Web Worker, but on the server. | Local. |

## Reading the screenshot (Mac)

| API | Where it is called | What it does in this app | Why this one was chosen | Notes |
|---|---|---|---|---|
| **Apple Vision** `VNRecognizeTextRequest` | `app/native/tq-vision.swift` → `readText()`, `readWords()`, warm path in `handle()` | On-device OCR of the screenshot, including word boxes, so cells can be checked by position. Uses `.accurate` recognition. | Apple's on-device OCR; can use the Neural Engine when it helps. No cloud OCR. Rejected: sending the image to a hosted OCR API. | macOS helper, compiled from `tq-vision.swift`. |
| **Foundation Models** `SystemLanguageModel` / `LanguageModelSession` | `tq-vision.swift` → `fmCSV()`, `fmWarm()`, `fmAvailable()`, SQL helper | On-device, Apple's model turns table images into CSV and can draft SQL. `fmWarm()` / `prewarm()` loads it when the app opens so the first photo is already fast. Guarded by `#if canImport(FoundationModels)` and macOS 26+. | Private, on-device, no API key. Instructions tell it not to invent data. If it is unavailable, Ollama vision/SQL fills in. | Local. Availability is reported to the UI. |
| **Core Image / ImageIO** (`CGImage`, `CGImageSource…`) | `tq-vision.swift` → `readWords()`, `fmCSV()`, `handle()` | Loads screenshot pixels for Vision and Foundation Models. | Built-in image loading on Apple platforms. | Local. |
| **`JSONEncoder` / `FileHandle`** | `tq-vision.swift` → `emit()`, `readStdin()`, `toJSON()` | The helper speaks JSON on stdin/stdout to the Node server. | Simple, no extra RPC library. | Local. |
| **`FileReader`** | `app/public/app.js` → `addFiles()` | Reads a user-chosen image file in the browser, locally. | Built-in; the file is not uploaded anywhere except to the local Node server. | Local. Also accepts images pasted from the clipboard. |
| **Canvas 2D** `drawImage` / `toDataURL` | `app/public/resize.js` → `downscale()` | Shrinks a large photo before it is sent to the local server, so reads stay fast. | Built-in, no extra image library in the page. | Local. |

## UI helpers

| API | Where | What it does | Why | Notes |
|---|---|---|---|---|
| **Clipboard API** `navigator.clipboard.writeText` | `app/public/app.js` → `showResult()` | Copies the SQL or result for the user. Falls back to a temporary `<textarea>` if the Clipboard API is blocked. | Built-in. | May need a user gesture / permission in some browsers. |
| **`localStorage`** | `app/public/app.js` | Remembers language, dialect, last table set and the "fast" switch. | Small settings only; table photos are not stored there. | Local. |

## Glossary

- **API**: a set of functions a framework or service offers to your code.
- **Localhost / `127.0.0.1`**: this computer only; other machines on the internet cannot open that address.
- **Ollama**: a local app that serves language models over HTTP on your computer (port 11434 by default).
- **sql.js**: SQLite compiled to WebAssembly, so the practice database runs without installing SQLite.
- **Practice copy**: a temporary SQLite database built from the photo, used so test queries cannot touch a real system.
- **Vision / OCR**: Apple's on-device text recognition; it returns words and their positions on the image.
- **Foundation Models**: Apple's on-device language-model framework (used here for CSV from a table image, and optionally SQL).
- **Neural Engine**: Apple's dedicated chip for machine-learning work; Vision may use it.
- **Dialect**: a SQL flavor (SQLite, SQL Server, PostgreSQL, and others) the app can write.
- **`child_process`**: Node's way to run another program on the same machine.
- **`AbortSignal`**: a handle that cancels a `fetch` when it takes too long.

// TQueries v0.5.1 "Clean Cells" — on-device helper (macOS). Built by the app on first launch:
//   xcrun swiftc -O -parse-as-library tq-vision.swift -o bin/tq-vision
// Modes (all output one JSON object on stdout, errors as {"error": "..."} with exit code 1):
//   tq-vision <image>...           tables from photos/screenshots  → {"tables":[{"title"?,"columns":[..],"rows":[[..]]}],"ms":N,"engine":"documents|text"}
//   tq-vision --fm                 stdin JSON {"tables":[...]} → same tables with tidied names (Apple Foundation Models), or unchanged if unavailable
//   tq-vision --sql                stdin JSON {"schema":"...","dialect":"...","question":"..."} → {"sql":"...","ms":N}
//   tq-vision --words <image>       word boxes (Vision, top-left origin, 0..1) → {"words":[{t,x0,x1,y0,y1}],"w":W,"h":H}
//   tq-vision --csv <image> [x,y,w,h]...  Apple Foundation Model reads each crop (0..1 rect) → {"csv":["..."],"ms":N}
//   tq-vision --serve              persistent: one JSON request per stdin line {"id","args":[..],"input"?} → one JSON line each (keeps models warm)
//   tq-vision --check              {"documents":bool,"fm":bool}
import Foundation
import Vision
import CoreImage
import ImageIO
#if canImport(FoundationModels)
import FoundationModels
#endif

struct Table: Codable { var title: String?; var columns: [String]; var rows: [[String]] }
struct Out: Codable { var tables: [Table]; var ms: Int; var engine: String }

func emit<T: Encodable>(_ v: T) { let e = JSONEncoder(); if let d = try? e.encode(v), let s = String(data: d, encoding: .utf8) { print(s) } }
func fail(_ msg: String) -> Never { emit(["error": msg]); exit(1) }
func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }
func clean(_ s: String) -> String { s.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines) }

// A grid of cell strings → Table (first non-empty row = header).
func toTable(_ grid: [[String]], title: String? = nil) -> Table? {
  let g = grid.map { $0.map(clean) }.filter { $0.contains { !$0.isEmpty } }
  guard let head = g.first, head.count >= 1, g.count >= 1 else { return nil }
  let n = g.map { $0.count }.max() ?? head.count
  let pad = { (r: [String]) in r + Array(repeating: "", count: max(0, n - r.count)) }
  let cols = pad(head).enumerated().map { $0.element.isEmpty ? "COL\($0.offset + 1)" : $0.element }
  return Table(title: title, columns: cols, rows: g.dropFirst().map(pad))
}

// macOS 26+: Vision reads document structure (tables) directly.
func readDocuments(_ url: URL) async throws -> [Table]? {
  #if compiler(>=6.2)
  if #available(macOS 26.0, *) {
    let obs = try await RecognizeDocumentsRequest().perform(on: url)
    var out: [Table] = []
    for o in obs { for t in o.document.tables {
      let grid = t.rows.map { row in row.map { $0.content.text.transcript } }
      if let tb = toTable(grid) { out.append(tb) } } }
    return out.isEmpty ? nil : out
  }
  #endif
  return nil
}

// Fallback (any macOS): recognise text lines, then cluster boxes into rows (by y) and columns (by x).
struct Word { let text: String; let x0: Double; let x1: Double; let y: Double; let h: Double }
func readText(_ url: URL) throws -> [Table] {
  let req = VNRecognizeTextRequest(); req.recognitionLevel = .accurate; req.usesLanguageCorrection = false
  try VNImageRequestHandler(url: url, options: [:]).perform([req])
  let words: [Word] = (req.results ?? []).compactMap { o in
    guard let s = o.topCandidates(1).first?.string, !clean(s).isEmpty else { return nil }
    let b = o.boundingBox; return Word(text: s, x0: Double(b.minX), x1: Double(b.maxX), y: Double(1 - b.midY), h: Double(b.height)) }
  guard !words.isEmpty else { return [] }
  // rows: sort top→bottom, join when centres are within half a line height
  var rows: [[Word]] = []
  for w in words.sorted(by: { $0.y < $1.y }) {
    if let last = rows.last, let r = last.first, abs(r.y - w.y) < max(r.h, w.h) * 0.5 { rows[rows.count - 1].append(w) } else { rows.append([w]) } }
  rows = rows.map { $0.sorted { $0.x0 < $1.x0 } }
  // columns: anchor on the widest row (usually the header), assign each word to the nearest anchor by x overlap/centre
  guard let anchor = rows.max(by: { $0.count < $1.count }), anchor.count >= 2 else { return [toTable(rows.map { $0.map { $0.text } })].compactMap { $0 } }
  let centres = anchor.map { ($0.x0 + $0.x1) / 2 }
  // a short title line above the table (one word group, before the header) becomes the table name
  var title: String? = nil
  if let first = rows.first, first.count == 1, rows.count > 2, rows[1].count >= 2 { title = clean(first[0].text); rows.removeFirst() }
  let grid: [[String]] = rows.map { r in
    var cells = Array(repeating: "", count: centres.count)
    for w in r { let c = (w.x0 + w.x1) / 2; let i = centres.indices.min(by: { abs(centres[$0] - c) < abs(centres[$1] - c) })!
      cells[i] = cells[i].isEmpty ? w.text : cells[i] + " " + w.text }
    return cells }
  return [toTable(grid, title: title)].compactMap { $0 }
}


struct WordBox: Codable { var t: String; var x0: Double; var x1: Double; var y0: Double; var y1: Double }
struct WordsOut: Codable { var words: [WordBox]; var w: Int; var h: Int; var ms: Int }
func readWords(_ url: URL) throws -> WordsOut {
  let t0 = nowMs()
  let req = VNRecognizeTextRequest(); req.recognitionLevel = .accurate; req.usesLanguageCorrection = false
  try VNImageRequestHandler(url: url, options: [:]).perform([req])
  var out: [WordBox] = []
  for o in req.results ?? [] { guard let c = o.topCandidates(1).first else { continue }
    let s = c.string; var i = s.startIndex
    while i < s.endIndex { // split on spaces, keep per-word boxes
      while i < s.endIndex && s[i] == " " { i = s.index(after: i) }
      var j = i; while j < s.endIndex && s[j] != " " { j = s.index(after: j) }
      if i < j { let b = (try? c.boundingBox(for: i..<j))?.boundingBox ?? o.boundingBox
        out.append(WordBox(t: String(s[i..<j]), x0: Double(b.minX), x1: Double(b.maxX), y0: Double(1 - b.maxY), y1: Double(1 - b.minY))) }
      i = j } }
  var w = 0, h = 0
  if let src = CGImageSourceCreateWithURL(url as CFURL, nil), let p = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] {
    w = p[kCGImagePropertyPixelWidth] as? Int ?? 0; h = p[kCGImagePropertyPixelHeight] as? Int ?? 0 }
  return WordsOut(words: out, w: w, h: h, ms: Int(nowMs() - t0))
}
let CSV_RULES = "Convert the table in this image to CSV. Rules: fields separated by commas; first line is the header row; then exactly one line per table row; every cell is its own field; a header or cell whose text wraps onto two lines is ONE field (join with a space); wrap any field containing a comma in double quotes; copy every character exactly, digit by digit; never guess, never add rows or columns. Output only the CSV."
func fmCSV(_ url: URL, _ rects: [[Double]]) async throws -> [String] {
  #if canImport(FoundationModels)
  if #available(macOS 27.0, *) {
    guard case .available = SystemLanguageModel.default.availability else { throw NSError(domain: "fm_unavailable", code: 1) }
    guard let full = CIImage(contentsOf: url) else { throw NSError(domain: "bad_image", code: 1) }
    let E = full.extent; var res: [String] = []
    for r in (rects.isEmpty ? [[0, 0, 1, 1]] : rects) {
      // rect is top-left origin 0..1; CoreImage is bottom-left; upscale small crops so digits are crisp
      let cr = CGRect(x: E.minX + r[0] * E.width, y: E.minY + (1 - r[1] - r[3]) * E.height, width: r[2] * E.width, height: r[3] * E.height).integral.intersection(E)
      var img = full.cropped(to: cr).transformed(by: CGAffineTransform(translationX: -cr.minX, y: -cr.minY))
      let k = min(2.0, 1400.0 / max(cr.width, 1)); if k > 1.05 { img = img.transformed(by: CGAffineTransform(scaleX: k, y: k)) }
      guard let cg = CIContext().createCGImage(img, from: img.extent) else { continue }
      let s = LanguageModelSession(instructions: "You transcribe table images into CSV exactly. You never invent or change data.")
      let out = try await s.respond(options: GenerationOptions(temperature: 0)) { CSV_RULES; Attachment(cg) }
      res.append(stripFence(out.content)) }
    return res
  }
  #endif
  throw NSError(domain: "fm_image_unavailable", code: 1)
}
func fmWarm() {
  #if canImport(FoundationModels)
  if #available(macOS 26.0, *) { if case .available = SystemLanguageModel.default.availability { LanguageModelSession().prewarm() } }
  #endif
}
func toJSON(_ v: Any) -> String { (try? JSONSerialization.data(withJSONObject: v)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}" }
func enc<T: Encodable>(_ v: T) -> Any { (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(v))) ?? [:] }

func readStdin() -> [String: Any] {
  let d = FileHandle.standardInput.readDataToEndOfFile()
  return ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
}

func fmAvailable() -> Bool {
  #if canImport(FoundationModels)
  if #available(macOS 26.0, *) { if case .available = SystemLanguageModel.default.availability { return true } }
  #endif
  return false
}

func askFM(_ instructions: String, _ prompt: String) async throws -> String? {
  #if canImport(FoundationModels)
  if #available(macOS 26.0, *) {
    guard case .available = SystemLanguageModel.default.availability else { return nil }
    let session = LanguageModelSession(instructions: instructions)
    return try await session.respond(to: prompt, options: GenerationOptions(temperature: 0)).content
  }
  #endif
  return nil
}

func stripFence(_ s: String) -> String {
  var t = s.trimmingCharacters(in: .whitespacesAndNewlines)
  if t.hasPrefix("```") { t = t.components(separatedBy: "\n").dropFirst().joined(separator: "\n"); if let r = t.range(of: "```", options: .backwards) { t = String(t[..<r.lowerBound]) } }
  return t.trimmingCharacters(in: .whitespacesAndNewlines)
}

// One request → JSON-able result (throws on error). Shared by one-shot and --serve.
func handle(_ args: [String], _ inp: [String: Any]) async throws -> Any {
  let t0 = nowMs()
  switch args.first {
  case "--check":
    var docs = false, img = false
    #if compiler(>=6.2)
    if #available(macOS 26.0, *) { docs = true }
    #endif
    if #available(macOS 27.0, *) { img = fmAvailable() }
    return ["documents": docs, "fm": fmAvailable(), "fmImage": img]
  case "--warm":
    fmWarm()
    let tiny = CIImage(color: .white).cropped(to: CGRect(x: 0, y: 0, width: 64, height: 32))
    if let cg = CIContext().createCGImage(tiny, from: tiny.extent) { let r = VNRecognizeTextRequest(); try? VNImageRequestHandler(cgImage: cg).perform([r]) }
    return ["ok": true, "ms": Int(nowMs() - t0)]
  case "--words":
    guard args.count > 1 else { throw NSError(domain: "no image", code: 1) }
    return enc(try readWords(URL(fileURLWithPath: args[1])))
  case "--csv":
    guard args.count > 1 else { throw NSError(domain: "no image", code: 1) }
    let rects = args.dropFirst(2).map { $0.split(separator: ",").compactMap { Double($0) } }.filter { $0.count == 4 }
    let csv = try await fmCSV(URL(fileURLWithPath: args[1]), rects)
    return ["csv": csv, "ms": Int(nowMs() - t0)]
  case "--fm": // tidy table/column names; never changes cell values
    guard let tables = inp["tables"] else { throw NSError(domain: "no tables", code: 1) }
    let json = toJSON(tables)
    if let r = try await askFM("You fix OCR mistakes in database table and column names. Reply with JSON only: the same array, same order and counts. Names: UPPER_SNAKE_CASE, no spaces. Never change row values.", json),
       let d = stripFence(r).data(using: .utf8), let fixed = try? JSONSerialization.jsonObject(with: d) as? [Any] { return ["tables": fixed, "ms": Int(nowMs() - t0), "fm": true] }
    return ["tables": tables, "ms": Int(nowMs() - t0), "fm": false]
  case "--sql":
    let schema = inp["schema"] as? String ?? "", dialect = inp["dialect"] as? String ?? "SQL", q = inp["question"] as? String ?? ""
    guard !q.isEmpty else { throw NSError(domain: "no question", code: 1) }
    guard let r = try await askFM("You write one \(dialect) query. Use only the tables and columns given. Reply with the SQL only, no explanation, no code fence.", "Schema:\n\(schema)\n\nQuestion: \(q)") else { throw NSError(domain: "fm_unavailable", code: 1) }
    return ["sql": stripFence(r), "ms": String(Int(nowMs() - t0))]
  default:
    guard !args.isEmpty else { throw NSError(domain: "usage: tq-vision <image>... | --words | --csv | --serve | --fm | --sql | --check", code: 1) }
    var tables: [Table] = [], engine = "documents"
    for a in args { let url = URL(fileURLWithPath: a)
      if let d = try await readDocuments(url) { tables += d } else { engine = "text"; tables += try readText(url) } }
    return enc(Out(tables: tables, ms: Int(nowMs() - t0), engine: engine))
  }
}
func errText(_ e: Error) -> String { let n = e as NSError; return n.domain == NSCocoaErrorDomain ? String(describing: e) : (n.code == 1 ? n.domain : String(describing: e)) }

@main struct TQVision {
  static func main() async {
    let args = Array(CommandLine.arguments.dropFirst())
    if args.first == "--serve" {
      setvbuf(stdout, nil, _IOLBF, 0)
      while let line = readLine() {
        guard let d = line.data(using: .utf8), let req = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { continue }
        let id = req["id"] ?? 0, a = req["args"] as? [String] ?? [], inp = req["input"] as? [String: Any] ?? [:]
        do { print(toJSON(["id": id, "ok": try await handle(a, inp)])) } catch { print(toJSON(["id": id, "error": errText(error)])) }
      }
      return }
    do { print(toJSON(try await handle(args, args.first == "--fm" || args.first == "--sql" ? readStdin() : [:]))) }
    catch { fail(errText(error)) }
  }
}

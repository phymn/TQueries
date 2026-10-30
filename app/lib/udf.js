// Practice-copy helpers: SQL Server / MySQL / PostgreSQL / Oracle / Access functions emulated on SQLite (sql.js).
// Fixed arity per name (sql.js registers by fn.length); variants are renamed by translate() in testdb.js.
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n, w = 2) => String(n).padStart(w, '0');
const nowWall = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4); }; // local wall clock in UTC fields
function D(v) {
  if (v == null || v === '') return null; if (v instanceof Date) return v;
  if (typeof v === 'number') { const s = String(v); return /^\d{8}$/.test(s) ? D(s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6)) : null; }
  let s = String(v).trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  if ((m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/))) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3]));
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return new Date(Date.UTC(+m[3], m[1] - 1, +m[2]));
  if (/^\d{8}$/.test(s)) return D(+s);
  const t = new Date(s); return isNaN(t) ? null : new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()));
}
const hasTime = v => typeof v === 'string' && /\d[ T]\d{1,2}:\d{2}/.test(v);
const iso = d => d ? d.toISOString().slice(0, 10) : null;
const isoT = d => d ? d.toISOString().slice(0, 19).replace('T', ' ') : null;
const out = (d, v) => hasTime(v) ? isoT(d) : iso(d);
const P = p => { p = String(p ?? '').toLowerCase().replace(/^'|'$/g, '').trim();
  return ({ yyyy: 'y', yy: 'y', year: 'y', years: 'y', y: 'y', q: 'q', qq: 'q', quarter: 'q', quarters: 'q', m: 'm', mm: 'm', month: 'm', months: 'm', mon: 'm',
    d: 'd', dd: 'd', day: 'd', days: 'd', w: 'w', wk: 'w', ww: 'w', week: 'w', weeks: 'w', iso_week: 'w', isowk: 'w', dw: 'dw', weekday: 'dw', dow: 'dow', isodow: 'isodow',
    dy: 'doy', doy: 'doy', dayofyear: 'doy', h: 'h', hh: 'h', hour: 'h', hours: 'h', hh24: 'h', mi: 'mi', n: 'mi', minute: 'mi', minutes: 'mi', ss: 's', s: 's', second: 's', seconds: 's', epoch: 'epoch' })[p] || p; };
const ageP = 'age:', isAge = v => typeof v === 'string' && v.startsWith(ageP), ageParts = v => v.slice(ageP.length).split(':').map(Number);
const dayNum = d => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 864e5);
const doy = d => dayNum(d) - Math.floor(Date.UTC(d.getUTCFullYear(), 0, 1) / 864e5) + 1;
function part(p, v) { p = P(p); if (isAge(v)) { const [Y, M, Dd] = ageParts(v); return p === 'y' ? Y : p === 'm' ? M : p === 'd' ? Dd : null; }
  const d = D(v); if (!d) return null;
  switch (p) { case 'y': return d.getUTCFullYear(); case 'q': return Math.floor(d.getUTCMonth() / 3) + 1; case 'm': return d.getUTCMonth() + 1; case 'd': return d.getUTCDate();
    case 'w': return Math.floor((doy(d) - 1 + new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).getUTCDay()) / 7) + 1; case 'dw': return d.getUTCDay() + 1; case 'dow': return d.getUTCDay();
    case 'isodow': return d.getUTCDay() || 7; case 'doy': return doy(d); case 'h': return d.getUTCHours(); case 'mi': return d.getUTCMinutes(); case 's': return d.getUTCSeconds(); case 'epoch': return d.getTime() / 1000; }
  return null; }
function add(p, n, v) { const d = D(v); if (!d || n == null) return null; p = P(p); n = Number(n);
  const addM = k => { const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); };
  if (p === 'y') addM(12 * n); else if (p === 'q') addM(3 * n); else if (p === 'm') addM(n); else if (p === 'w') d.setUTCDate(d.getUTCDate() + 7 * n);
  else if (p === 'h') d.setTime(d.getTime() + n * 36e5); else if (p === 'mi') d.setTime(d.getTime() + n * 6e4); else if (p === 's') d.setTime(d.getTime() + n * 1e3); else d.setUTCDate(d.getUTCDate() + n);
  return /^(h|mi|s)$/.test(p) ? isoT(d) : out(d, v); }
function diff(p, a, b) { const x = D(a), y = D(b); if (!x || !y) return null; p = P(p); // SQL Server: boundaries crossed
  const months = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
  if (p === 'y') return y.getUTCFullYear() - x.getUTCFullYear(); if (p === 'q') return Math.floor((y.getUTCFullYear() * 12 + y.getUTCMonth()) / 3) - Math.floor((x.getUTCFullYear() * 12 + x.getUTCMonth()) / 3);
  if (p === 'm') return months; if (p === 'w') return Math.floor((dayNum(y) + 4) / 7) - Math.floor((dayNum(x) + 4) / 7);
  if (p === 'h') return Math.floor(y / 36e5) - Math.floor(x / 36e5); if (p === 'mi') return Math.floor(y / 6e4) - Math.floor(x / 6e4); if (p === 's') return Math.floor(y / 1e3) - Math.floor(x / 1e3);
  return dayNum(y) - dayNum(x); }
function tsdiff(p, a, b) { const x = D(a), y = D(b); if (!x || !y) return null; p = P(p); // MySQL / completed units
  let months = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth(); const rest = (d) => ((d.getUTCDate() * 24 + d.getUTCHours()) * 60 + d.getUTCMinutes()) * 60 + d.getUTCSeconds();
  if (months > 0 && rest(y) < rest(x)) months--; else if (months < 0 && rest(y) > rest(x)) months++;
  if (p === 'y') return Math.trunc(months / 12); if (p === 'q') return Math.trunc(months / 3); if (p === 'm') return months;
  const ms = y - x; return Math.trunc(ms / (p === 'w' ? 6048e5 : p === 'h' ? 36e5 : p === 'mi' ? 6e4 : p === 's' ? 1e3 : 864e5)); }
function age(a, b) { const x = D(a), y = D(b); if (!x || !y) return null; // x = later, y = birth (PostgreSQL AGE)
  let Y = x.getUTCFullYear() - y.getUTCFullYear(), M = x.getUTCMonth() - y.getUTCMonth(), Dd = x.getUTCDate() - y.getUTCDate();
  if (Dd < 0) { M--; Dd += new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 0)).getUTCDate(); } if (M < 0) { Y--; M += 12; } return ageP + Y + ':' + M + ':' + Dd; }
// ---- Formatting
function num(n, dec, group, minInt = 1) { if (n == null || isNaN(Number(n))) return n == null ? null : String(n); n = Number(n);
  let s = Math.abs(n).toFixed(dec); let [i, f] = s.split('.'); i = i.padStart(minInt, '0'); if (group) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 && Number(s) !== 0 ? '-' : '') + i + (f ? '.' + f : ''); }
function customNum(n, f) { // '#,##0.00', '999,999.99', 'FM$999,990', '0.0%'
  f = String(f).replace(/^fm/i, ''); const [ip, fp = ''] = f.split('.'); const dec = (fp.match(/[0#9]/g) || []).length; const pct = f.includes('%');
  const s = num(pct ? Number(n) * 100 : n, dec, ip.includes(','), Math.max(1, (ip.match(/0/g) || []).length));
  return (/[$L]/.test(ip) ? '$' : '') + s + (pct ? '%' : ''); }
const isNumLike = v => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) && !/^\d{4}-/.test(v));
function netFormat(v, f, culture) { // SQL Server FORMAT (.NET)
  if (v == null) return null; f = String(f ?? '');
  if (isNumLike(v)) { const n = Number(v), m = f.match(/^([NnCcPpFfDdEeGg])(\d*)$/);
    if (m) { const k = m[1].toUpperCase(), p = m[2] === '' ? null : +m[2];
      if (k === 'N') return num(n, p ?? 2, true); if (k === 'C') return (n < 0 ? '-$' : '$') + num(Math.abs(n), p ?? 2, true); if (k === 'P') return num(n * 100, p ?? 2, true) + '%';
      if (k === 'F') return num(n, p ?? 2, false); if (k === 'D') return (n < 0 ? '-' : '') + String(Math.abs(Math.trunc(n))).padStart(p || 1, '0'); if (k === 'E') return n.toExponential(p ?? 6).toUpperCase(); return String(n); }
    return customNum(n, f); }
  const d = D(v); if (!d) return String(v);
  if (f === 'd') f = 'M/d/yyyy'; else if (f === 'D') f = 'dddd, MMMM d, yyyy'; else if (f === 'yyyyMMdd' || f === '') f = f || 'M/d/yyyy h:mm:ss tt';
  return f.replace(/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|tt|'[^']*'|\\./g, t => {
    const h = d.getUTCHours();
    switch (t) { case 'yyyy': return d.getUTCFullYear(); case 'yy': return pad(d.getUTCFullYear() % 100); case 'MMMM': return MON[d.getUTCMonth()]; case 'MMM': return MON[d.getUTCMonth()].slice(0, 3);
      case 'MM': return pad(d.getUTCMonth() + 1); case 'M': return d.getUTCMonth() + 1; case 'dddd': return DAYS[d.getUTCDay()]; case 'ddd': return DAYS[d.getUTCDay()].slice(0, 3);
      case 'dd': return pad(d.getUTCDate()); case 'd': return d.getUTCDate(); case 'HH': return pad(h); case 'H': return h; case 'hh': return pad(h % 12 || 12); case 'h': return h % 12 || 12;
      case 'mm': return pad(d.getUTCMinutes()); case 'm': return d.getUTCMinutes(); case 'ss': return pad(d.getUTCSeconds()); case 's': return d.getUTCSeconds(); case 'tt': return h < 12 ? 'AM' : 'PM'; }
    return t[0] === '\\' ? t[1] : t.slice(1, -1); }); }
function vbFormat(v, f) { // Access Format()
  if (v == null) return null; const k = String(f ?? '').toLowerCase();
  if (isNumLike(v)) { const n = Number(v); if (k === 'currency') return '$' + num(n, 2, true); if (k === 'standard') return num(n, 2, true); if (k === 'fixed') return num(n, 2, false); if (k === 'percent') return num(n * 100, 2, false) + '%'; return customNum(n, f); }
  const d = D(v); if (!d) return String(v);
  const named = { 'long date': 'dddd, mmmm d, yyyy', 'medium date': 'dd-mmm-yy', 'short date': 'm/d/yyyy', 'general date': 'm/d/yyyy' }; f = named[k] || f;
  return String(f).replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|q/gi, t => { switch (t.toLowerCase()) { case 'yyyy': return d.getUTCFullYear(); case 'yy': return pad(d.getUTCFullYear() % 100);
    case 'mmmm': return MON[d.getUTCMonth()]; case 'mmm': return MON[d.getUTCMonth()].slice(0, 3); case 'mm': return pad(d.getUTCMonth() + 1); case 'm': return d.getUTCMonth() + 1;
    case 'dddd': return DAYS[d.getUTCDay()]; case 'ddd': return DAYS[d.getUTCDay()].slice(0, 3); case 'dd': return pad(d.getUTCDate()); case 'd': return d.getUTCDate(); case 'q': return Math.floor(d.getUTCMonth() / 3) + 1; } }); }
function toChar(v, f, pg) { // Oracle / PostgreSQL TO_CHAR
  if (v == null) return null; if (f == null) return String(v);
  if (isNumLike(v) && !/[YMDHQ]/i.test(String(f).replace(/fm/i, ''))) return customNum(v, f);
  const d = D(v); if (!d) return String(v); let fm = false, once = false;
  const cased = (name, tok) => tok === tok.toUpperCase() ? name.toUpperCase() : tok[0] === tok[0].toUpperCase() ? name : name.toLowerCase();
  return String(f).replace(/FM|"[^"]*"|YYYY|YY|MONTH|MON|MM|DDD|DD|DAY|DY|D|Q|HH24|HH12|HH|MI|SS|AM|PM|W|WW|J/gi, t => {
    const T = t.toUpperCase(); if (T === 'FM') { if (pg) once = true; else fm = !fm; return ''; } if (t[0] === '"') return t.slice(1, -1);
    const nopad = fm || once; once = false; const z = (n, w = 2) => nopad ? String(n) : pad(n, w); const h = d.getUTCHours();
    switch (T) { case 'YYYY': return d.getUTCFullYear(); case 'YY': return pad(d.getUTCFullYear() % 100); case 'MONTH': { const s = cased(MON[d.getUTCMonth()], t); return nopad ? s : s.padEnd(9); }
      case 'MON': return cased(MON[d.getUTCMonth()].slice(0, 3), t); case 'MM': return z(d.getUTCMonth() + 1); case 'DDD': return z(doy(d), 3); case 'DD': return z(d.getUTCDate());
      case 'DAY': { const s = cased(DAYS[d.getUTCDay()], t); return nopad ? s : s.padEnd(9); } case 'DY': return cased(DAYS[d.getUTCDay()].slice(0, 3), t); case 'D': return d.getUTCDay() + 1;
      case 'Q': return Math.floor(d.getUTCMonth() / 3) + 1; case 'HH24': return z(h); case 'HH12': case 'HH': return z(h % 12 || 12); case 'MI': return z(d.getUTCMinutes()); case 'SS': return z(d.getUTCSeconds());
      case 'AM': case 'PM': return h < 12 ? 'AM' : 'PM'; case 'W': return Math.floor((d.getUTCDate() - 1) / 7) + 1; case 'WW': return z(Math.floor((doy(d) - 1) / 7) + 1); case 'J': return dayNum(d) + 2440588; }
    return t; }); }
function myFormat(v, f) { // MySQL DATE_FORMAT
  const d = D(v); if (!d) return v == null ? null : String(v); const h = d.getUTCHours(), dd = d.getUTCDate();
  const sfx = n => (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return String(f).replace(/%(.)/g, (_, c) => ({ Y: d.getUTCFullYear(), y: pad(d.getUTCFullYear() % 100), m: pad(d.getUTCMonth() + 1), c: d.getUTCMonth() + 1, d: pad(dd), e: dd, D: dd + sfx(dd),
    M: MON[d.getUTCMonth()], b: MON[d.getUTCMonth()].slice(0, 3), W: DAYS[d.getUTCDay()], a: DAYS[d.getUTCDay()].slice(0, 3), w: d.getUTCDay(), j: pad(doy(d), 3),
    H: pad(h), k: h, h: pad(h % 12 || 12), I: pad(h % 12 || 12), l: h % 12 || 12, i: pad(d.getUTCMinutes()), s: pad(d.getUTCSeconds()), S: pad(d.getUTCSeconds()), p: h < 12 ? 'AM' : 'PM', '%': '%' })[c] ?? c); }
const STYLES = { 1: 'MM/dd/yy', 101: 'MM/dd/yyyy', 2: 'yy.MM.dd', 102: 'yyyy.MM.dd', 3: 'dd/MM/yy', 103: 'dd/MM/yyyy', 4: 'dd.MM.yy', 104: 'dd.MM.yyyy', 5: 'dd-MM-yy', 105: 'dd-MM-yyyy',
  6: 'dd MMM yy', 106: 'dd MMM yyyy', 7: 'MMM dd, yy', 107: 'MMM dd, yyyy', 10: 'MM-dd-yy', 110: 'MM-dd-yyyy', 11: 'yy/MM/dd', 111: 'yyyy/MM/dd', 12: 'yyMMdd', 112: 'yyyyMMdd', 23: 'yyyy-MM-dd', 120: 'yyyy-MM-dd HH:mm:ss', 121: 'yyyy-MM-dd HH:mm:ss', 126: "yyyy-MM-dd'T'HH:mm:ss" };
// ---- Regex helpers
const re = (p, f = '') => { try { return new RegExp(String(p), f); } catch { return null; } };
function soundex(s) { if (s == null) return null; s = String(s).toUpperCase().replace(/[^A-Z]/g, ''); if (!s) return '';
  const c = { B: 1, F: 1, P: 1, V: 1, C: 2, G: 2, J: 2, K: 2, Q: 2, S: 2, X: 2, Z: 2, D: 3, T: 3, L: 4, M: 5, N: 5, R: 6 }; let r = s[0], last = c[s[0]] || 0;
  for (const ch of s.slice(1)) { const k = c[ch] || 0; if (k && k !== last) r += k; if (ch !== 'H' && ch !== 'W') last = k; } return (r + '000').slice(0, 4); }
const S = v => v == null ? null : String(v);
function pctl(arr, p, disc) { const a = arr.filter(x => x != null && !isNaN(x)).map(Number).sort((x, y) => x - y); if (!a.length) return null;
  if (disc) return a[Math.max(0, Math.ceil(p * a.length) - 1)]; const k = (a.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); return a[lo] + (a[hi] - a[lo]) * (k - lo); }
const varAgg = pop => ({ init: () => [], step: (s, x) => { if (x != null && !isNaN(x)) s.push(Number(x)); return s; },
  finalize: s => { const n = s.length; if (n < (pop ? 1 : 2)) return null; const m = s.reduce((a, b) => a + b, 0) / n; return s.reduce((a, b) => a + (b - m) ** 2, 0) / (pop ? n : n - 1); } });

const F = {
  // dates
  YEAR: v => part('y', v), MONTH: v => part('m', v), DAY: v => part('d', v), QUARTER: v => part('q', v), DAYOFYEAR: v => part('doy', v), DAYOFWEEK: v => part('dw', v),
  WEEKDAY: v => { const x = part('dow', v); return x == null ? null : (x + 6) % 7; }, WEEKOFYEAR: v => part('w', v), HOUR: v => part('h', v), MINUTE: v => part('mi', v), SECOND: v => part('s', v),
  DATEPART: part, DATE_PART: part, DATEADD: add, DATEDIFF: diff, TIMESTAMPDIFF: tsdiff, AGE: age,
  DATENAME: (p, v) => { const d = D(v); if (!d) return null; p = P(p); return p === 'm' ? MON[d.getUTCMonth()] : p === 'dw' ? DAYS[d.getUTCDay()] : S(part(p, v)); },
  MONTHNAME: v => { if (isNumLike(v) && Number(v) >= 1 && Number(v) <= 12) return MON[Number(v) - 1]; const d = D(v); return d ? MON[d.getUTCMonth()] : null; },
  DAYNAME: v => { const d = D(v); return d ? DAYS[d.getUTCDay()] : null; }, WEEKDAYNAME: n => n == null ? null : DAYS[(Number(n) - 1 + 7) % 7],
  EOMONTH: v => { const d = D(v); return d ? iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) : null; }, LAST_DAY: v => F.EOMONTH(v),
  TQ_EOM2: (v, n) => F.EOMONTH(add('m', n || 0, F.EOMONTH(v))),
  TQ_MKDATE: (y, m, d) => (y == null || m == null || d == null) ? null : iso(new Date(Date.UTC(+y, +m - 1, +d))),
  TQ_DAYS: (a, b) => { const x = D(a), y = D(b); if (!x || !y) return null; return (hasTime(a) || hasTime(b)) ? (x - y) / 864e5 : dayNum(x) - dayNum(y); },
  TQ_TODATE: v => iso(D(v)), TQ_TODT: v => isoT(D(v)), TO_DATE: (v, f) => { if (v == null) return null; const s = String(v).trim(), k = String(f || '').toUpperCase().replace(/%/g, '');
    const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m && /^D/.test(k)) return iso(new Date(Date.UTC(+m[3], m[2] - 1, +m[1]))); return iso(D(s)); },
  MONTHS_BETWEEN: (a, b) => { const x = D(a), y = D(b); if (!x || !y) return null; const lastX = x.getUTCDate() === new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(), lastY = y.getUTCDate() === new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth() + 1, 0)).getUTCDate();
    const m = (x.getUTCFullYear() - y.getUTCFullYear()) * 12 + x.getUTCMonth() - y.getUTCMonth(); return (x.getUTCDate() === y.getUTCDate() || (lastX && lastY)) ? m : m + (x.getUTCDate() - y.getUTCDate()) / 31; },
  DATE_TRUNC: (p, v) => { const d = D(v); if (!d) return null; p = P(p); const y = d.getUTCFullYear(), m = d.getUTCMonth();
    return p === 'y' ? y + '-01-01' : p === 'q' ? iso(new Date(Date.UTC(y, m - m % 3, 1))) : p === 'm' ? iso(new Date(Date.UTC(y, m, 1))) : p === 'w' ? iso(new Date(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7)))) : iso(d); },
  TRUNC: v => typeof v === 'number' ? Math.trunc(v) : (D(v) ? iso(D(v)) : v),
  TQ_TRUNC2: (v, n) => { if (v == null) return null; if (isNumLike(v)) { const f = 10 ** (Number(n) || 0); return Math.trunc(Number(v) * f) / f; } return F.DATE_TRUNC(String(n || 'dd').replace(/^(yyyy|year|yy|y)$/i, 'y').replace(/^(mm|month|mon)$/i, 'm').replace(/^(q)$/i, 'q'), v); },
  GETDATE: () => isoT(nowWall()), NOW: () => isoT(nowWall()), CURDATE: () => iso(nowWall()), SYSDATE: () => iso(nowWall()),
  NETFORMAT: (v, f) => netFormat(v, f), TO_CHAR: (v, f) => toChar(v, f, false), TQ_PGCHAR: (v, f) => toChar(v, f, true), DATE_FORMAT: myFormat, VBFORMAT: vbFormat,
  TQ_MYNUM: (n, d) => num(n, Number(d) || 0, true), TQ_STYLE: (v, st) => { const f = STYLES[Number(st)]; return f && D(v) ? netFormat(v, f) : S(v); },
  // text
  LEN: s => s == null ? null : String(s).replace(/\s+$/, '').length, UCASE: s => s == null ? null : String(s).toUpperCase(), LCASE: s => s == null ? null : String(s).toLowerCase(),
  TQ_RIGHT: (s, n) => s == null ? null : (Number(n) > 0 ? String(s).slice(-Number(n)) : ''), TQ_LEFT: (s, n) => s == null ? null : String(s).slice(0, Math.max(0, Number(n))),
  TQ_LPAD: (s, n, p) => { if (s == null) return null; s = String(s); n = Number(n); p = p == null ? ' ' : String(p); if (s.length >= n) return s.slice(0, n); return p ? s.padStart(n, p) : s; },
  TQ_RPAD: (s, n, p) => { if (s == null) return null; s = String(s); n = Number(n); p = p == null ? ' ' : String(p); if (s.length >= n) return s.slice(0, n); return p ? s.padEnd(n, p) : s; },
  TQ_INSTR: (s, sub, start, occ) => { if (s == null || sub == null) return null; s = String(s); sub = String(sub); start = Number(start) || 1; occ = Number(occ) || 1;
    if (start > 0) { let i = start - 2; while (occ--) { i = s.indexOf(sub, i + 1); if (i < 0) return 0; } return i + 1; }
    let i = s.length + start + 1; while (occ--) { i = s.lastIndexOf(sub, i - 1); if (i < 0) return 0; } return i + 1; },
  INITCAP: s => s == null ? null : String(s).toLowerCase().replace(/(^|[^a-z0-9])([a-z])/g, (m, a, b) => a + b.toUpperCase()),
  SPLIT_PART: (s, d, n) => { if (s == null) return null; const a = String(s).split(String(d)); n = Number(n); const x = n > 0 ? a[n - 1] : a[a.length + n]; return x ?? ''; },
  SUBSTRING_INDEX: (s, d, n) => { if (s == null) return null; const a = String(s).split(String(d)); n = Number(n); return n >= 0 ? a.slice(0, n).join(d) : a.slice(n).join(d); },
  REGEXP: (p, s) => { if (s == null || p == null) return null; const r = re(p); return r ? (r.test(String(s)) ? 1 : 0) : 0; },
  TQ_RLIKE: (s, p, f) => { if (s == null || p == null) return null; const r = re(p, /i/.test(f || '') ? 'i' : ''); return r && r.test(String(s)) ? 1 : 0; },
  TQ_RREP: (s, p, r, f) => { if (s == null) return null; const x = re(p, (/g/.test(f || '') ? 'g' : '') + (/i/.test(f || '') ? 'i' : '')); return x ? String(s).replace(x, r == null ? '' : String(r).replace(/\\(\d)/g, '$$$1')) : S(s); },
  TQ_RSUB: (s, p) => { if (s == null) return null; const x = re(p); const m = x && String(s).match(x); return m ? m[0] : null; },
  TQ_RCOUNT: (s, p) => { if (s == null) return null; const x = re(p, 'g'); return x ? (String(s).match(x) || []).length : 0; },
  SOUNDEX: soundex, DIFFERENCE: (a, b) => { const x = soundex(a), y = soundex(b); if (x == null || y == null) return null; let n = 0; for (let i = 0; i < 4; i++) if (x[i] === y[i]) n++; return n; },
  // numbers / conditions
  FLOOR: v => v == null ? null : Math.floor(v), CEILING: v => v == null ? null : Math.ceil(v), CEIL: v => v == null ? null : Math.ceil(v),
  MOD: (a, b) => (a == null || b == null || Number(b) === 0) ? null : Number(a) % Number(b),
  TQ_ROUND: (x, n) => { if (x == null) return null; n = Number(n) || 0; const f = 10 ** n, v = Number(x) * f; const r = Math.sign(v) * Math.round(Math.abs(v) + 1e-9) / f; return n <= 0 ? Math.round(r) : r; },
  TQ_ROUND3: (x, n, t) => Number(t) ? F.TQ_TRUNC2(x, n) : F.TQ_ROUND(x, n),
  ISNULL: (a, b) => a ?? b, NVL: (a, b) => a ?? b, NZ: (a, b) => a ?? (b ?? 0), NVL2: (a, b, c) => a != null ? b : c,
};
const AGG = { TQ_STDEVP: { ...varAgg(true), finalize: s => { const v = varAgg(true).finalize(s); return v == null ? null : Math.sqrt(v); } }, TQ_VARP: varAgg(true),
  TQ_STDEV: { ...varAgg(false), finalize: s => { const v = varAgg(false).finalize(s); return v == null ? null : Math.sqrt(v); } }, TQ_VAR: varAgg(false),
  TQ_PCTC: { init: () => ({ a: [], p: 0.5 }), step: (s, x, p) => { s.a.push(x); s.p = Number(p); return s; }, finalize: s => pctl(s.a, s.p, false) },
  TQ_PCTD: { init: () => ({ a: [], p: 0.5 }), step: (s, x, p) => { s.a.push(x); s.p = Number(p); return s; }, finalize: s => pctl(s.a, s.p, true) },
  MEDIAN: { init: () => [], step: (s, x) => (s.push(x), s), finalize: s => pctl(s, 0.5, false) } };
function register(db) {
  for (const [k, f] of Object.entries(F)) db.create_function(k, f);
  for (const [k, a] of Object.entries(AGG)) db.create_aggregate(k, { init: a.init, step: a.step, finalize: a.finalize });
}
module.exports = { register, F, D, netFormat, toChar, myFormat, vbFormat };

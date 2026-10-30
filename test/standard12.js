// TQueries v0.5 — the 12 standard questions, fixture tables and expected answers (shared by test/patterns.js and test/bench.js).
const TABLES = [
  { name: 'EMPLOYEES', columns: ['EMP_ID', 'F_NAME', 'L_NAME', 'B_DATE', 'ADDRESS', 'SALARY', 'DEP_ID'].map(name => ({ name, type: '' })), rows: [
    ['E1001', 'John', 'Thomas', '1976-01-09', '5631 Rice, OakPark,IL', 100000, 2],
    ['E1002', 'Alice', 'James', '1972-07-31', '980 Berry ln, Elgin,IL', 80000, 5],
    ['E1003', 'Steve', 'Wells', '1980-08-10', '291 Springs, Gary,IL', 50000, 5]] },
  { name: 'DEPARTMENTS', columns: ['DEPT_ID_DEP', 'DEP_NAME'].map(name => ({ name, type: '' })), rows: [[5, 'Software Development'], [7, 'Design Team']] }];
const today = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };
const ageOn = (b, on) => { const [y, m, d] = b.split('-').map(Number); return on.getUTCFullYear() - y - ((on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d)) ? 1 : 0); };
const daysTo = b => { const t = today(), [, m, d] = b.split('-').map(Number); let n = new Date(Date.UTC(t.getUTCFullYear(), m - 1, d)); if (n <= t) n = new Date(Date.UTC(t.getUTCFullYear() + 1, m - 1, d)); return Math.round((n - t) / 864e5); };
const B = ['1976-01-09', '1972-07-31', '1980-08-10'];
// expect: list of columns that must each appear (in any result column) — values compared loosely (numbers ±0.01, strings trimmed)
const Q = [
  ['How many characters are in each employee\'s first name?', [[4, 5, 5]]],
  ['Show each employee\'s birth date formatted like \'January 9, 1976\'', [['January 9, 1976', 'July 31, 1972', 'August 10, 1980']]],
  ['How old was each employee in 2020?', [[44, 48, 40]]],
  ['How old is John Thomas today?', () => [[ageOn(B[0], today())]]],
  ['Show each employee\'s full name', [['John Thomas', 'Alice James', 'Steve Wells']]],
  ['What month was each employee born in?', [['January', 'July', 'August']]],
  ['Average and standard deviation of salary', [[76666.67], [25166.11]]],
  ['Each employee\'s salary rounded to the nearest thousand', [[100000, 80000, 50000]]],
  ['Label salaries over 70000 as \'High\', otherwise \'Standard\'', [['High', 'High', 'Standard']]],
  ['Which employees have an address containing \'IL\'?', [['John', 'Alice', 'Steve']]],
  ['How many days until each employee\'s next birthday?', () => [B.map(daysTo)]],
  ['Show each employee\'s initials', [['JT', 'AJ', 'SW']]],
];
const same = (a, b) => typeof b === 'number' ? a != null && Math.abs(Number(a) - b) < 0.01 : String(a ?? '').trim() === b;
function correct(result, want) { if (!result || !result.rows) return false; want = typeof want === 'function' ? want() : want;
  const cols = result.columns.map((_, i) => result.rows.map(r => r[i]));
  return want.every(w => cols.some(c => c.length === w.length && w.every((v, i) => same(c[i], v)))); }
module.exports = { TABLES, Q, correct };

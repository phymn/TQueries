// v0.5.1 "Clean Cells": CSV parser, position grouping (wrapped cells, glued values), cross-check flags.
const assert = require('assert'), fs = require('fs'), path = require('path'), C = require('../app/lib/cells');
const wordsFile = path.join(__dirname, 'fixtures', 'employee_departments.words.json');
if (!fs.existsSync(wordsFile)) { console.log('skip: employee_departments.words.json missing'); process.exit(0); }
const W = require('./fixtures/employee_departments.words.json');
let pass = 0, fail = 0; const st = (n, f) => { try { f(); pass++; console.log('✓ ' + n); } catch (e) { fail++; console.log('✕ ' + n + ' ' + e.message); } };
st('CSV: quotes keep commas, "" escapes, newlines in quotes', () => {
  assert.deepEqual(C.parseCSV('A,B,C\n1,"5631 Rice, OakPark,IL","say ""hi"""\n2,"two\nlines",x\r\n'), [['A', 'B', 'C'], ['1', '5631 Rice, OakPark,IL', 'say "hi"'], ['2', 'two\nlines', 'x']]); });
st('CSV: several tables in one block split by header', () => {
  const t = C.csvTables('EMP_ID,F_NAME,DEP_ID\nE1,John,2\nDEPT_ID,DEP_NAME\n5,Software Development');
  assert.equal(t.length, 2); assert.deepEqual(t[1].columns, ['DEPT_ID', 'DEP_NAME']); assert.equal(t[1].rows[0][1], 'Software Development'); });
const P = C.positionTables(W.words);
st('position: fixture → 2 tables, wrapped headers joined', () => { assert.equal(P.length, 2);
  assert.deepEqual(P[0].columns, ['EMP_ID', 'F_NAME', 'L_NAME', 'SSN', 'B_DATE', 'SE', 'ADDRESS', 'JOB_ID', 'SALARY', 'MANAGER_ID', 'DEP_ID']); assert.deepEqual(P[1].columns, ['DEPT_ID_DEP', 'DEP_NAME', 'MANAGER_ID', 'LOC_ID']); });
st('position: cells separate, wrapped address/name joined, junk trimmed', () => { const r = P[0].rows;
  assert.deepEqual(r[0].slice(0, 6), ['E1001', 'John', 'Thomas', '123456', '1976-01-09', 'M']); assert.equal(r[0][6], '5631 Rice, OakPark,IL'); assert.equal(r[0][9], '30001'); assert.equal(r[2][8], '50000');
  assert.equal(P[1].rows[0][1], 'Software Development'); assert.equal(P[1].rows.length, 2); });
st('position: synthetic multi-line wrapped cell + glued SSN/date', () => { const w = (t, x0, x1, y0) => ({ t, x0, x1, y0, y1: y0 + 0.04 });
  const T = C.positionTables([w('ID', .02, .06, .02), w('SSN', .10, .16, .02), w('B_DATE', .22, .30, .02), w('NOTE', .40, .48, .02),
    w('1', .02, .03, .10), w('1234581980-08-10', .10, .30, .10), w('first', .40, .46, .10), w('second', .40, .47, .15), w('third', .40, .46, .20),
    w('2', .02, .03, .28), w('123459', .10, .17, .28), w('1990-01-02', .22, .31, .28), w('one', .40, .44, .28)]);
  assert.equal(T.length, 1); assert.equal(T[0].rows.length, 2); assert.deepEqual(T[0].rows[0], ['1', '123458', '1980-08-10', 'first second third']); assert.deepEqual(T[0].rows[1], ['2', '123459', '1990-01-02', 'one']); });
st('cropRect pads and stays inside the picture', () => { const r = C.cropRect(P[1].box); assert.ok(r.every(v => v >= 0 && v <= 1)); assert.ok(r[1] < P[1].box.y && r[1] + r[3] > P[1].box.y1); });
const FM = 'EMP_ID,F_NAME,L_NAME,SSN,B_DATE,SEX,ADDRESS,JOB_ID,SALARY,MANAGER_ID,DEP_ID\nE1001,John,Thomas,123456,1976-01-09,M,"6561 Rice, OakPark,IL",100,100000,30001,2\nE1002,Alice,James,123457,1972-72-31,M,"980 Berry In, Elgin,IL",200,80000,30002,5\nE1003,Steve,Wells,123458,1980-10-08,M,"291 Springs, Gary,IL",300,50000,30002,5\nDEPT_ID_DEP,DEP_NAME,MANAGER_ID,LOC_ID\n5,Software Development,30002,L0002\n7,Design Team,3003,L0003';
st('cross-check (real Mac readings): truth restored, disagreements flagged', () => { const [E, D] = C.crossCheck(P, [FM, FM]);
  assert.equal(E.columns[5], 'SEX'); assert.deepEqual(E.rows.map(r => r[4]), ['1976-01-09', '1972-07-31', '1980-08-10']); assert.deepEqual(E.rows.map(r => r[10]), ['2', '5', '5']);
  assert.equal(E.rows[1][5], 'F'); assert.equal(E.rows[0][6], '5631 Rice, OakPark,IL'); assert.deepEqual(D.rows.map(r => r[2]), ['30002', '30003']);
  const k = E.flags.map(f => `${f.r}:${f.c}`).sort(); assert.deepEqual(k, ['-1:5', '0:6', '1:10', '1:4', '1:5', '2:4']); assert.equal(D.flags.length, 1); });
st('cross-check: no model output → position reading as is', () => { const [E] = C.crossCheck(P, []); assert.equal(E.flags.length, 0); assert.equal(E.rows[0][1], 'John'); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

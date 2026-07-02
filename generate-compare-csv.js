'use strict';

// node generate-compare-csv.js  →  compare.csv
//
// Columns:
//   A: Data A  – put these values into column A of your test sheet
//   B: Data B  – put these into column B (only for multi-column sections)
//   C: Plugin formula  – the formula as written in Obsidian
//   D: Sheets formula  – the equivalent formula for Google Sheets
//                        (row numbers are adjusted for each section's
//                         position in the sheet; function names are
//                         translated where Sheets uses a different name)
//   E: Plugin result   – what this engine returns
//   F: Note            – known behavioural differences vs. Sheets

const { evalFormula } = require('./engine.js');
const fs = require('fs');

const rows = [];

function addRow(a = '', b = '', c = '', d = '', e = '', f = '') {
  rows.push([a, b, c, d, e, f]);
}

function currentRow() { return rows.length + 1; }

// Shift every cell reference in `formula` by `offset` rows.
// e.g. shiftRefs('=SUM(A1:A5)', 4) → '=SUM(A5:A9)'
function shiftRefs(formula, offset) {
  if (!offset) return formula;
  return formula.replace(/([A-Z])(\d+)/gi, (_, col, n) =>
    col.toUpperCase() + (parseInt(n) + offset));
}

// Translate plugin function names to Sheets equivalents where they differ.
function toSheets(formula) {
  return formula
    .replace(/\bAVG\b/g, 'AVERAGE')
    .replace(/\bCEIL\b/g, 'CEILING')
    .replace(/\bPOW\b/g, 'POWER');
}

function section(label) {
  addRow('', '', `── ${label} ──`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Data block: single column. Returns the 1-indexed starting row.
function data1(values) {
  const start = currentRow();
  for (const v of values) addRow(v);
  return start;
}

// Data block: two columns. Returns the 1-indexed starting row.
function data2(pairs) {
  const start = currentRow();
  for (const [a = '', b = ''] of pairs) addRow(a, b);
  return start;
}

// Add formula result rows referencing a data block that starts at `dataStart`.
// cases: [logicalFormula, pluginGrid, overrideSheetsFormula?, note?]
function formulaRows(dataStart, cases) {
  const offset = dataStart - 1;
  for (const [logical, grid, overrideSheets, note] of cases) {
    const plugin = evalFormula(logical, grid);
    const sheetsBase = overrideSheets ?? toSheets(logical);
    const sheetsActual = shiftRefs(sheetsBase, offset);
    addRow('', '', logical, sheetsActual, plugin, note ?? '');
  }
}

// No-data formula row (arithmetic, rounding, etc.)
function pureRow(logical, overrideSheets, note) {
  const plugin = evalFormula(logical, []);
  const sheets = overrideSheets ?? toSheets(logical);
  addRow('', '', logical, sheets, plugin, note ?? '');
}

// ── Header ────────────────────────────────────────────────────────────────────
addRow('Data A', 'Data B', 'Plugin formula', 'Sheets formula', 'Plugin result', 'Notes');

// ── ARITHMETIC ────────────────────────────────────────────────────────────────
section('ARITHMETIC (no data needed)');
for (const f of ['=1+2', '=10-3', '=3*4', '=10/4', '=2^10', '=(2+3)*4', '=1e3+1', '=-5+3']) {
  pureRow(f);
}
pureRow('=10/0', '=IFERROR(10/0,"#DIV/0!")', 'Sheets shows #DIV/0! not #ERR');

// ── CELL REFERENCES ───────────────────────────────────────────────────────────
section('CELL REFERENCES');
const crGrid = [['3', '4'], ['10', '5']];
const crStart = data2(crGrid);
formulaRows(crStart, [
  ['=A1', crGrid],
  ['=B1', crGrid],
  ['=A1+B1', crGrid],
  ['=A1*B1', crGrid],
  ['=A2/B2', crGrid],
  ['=A1+A2', crGrid],
  ['=B1-B2', crGrid],
]);

// ── SUM ───────────────────────────────────────────────────────────────────────
section('SUM');
const sumGrid = [['1'], ['2'], ['3'], [''], ['text']];
const sumStart = data1(sumGrid.map(r => r[0]));
formulaRows(sumStart, [
  ['=SUM(A1:A5)', sumGrid, null, 'Plugin: blank+text → 0; Sheets: SKIPS non-numeric → result also 6 here'],
  ['=SUM(A1:A3)', sumGrid],
]);

// ── AVG / AVERAGE ─────────────────────────────────────────────────────────────
section('AVG / AVERAGE');
const avgGrid = [['10'], ['20'], ['30'], [''], ['text']];
const avgStart = data1(avgGrid.map(r => r[0]));
formulaRows(avgStart, [
  ['=AVG(A1:A3)', avgGrid],
  ['=AVERAGE(A1:A3)', avgGrid],
  ['=AVG(A1:A5)', avgGrid, null, 'DIFFERENCE: plugin treats blank+text as 0 → avg over 5; Sheets skips them → avg over 3 = 20'],
]);

// ── MEDIAN ────────────────────────────────────────────────────────────────────
section('MEDIAN');
const medGrid = [['1'], ['3'], ['2'], ['text'], ['5']];
const medStart = data1(medGrid.map(r => r[0]));
formulaRows(medStart, [
  ['=MEDIAN(A1:A3)', medGrid],
  ['=MEDIAN(A1:A5)', medGrid, null, 'Both skip text; sorted numeric = [1,2,3,5]; median = 2.5'],
]);

// ── MIN / MAX ─────────────────────────────────────────────────────────────────
section('MIN / MAX');
const mmGrid = [['5'], ['text'], ['-3'], [''], ['10']];
const mmStart = data1(mmGrid.map(r => r[0]));
formulaRows(mmStart, [
  ['=MIN(A1:A5)', mmGrid, null, 'Both skip text/blank'],
  ['=MAX(A1:A5)', mmGrid, null, 'Both skip text/blank'],
]);

// ── COUNT / COUNTA ────────────────────────────────────────────────────────────
section('COUNT / COUNTA');
const cntGrid = [['5'], ['text'], [''], ['3.14'], ['0']];
const cntStart = data1(cntGrid.map(r => r[0]));
formulaRows(cntStart, [
  ['=COUNT(A1:A5)', cntGrid, null, 'Counts numeric only: 5, 3.14, 0 = 3'],
  ['=COUNTA(A1:A5)', cntGrid, null, 'Counts non-empty: 5, text, 3.14, 0 = 4'],
]);

// ── PRODUCT ───────────────────────────────────────────────────────────────────
section('PRODUCT');
const prodGrid = [['2'], ['3'], ['text'], ['4']];
const prodStart = data1(prodGrid.map(r => r[0]));
formulaRows(prodStart, [
  ['=PRODUCT(A1:A4)', prodGrid, null, 'Both skip text; 2×3×4 = 24'],
  ['=PRODUCT(A1:A2)', prodGrid],
]);

// ── STDEV / VAR ───────────────────────────────────────────────────────────────
section('STDEV / VAR (sample, divides by n-1 — matches Sheets STDEV/VAR)');
const stdevGrid = [['2'], ['4'], ['4'], ['4'], ['5'], ['5'], ['7'], ['9']];
const stdevStart = data1(stdevGrid.map(r => r[0]));
formulaRows(stdevStart, [
  ['=STDEV(A1:A8)', stdevGrid],
  ['=VAR(A1:A8)', stdevGrid],
]);

// ── ROUNDING ─────────────────────────────────────────────────────────────────
section('ROUNDING (no data needed)');
for (const [f, note] of [
  ['=ROUND(2.567,2)', ''],
  ['=ROUND(2.5,0)', 'Half away from zero → 3; Sheets does the same'],
  ['=ROUND(-2.5,0)', 'Half away from zero → -3; Sheets does the same'],
  ['=FLOOR(2.9)', ''],
  ['=FLOOR(-2.1)', ''],
  ['=CEIL(2.1)', 'Plugin: CEIL; Sheets: CEILING (auto-translated in col D)'],
  ['=CEIL(-2.9)', ''],
  ['=CEILING(2.1)', ''],
  ['=INT(2.9)', ''],
  ['=INT(-2.1)', ''],
  ['=TRUNC(2.9,0)', ''],
  ['=TRUNC(-2.9,0)', 'Truncates toward zero (not floor)'],
  ['=TRUNC(3.14159,3)', ''],
]) {
  pureRow(f, null, note);
}

// ── MATH ─────────────────────────────────────────────────────────────────────
section('MATH (no data needed)');
for (const [f, override, note] of [
  ['=ABS(-7)', null, ''],
  ['=SIGN(-5)', null, ''],
  ['=SIGN(0)', null, ''],
  ['=SIGN(5)', null, ''],
  ['=SQRT(9)', null, ''],
  ['=SQRT(2)', null, ''],
  ['=SQRT(-1)', '=IFERROR(SQRT(-1),"#NUM!")', 'Sheets: #NUM!; plugin: #ERR'],
  ['=POW(2,10)', null, 'Plugin: POW; Sheets: POWER (auto-translated)'],
  ['=POWER(3,3)', null, ''],
  ['=MOD(10,3)', null, ''],
  ['=MOD(-7,3)', null, 'Sign of divisor → 2; matches Sheets'],
  ['=MOD(7,-3)', null, 'Sign of divisor → -2; matches Sheets'],
  ['=EXP(1)', null, ''],
  ['=LOG(8,2)', null, ''],
  ['=LOG(100,10)', null, ''],
  ['=LOG(8)', '=LN(8)', 'DIFFERENCE: plugin LOG(x) = natural log; Sheets LOG(x) = log base 10. Use LN(8) in Sheets.'],
  ['=LOG10(1000)', null, ''],
  ['=PI()', null, ''],
  ['=ROUND(PI(),5)', null, ''],
]) {
  pureRow(f, override, note);
}

// ── NESTED ────────────────────────────────────────────────────────────────────
section('NESTED FORMULAS');
const nestGrid = [['3'], ['4'], ['5']];
const nestStart = data1(nestGrid.map(r => r[0]));
formulaRows(nestStart, [
  ['=ROUND(AVG(A1:A3),2)', nestGrid],
  ['=SUM(A1:A3)*1.1', nestGrid],
  ['=SQRT(POW(A1,2))', nestGrid],
]);

// ── ERROR PROPAGATION ─────────────────────────────────────────────────────────
section('ERROR PROPAGATION');
for (const [f, override, note] of [
  ['=SQRT(-4)', '=IFERROR(SQRT(-4),"#NUM!")', 'Sheets: #NUM!; plugin: #ERR'],
  ['=SUM(SQRT(-4),5)', '=IFERROR(SUM(SQRT(-4),5),"#NUM!")', 'Plugin: error propagates → #ERR; Sheets: #NUM! propagates too'],
  ['=LOG(0)', '=IFERROR(LOG(0),"error")', 'Sheets: #NUM!; plugin: #ERR'],
  ['=BADNAME(1,2)', '=BADNAME(1,2)', 'Both return #NAME?'],
]) {
  pureRow(f, override, note);
}

// ── FLOATING POINT ────────────────────────────────────────────────────────────
section('FLOATING POINT');
for (const f of ['=0.1+0.2', '=1/3', '=2/3']) {
  pureRow(f, null, 'Plugin snaps to 8 decimal places; Sheets may show more digits but stores same IEEE 754 value');
}

// ── Write CSV ─────────────────────────────────────────────────────────────────
function csvCell(val) {
  const s = String(val ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

const csv = rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
fs.writeFileSync('compare.csv', csv);
console.log(`Wrote compare.csv (${rows.length} rows)`);
console.log('Import into Google Sheets: File → Import → Upload → Replace current sheet');
console.log('Tip: freeze row 1, then scan col D (Sheets formula) vs col E (plugin result).');

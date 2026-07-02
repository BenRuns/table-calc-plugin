'use strict';

// Run:  node compare.js
//
// Prints a table of formulas + results you can cross-check against Google Sheets.
// For each section, the grid contents are shown first so you can replicate the
// data in Sheets before checking the formula results.

const { evalFormula } = require('./engine.js');

function run(label, grid, cases) {
  console.log('\n' + '─'.repeat(70));
  console.log(' ' + label);
  if (grid.length) {
    console.log(' Grid (cols = A,B,C,… rows = 1,2,3,…):');
    grid.forEach((row, i) => console.log(`   row ${i + 1}: [${row.join(', ')}]`));
  }
  console.log('─'.repeat(70));
  for (const [formula, note] of cases) {
    const result = evalFormula(formula, grid);
    const n = note ? `  ← ${note}` : '';
    console.log(`  ${formula.padEnd(30)} ${String(result).padStart(14)}${n}`);
  }
}

// ── Basic arithmetic ──────────────────────────────────────────────────────────
run('ARITHMETIC (no grid needed)', [], [
  ['=1+2',                  '3'],
  ['=10-3',                 '7'],
  ['=3*4',                  '12'],
  ['=10/4',                 '2.5'],
  ['=2^10',                 '1024'],
  ['=(2+3)*4',              '20'],
  ['=1e3+1',                '1001'],
  ['=-5+3',                 '-2'],
  ['=10/0',                 '#ERR'],
]);

// ── Cell references ───────────────────────────────────────────────────────────
run('CELL REFERENCES', [['3', '4'], ['10', '5']], [
  ['=A1',                   '3'],
  ['=B1',                   '4'],
  ['=A1+B1',                '7'],
  ['=A1*B1',                '12'],
  ['=A2/B2',                '2'],
  ['=A1+A2',                '13'],
  ['=B1-B2',                '-1'],
]);

// ── SUM ───────────────────────────────────────────────────────────────────────
run('SUM', [['1'], ['2'], ['3'], [''], ['text']], [
  ['=SUM(A1:A5)',            '6  (blank+text contribute 0)'],
  ['=SUM(A1:A3)',            '6'],
  ['=SUM(A1,A2,A3)',         'n/a — not supported; use range'],
]);

// ── AVG / AVERAGE ─────────────────────────────────────────────────────────────
run('AVG / AVERAGE', [['10'], ['20'], ['30'], [''], ['text']], [
  ['=AVG(A1:A3)',            '20'],
  ['=AVERAGE(A1:A3)',        '20'],
  ['=AVG(A1:A5)',            '12  (blank+text count as 0 in avg)'],
]);

// ── MEDIAN ────────────────────────────────────────────────────────────────────
run('MEDIAN', [['1'], ['3'], ['2'], ['text'], ['5']], [
  ['=MEDIAN(A1:A3)',         '2  (odd count)'],
  ['=MEDIAN(A1:A5)',         '2.5  (text excluded, even count [1,2,3,5])'],
]);

// ── MIN / MAX ─────────────────────────────────────────────────────────────────
run('MIN / MAX', [['5'], ['text'], ['-3'], [''], ['10']], [
  ['=MIN(A1:A5)',            '-3  (text/blank excluded)'],
  ['=MAX(A1:A5)',            '10  (text/blank excluded)'],
]);

// ── COUNT / COUNTA ────────────────────────────────────────────────────────────
run('COUNT / COUNTA', [['5'], ['text'], [''], ['3.14'], ['0']], [
  ['=COUNT(A1:A5)',          '3  (numeric cells only: 5, 3.14, 0)'],
  ['=COUNTA(A1:A5)',         '4  (non-empty: 5, text, 3.14, 0)'],
]);

// ── PRODUCT ───────────────────────────────────────────────────────────────────
run('PRODUCT', [['2'], ['3'], ['text'], ['4']], [
  ['=PRODUCT(A1:A4)',        '24  (text excluded, not treated as 0)'],
  ['=PRODUCT(A1:A2)',        '6'],
]);

// ── STDEV / VAR ───────────────────────────────────────────────────────────────
run('STDEV / VAR (sample)', [['2'], ['4'], ['4'], ['4'], ['5'], ['5'], ['7'], ['9']], [
  ['=STDEV(A1:A8)',          '≈2.138  (sample stdev, Sheets STDEV matches)'],
  ['=VAR(A1:A8)',            '≈4.571  (sample var, Sheets VAR matches)'],
]);

// ── Rounding functions ────────────────────────────────────────────────────────
run('ROUNDING', [], [
  ['=ROUND(2.567, 2)',       '2.57'],
  ['=ROUND(2.5, 0)',         '3  (half away from zero)'],
  ['=ROUND(-2.5, 0)',        '-3  (half away from zero; Sheets does same)'],
  ['=FLOOR(2.9)',            '2'],
  ['=FLOOR(-2.1)',           '-3'],
  ['=CEIL(2.1)',             '3'],
  ['=CEIL(-2.9)',            '-2'],
  ['=INT(2.9)',              '2'],
  ['=INT(-2.1)',             '-3'],
  ['=TRUNC(2.9, 0)',         '2'],
  ['=TRUNC(-2.9, 0)',        '-2  (truncates toward zero, not floor)'],
  ['=TRUNC(3.14159, 3)',     '3.141'],
]);

// ── Math functions ────────────────────────────────────────────────────────────
run('MATH', [], [
  ['=ABS(-7)',               '7'],
  ['=ABS(7)',                '7'],
  ['=SIGN(-5)',              '-1'],
  ['=SIGN(0)',               '0'],
  ['=SIGN(5)',               '1'],
  ['=SQRT(9)',               '3'],
  ['=SQRT(2)',               '1.41421356'],
  ['=SQRT(-1)',              '#ERR'],
  ['=POW(2, 10)',            '1024'],
  ['=POWER(3, 3)',           '27'],
  ['=MOD(10, 3)',            '1'],
  ['=MOD(-7, 3)',            '2  (sign of divisor, matches Sheets)'],
  ['=MOD(7, -3)',            '-2  (sign of divisor, matches Sheets)'],
  ['=EXP(1)',                '2.71828183'],
  ['=LOG(8, 2)',             '3'],
  ['=LOG(100, 10)',          '2'],
  ['=LOG(8)',                '2.07944154  (natural log)'],
  ['=LOG10(1000)',           '3'],
  ['=PI()',                  '3.14159265'],
  ['=ROUND(PI(), 5)',        '3.14159'],
]);

// ── Nested formulas ───────────────────────────────────────────────────────────
run('NESTED FORMULAS', [['3'], ['4'], ['5']], [
  ['=ROUND(AVG(A1:A3), 2)',  '4'],
  ['=SUM(A1:A3)*1.1',       '13.2'],
  ['=ABS(A1-A3)',            '0 ← LIMITATION: expr in fn args unsupported; Sheets gives 2'],
  ['=SQRT(POW(A1,2))',       '3'],
]);

// ── Error propagation ─────────────────────────────────────────────────────────
run('ERROR PROPAGATION', [], [
  ['=SQRT(-4)',              '#ERR'],
  ['=SUM(SQRT(-4), 5)',      '#ERR  (not 5)'],
  ['=ROUND(SQRT(-4), 2)',    '#ERR'],
  ['=LOG(0)',                '#ERR'],
  ['=BADNAME(1,2)',          '#NAME?'],
]);

// ── Floating-point precision ──────────────────────────────────────────────────
run('FLOATING POINT (8 decimal snap)', [], [
  ['=0.1+0.2',              '0.3  (not 0.30000000000000004)'],
  ['=1/3',                  '0.33333333'],
  ['=2/3',                  '0.66666667'],
]);

console.log('\n' + '─'.repeat(70));
console.log(' Done. Cross-check these against Google Sheets.');
console.log(' Paste the grid values into a Sheet, replicate the formula,');
console.log(' and compare. Differences from Sheets are noted inline above.');
console.log('─'.repeat(70) + '\n');

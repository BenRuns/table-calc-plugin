'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRef, evalFormula, formatResult } = require('./engine');

// ─── parseRef ─────────────────────────────────────────────────────────────────

test('parseRef: valid references', () => {
  assert.deepEqual(parseRef('A1'), { r: 0, c: 0 });
  assert.deepEqual(parseRef('B2'), { r: 1, c: 1 });
  assert.deepEqual(parseRef('C10'), { r: 9, c: 2 });
  assert.deepEqual(parseRef('a1'), { r: 0, c: 0 }); // case-insensitive
});

test('parseRef: invalid references return null', () => {
  assert.equal(parseRef('1A'), null);
  assert.equal(parseRef(''), null);
  assert.equal(parseRef('AA1'), null); // multi-letter col not supported
  assert.equal(parseRef('foo'), null);
});

// ─── evalFormula — arithmetic ─────────────────────────────────────────────────

test('evalFormula: basic arithmetic', () => {
  const g = [];
  assert.equal(evalFormula('=1+2', g), 3);
  assert.equal(evalFormula('=10-4', g), 6);
  assert.equal(evalFormula('=3*4', g), 12);
  assert.equal(evalFormula('=10/4', g), 2.5);
  assert.equal(evalFormula('=2+3*4', g), 14); // operator precedence
  assert.equal(evalFormula('=(2+3)*4', g), 20);
});

test('evalFormula: non-formula passthrough', () => {
  assert.equal(evalFormula('hello', []), 'hello');
  assert.equal(evalFormula('42', []), '42');
  assert.equal(evalFormula('', []), '');
});

test('evalFormula: division by zero returns #ERR', () => {
  assert.equal(evalFormula('=1/0', []), '#ERR');
});

test('evalFormula: unknown function returns #NAME?', () => {
  assert.equal(evalFormula('=FOO(1,2)', []), '#NAME?');
});

test('evalFormula: dangerous expression blocked', () => {
  // Function calls with unknown names return #NAME?
  // Non-function dangerous strings (with quotes/identifiers) hit the safe-math guard and return #ERR
  const isError = v => v === '#NAME?' || v === '#ERR';
  assert.ok(isError(evalFormula('=alert(1)', [])), 'alert() should be blocked');
  assert.ok(isError(evalFormula('=require("fs")', [])), 'require() should be blocked');
  assert.ok(isError(evalFormula('=process.exit()', [])), 'process.exit() should be blocked');
});

// ─── evalFormula — cell references ───────────────────────────────────────────

test('evalFormula: single cell reference', () => {
  const grid = [['10', '20'], ['30', '40']];
  assert.equal(evalFormula('=A1', grid), 10);
  assert.equal(evalFormula('=B2', grid), 40);
  assert.equal(evalFormula('=A1+B1', grid), 30);
});

test('evalFormula: out-of-bounds reference returns 0', () => {
  const grid = [['5']];
  assert.equal(evalFormula('=Z9', grid), 0);
  assert.equal(evalFormula('=A9', grid), 0);
});

test('evalFormula: chained formula reference', () => {
  // C1 = =A1+B1, and we reference C1 from another formula
  const grid = [['10', '20', '=A1+B1']];
  assert.equal(evalFormula('=C1', grid), 30);
});

// ─── evalFormula — SUM ────────────────────────────────────────────────────────

test('SUM: column range', () => {
  const grid = [['10'], ['20'], ['30']];
  assert.equal(evalFormula('=SUM(A1:A3)', grid), 60);
});

test('SUM: row range', () => {
  const grid = [['10', '20', '30']];
  assert.equal(evalFormula('=SUM(A1:C1)', grid), 60);
});

test('SUM: 2D range', () => {
  const grid = [['1', '2'], ['3', '4']];
  assert.equal(evalFormula('=SUM(A1:B2)', grid), 10);
});

test('SUM: empty cells treated as 0', () => {
  const grid = [['10'], [''], ['30']];
  assert.equal(evalFormula('=SUM(A1:A3)', grid), 40);
});

test('SUM: individual cell args', () => {
  const grid = [['5', '10', '15']];
  assert.equal(evalFormula('=SUM(A1,B1,C1)', grid), 30);
});

// ─── evalFormula — AVG / AVERAGE ─────────────────────────────────────────────

test('AVG: basic average', () => {
  const grid = [['10'], ['20'], ['30']];
  assert.equal(evalFormula('=AVG(A1:A3)', grid), 20);
  assert.equal(evalFormula('=AVERAGE(A1:A3)', grid), 20);
});

test('AVG: empty range returns 0', () => {
  const grid = [[''], [''], ['']]
  assert.equal(evalFormula('=AVG(A1:A3)', grid), 0);
});

// ─── evalFormula — MIN / MAX ──────────────────────────────────────────────────

test('MIN/MAX: basic', () => {
  const grid = [['5'], ['2'], ['8'], ['1']];
  assert.equal(evalFormula('=MIN(A1:A4)', grid), 1);
  assert.equal(evalFormula('=MAX(A1:A4)', grid), 8);
});

// ─── evalFormula — COUNT ──────────────────────────────────────────────────────

test('COUNT: counts numeric cells only', () => {
  const grid = [['10'], ['hello'], [''], ['30']];
  assert.equal(evalFormula('=COUNT(A1:A4)', grid), 2);
});

// ─── evalFormula — ABS / ROUND ────────────────────────────────────────────────

test('ABS: negative number', () => {
  const grid = [['-42']];
  assert.equal(evalFormula('=ABS(A1)', grid), 42);
  assert.equal(evalFormula('=ABS(-7)', grid), 7);
});

test('ROUND: rounds to given decimal places', () => {
  const grid = [];
  assert.equal(evalFormula('=ROUND(3.14159,2)', grid), 3.14);
  assert.equal(evalFormula('=ROUND(2.5,0)', grid), 3);
});

// ─── Arithmetic operators (README: +, -, *, /, grouped) ───────────────────────

test('arithmetic: subtraction', () => {
  const grid = [['500', '200']];
  assert.equal(evalFormula('=A1-B1', grid), 300);
});

test('arithmetic: division', () => {
  const grid = [['100', '4']];
  assert.equal(evalFormula('=A1/B1', grid), 25);
});

test('arithmetic: grouped expression respects precedence', () => {
  const grid = [['2', '3', '4']];
  assert.equal(evalFormula('=(A1+B1)*C1', grid), 20); // (2+3)*4
  assert.equal(evalFormula('=A1+B1*C1', grid), 14);   // 2+3*4 (no grouping)
});

// ─── Mixed formulas (README examples) ────────────────────────────────────────

test('mixed: function result multiplied by literal', () => {
  const grid = [['10'], ['20'], ['30']];
  assert.equal(evalFormula('=SUM(A1:A3)*1.1', grid), 66); // 60*1.1
});

test('mixed: cell ref added to function result', () => {
  const grid = [['5', '10', '20']];
  assert.equal(evalFormula('=A1+SUM(B1:C1)', grid), 35); // 5+(10+20)
});

test('mixed: nested functions — ROUND wrapping AVG', () => {
  const grid = [['10'], ['20'], ['17']];
  assert.equal(evalFormula('=ROUND(AVG(A1:A3), 0)', grid), 16); // avg=15.666… → 16
});

test('ABS: works with literal negative and cell ref', () => {
  const grid = [['-7']];
  assert.equal(evalFormula('=ABS(-7)', grid), 7);
  assert.equal(evalFormula('=ABS(A1)', grid), 7); // cell contains -7
});

// ─── README budget example ────────────────────────────────────────────────────

test('README budget: remaining = budget - spent', () => {
  // | {calc} | Category | Budget | Spent | Remaining |
  // A=Category, B=Budget, C=Spent, D=Remaining
  const grid = [
    ['LLC setup', '500', '200', '=B1-C1'],
    ['Dev tools', '200', '99',  '=B2-C2'],
    ['Marketing', '300', '0',   '=B3-C3'],
    ['Total',     '=SUM(B1:B3)', '=SUM(C1:C3)', '=SUM(D1:D3)'],
  ];
  assert.equal(evalFormula('=B1-C1', grid), 300);
  assert.equal(evalFormula('=B2-C2', grid), 101);
  assert.equal(evalFormula('=B3-C3', grid), 300);
  assert.equal(evalFormula('=SUM(B1:B3)', grid), 1000);
  assert.equal(evalFormula('=SUM(C1:C3)', grid), 299);
  assert.equal(evalFormula('=SUM(D1:D3)', grid), 701);
});

test('README sales: revenue and tax columns', () => {
  // A=Product, B=Price, C=Units, D=Revenue, E=Tax
  const grid = [
    ['Widget', '29', '12', '=B1*C1', '=D1*0.1'],
    ['Gadget', '49', '7',  '=B2*C2', '=D2*0.1'],
    ['Totals', '',   '',   '=SUM(D1:D2)', '=SUM(E1:E2)'],
  ];
  assert.equal(evalFormula('=B1*C1', grid), 348);    // 29*12
  assert.equal(evalFormula('=B2*C2', grid), 343);    // 49*7
  assert.equal(evalFormula('=D1*0.1', grid), 34.8);  // 348*0.1
  assert.equal(evalFormula('=D2*0.1', grid), 34.3);  // 343*0.1
  assert.equal(evalFormula('=SUM(D1:D2)', grid), 691);
});

// ─── evalFormula — exponent operator ─────────────────────────────────────────

test('exponent: ^ translates to power', () => {
  const grid = [['2', '3']];
  assert.equal(evalFormula('=2^3', grid), 8);
  assert.equal(evalFormula('=A1^B1', grid), 8);
  assert.equal(evalFormula('=2^3+1', grid), 9);
  assert.equal(evalFormula('=(1+1)^3', grid), 8);
});

// ─── evalFormula — new math functions ────────────────────────────────────────

test('SQRT: basic and negative input errors', () => {
  const grid = [['16']];
  assert.equal(evalFormula('=SQRT(A1)', grid), 4);
  assert.equal(evalFormula('=SQRT(16)', grid), 4);
  assert.equal(evalFormula('=SQRT(-4)', grid), '#ERR');
});

test('POW/POWER: exponentiation', () => {
  const grid = [['2', '10']];
  assert.equal(evalFormula('=POW(A1,3)', grid), 8);
  assert.equal(evalFormula('=POWER(2,10)', grid), 1024);
});

test('MOD: remainder and divide-by-zero error', () => {
  const grid = [];
  assert.equal(evalFormula('=MOD(10,3)', grid), 1);
  assert.equal(evalFormula('=MOD(10,0)', grid), '#ERR');
});

test('MEDIAN: odd and even counts', () => {
  const grid = [['1'], ['3'], ['2']];
  assert.equal(evalFormula('=MEDIAN(A1:A3)', grid), 2);
  const grid2 = [['1'], ['2'], ['3'], ['4']];
  assert.equal(evalFormula('=MEDIAN(A1:A4)', grid2), 2.5);
  assert.equal(evalFormula('=MEDIAN(A1:A1)', []), 0);
});

test('PRODUCT: multiplies range', () => {
  const grid = [['2'], ['3'], ['4']];
  assert.equal(evalFormula('=PRODUCT(A1:A3)', grid), 24);
});

test('FLOOR/CEIL/CEILING/TRUNC/INT/SIGN', () => {
  const grid = [['3.7']];
  assert.equal(evalFormula('=FLOOR(A1)', grid), 3);
  assert.equal(evalFormula('=CEIL(A1)', grid), 4);
  assert.equal(evalFormula('=CEILING(A1)', grid), 4);
  assert.equal(evalFormula('=INT(A1)', grid), 3);
  assert.equal(evalFormula('=TRUNC(3.14159,2)', []), 3.14);
  assert.equal(evalFormula('=SIGN(-5)', []), -1);
  assert.equal(evalFormula('=SIGN(5)', []), 1);
  assert.equal(evalFormula('=SIGN(0)', []), 0);
});

test('EXP/LOG/LOG10/PI', () => {
  assert.equal(evalFormula('=LOG10(100)', []), 2);
  assert.equal(evalFormula('=LOG(8,2)', []), 3);
  assert.equal(evalFormula('=ROUND(PI(),2)', []), 3.14);
  assert.equal(evalFormula('=ROUND(EXP(1),2)', []), 2.72);
});

test('STDEV/VAR: sample statistics', () => {
  const grid = [['2'], ['4'], ['4'], ['4'], ['5'], ['5'], ['7'], ['9']];
  assert.equal(evalFormula('=ROUND(VAR(A1:A8),2)', grid), 4.57);
  assert.equal(evalFormula('=ROUND(STDEV(A1:A8),2)', grid), 2.14);
  assert.equal(evalFormula('=STDEV(A1:A1)', [['5']]), 0);
});

test('COUNTA: counts non-empty cells including text', () => {
  const grid = [['10'], ['hello'], [''], ['30']];
  assert.equal(evalFormula('=COUNTA(A1:A4)', grid), 3);
});

test('mixed: new functions nest and combine with arithmetic', () => {
  const grid = [['9', '16']];
  assert.equal(evalFormula('=SQRT(A1)+SQRT(B1)', grid), 7); // 3+4
  assert.equal(evalFormula('=MOD(A1,4)^2', grid), 1); // 9 mod 4 = 1, 1^2 = 1
});

// ─── evalFormula — floating point precision ──────────────────────────────────

test('floating point: classic binary drift in addition is snapped away', () => {
  // 0.1 + 0.2 === 0.30000000000000004 in raw JS arithmetic.
  assert.equal(evalFormula('=0.1+0.2', []), 0.3);
  assert.equal(evalFormula('=19.99+5.01', []), 25);
  assert.equal(evalFormula('=0.1+0.2-0.3', []), 0);
});

test('floating point: SUM of currency-like values avoids drift', () => {
  const grid = [['19.99'], ['5.01'], ['0.01']];
  assert.equal(evalFormula('=SUM(A1:A3)', grid), 25.01);
});

test('floating point: ROUND fixes the classic 1.005 rounding bug', () => {
  // Math.round(1.005 * 100) / 100 === 1 in naive JS (1.005*100 === 100.49999999999999).
  assert.equal(evalFormula('=ROUND(1.005,2)', []), 1.01);
  assert.equal(evalFormula('=ROUND(1.015,2)', []), 1.02);
  assert.equal(evalFormula('=ROUND(1.45,1)', []), 1.5);
});

test('floating point: ROUND ties break away from zero, not toward +Infinity', () => {
  // Math.round(-2.5) === -2 in raw JS; spreadsheets round half away from zero.
  assert.equal(evalFormula('=ROUND(-2.5,0)', []), -3);
  assert.equal(evalFormula('=ROUND(2.5,0)', []), 3);
  assert.equal(evalFormula('=ROUND(-1.005,2)', []), -1.01);
});

test('floating point: ROUND supports negative decimal places', () => {
  assert.equal(evalFormula('=ROUND(1234,-2)', []), 1200);
  assert.equal(evalFormula('=ROUND(1250,-2)', []), 1300);
});

test('floating point: TRUNC truncates without rounding, including negatives', () => {
  assert.equal(evalFormula('=TRUNC(8.9,0)', []), 8);
  assert.equal(evalFormula('=TRUNC(-8.9,0)', []), -8);
  assert.equal(evalFormula('=TRUNC(3.14159,2)', []), 3.14);
});

test('floating point: negative zero normalizes to 0', () => {
  const zero = evalFormula('=0*-1', []);
  assert.equal(Object.is(zero, -0), false);
  assert.equal(zero, 0);
  assert.equal(evalFormula('=-0+0', []), 0);
});

// ─── evalFormula — scientific notation ───────────────────────────────────────

test('scientific notation: tiny function results no longer error out', () => {
  // ABS(-0.0000001) === 1e-7, and JS stringifies that as "1e-7" — embedding
  // that back into the expression used to fail the safe-math whitelist.
  assert.equal(evalFormula('=ABS(-0.0000001)', []), 0.0000001);
});

test('scientific notation: tiny/huge cell references no longer error out', () => {
  const grid = [['0.0000001', '3000000000000000000000']];
  assert.equal(evalFormula('=A1+0', grid), 0.0000001);
  assert.equal(evalFormula('=B1/3', grid), 1e21);
});

test('scientific notation: literal exponent syntax in a formula', () => {
  assert.equal(evalFormula('=1e3+1', []), 1001);
  assert.equal(evalFormula('=2.5E2', []), 250);
});

// ─── evalFormula — parseFloat gotchas ────────────────────────────────────────

test('parseFloat gotcha: literal "Infinity" text is not numeric', () => {
  const grid = [['Infinity'], ['10']];
  assert.equal(evalFormula('=SUM(A1:A2)', grid), 10); // "Infinity" contributes 0, not Infinity
  assert.equal(evalFormula('=COUNT(A1:A2)', grid), 1);
  assert.equal(evalFormula('=A1+5', grid), 5); // text cell treated as 0, not Infinity
});

test('parseFloat gotcha: comma thousands separators are not silently truncated', () => {
  // parseFloat('1,234') === 1 in raw JS — silently wrong rather than erroring.
  // We now treat the whole cell as non-numeric text instead of guessing 1.
  const grid = [['1,234'], ['10']];
  assert.equal(evalFormula('=SUM(A1:A2)', grid), 10);
  assert.equal(evalFormula('=COUNT(A1:A2)', grid), 1);
});

test('parseFloat gotcha: trailing garbage is not partially parsed', () => {
  const grid = [['5 apples']];
  assert.equal(evalFormula('=A1', grid), 0);
  assert.equal(evalFormula('=COUNT(A1:A1)', grid), 0);
});

// ─── evalFormula — robustness against runtime exceptions ────────────────────

test('robustness: MIN/MAX over a large range does not stack-overflow', () => {
  const grid = Array.from({ length: 5000 }, (_, i) => [String(i)]);
  assert.equal(evalFormula('=MAX(A1:A5000)', grid), 4999);
  assert.equal(evalFormula('=MIN(A1:A5000)', grid), 0);
  assert.equal(evalFormula('=SUM(A1:A5000)', grid), (4999 * 5000) / 2);
});

test('robustness: malformed expressions return #ERR instead of throwing', () => {
  assert.equal(evalFormula('=)(', []), '#ERR');
  assert.equal(evalFormula('=1+', []), '#ERR');
  assert.equal(evalFormula('=', []), '#ERR');
});

// ─── formatResult ─────────────────────────────────────────────────────────────

test('formatResult: integers stay integers', () => {
  assert.equal(formatResult(42), '42');
  assert.equal(formatResult(0), '0');
});

test('formatResult: floats trimmed to 6 decimal places', () => {
  assert.equal(formatResult(3.141592653589793), '3.141593');
});

test('formatResult: error strings pass through', () => {
  assert.equal(formatResult('#ERR'), '#ERR');
  assert.equal(formatResult('#NAME?'), '#NAME?');
});


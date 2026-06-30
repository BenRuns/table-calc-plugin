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


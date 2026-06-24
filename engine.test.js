'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRef, evalFormula, formatResult, parseCells, analyzeTable } = require('./engine');

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

// ─── parseCells ───────────────────────────────────────────────────────────────

test('parseCells: basic row', () => {
  const cells = parseCells(0, '| foo | bar | baz |');
  assert.equal(cells.length, 3);
  assert.equal(cells[0].trimmed, 'foo');
  assert.equal(cells[1].trimmed, 'bar');
  assert.equal(cells[2].trimmed, 'baz');
});

test('parseCells: document positions are correct', () => {
  // "| foo | bar |"
  //  0123456789...
  // 'foo' starts at index 2 (after "| ")
  const cells = parseCells(0, '| foo | bar |');
  assert.equal(cells[0].from, 2);
  assert.equal(cells[0].to, 5);   // 'foo' is 3 chars
  assert.equal(cells[1].from, 8); // after "| foo | "
});

test('parseCells: with non-zero lineFrom offset', () => {
  const offset = 100;
  const cells = parseCells(offset, '| 42 | 99 |');
  assert.equal(cells[0].from, offset + 2);
  assert.equal(cells[0].trimmed, '42');
});

// ─── analyzeTable ─────────────────────────────────────────────────────────────

function makeLines(rawLines) {
  // Build fake CM6-style line objects with { text, from }
  let pos = 0;
  return rawLines.map(text => {
    const line = { text, from: pos };
    pos += text.length + 1; // +1 for newline
    return line;
  });
}

// ── Without {calc} marker (legacy / plain tables) ────────────────────────────

test('analyzeTable: finds formula cells and evaluates them', () => {
  const lines = makeLines([
    '| Item   | Cost |',
    '|--------|------|',
    '| Filing | 200  |',
    '| Apple  | 99   |',
    '| Total  | =SUM(B1:B2) |',
  ]);
  const cells = analyzeTable(lines);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].formula, '=SUM(B1:B2)');
  assert.equal(cells[0].value, 299);
});

test('analyzeTable: arithmetic formula across columns', () => {
  const lines = makeLines([
    '| Item | Price | Qty | Total  |',
    '|------|-------|-----|--------|',
    '| Foo  | 10    | 3   | =B1*C1 |',
  ]);
  const cells = analyzeTable(lines);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].value, 30);
});

test('analyzeTable: multiple formulas in same table', () => {
  const lines = makeLines([
    '| A  | B  | C           |',
    '|----|----|----|',
    '| 5  | 10 | =A1+B1      |',
    '| 3  | 7  | =A2+B2      |',
    '|    |    | =SUM(C1:C2) |',
  ]);
  const cells = analyzeTable(lines);
  assert.equal(cells.length, 3);
  assert.equal(cells[0].value, 15);
  assert.equal(cells[1].value, 10);
  assert.equal(cells[2].value, 25);
});

test('analyzeTable: no formulas returns empty array', () => {
  const lines = makeLines([
    '| Name | Cost |',
    '|------|------|',
    '| LLC  | 200  |',
  ]);
  assert.deepEqual(analyzeTable(lines), []);
});

test('analyzeTable: table with fewer than 3 lines produces no formula cells', () => {
  const lines = makeLines([
    '| A | B |',
    '|---|---|',
  ]);
  assert.deepEqual(analyzeTable(lines), []);
});

// ── With {calc} marker column ─────────────────────────────────────────────────
// The {calc} header is the row-number column. It is excluded from the grid,
// so column A = first real data column, B = second, etc.

test('analyzeTable {calc}: skips marker column, A starts at second DOM column', () => {
  const lines = makeLines([
    '| {calc} | Item   | Cost |',
    '|--------|--------|------|',
    '|        | Filing | 200  |',
    '|        | Apple  | 99   |',
    '|        | Total  | =SUM(B1:B2) |',
  ]);
  const cells = analyzeTable(lines);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].formula, '=SUM(B1:B2)');
  assert.equal(cells[0].value, 299); // B col = Cost: 200+99
});

test('analyzeTable {calc}: price * qty formula using correct column letters', () => {
  const lines = makeLines([
    '| {calc} | Item | Price | Qty | Total  |',
    '|--------|------|-------|-----|--------|',
    '|        | LLC  | 200   | 1   | =B1*C1 |',
    '|        | Dev  | 99    | 1   | =B2*C2 |',
    '|        |      |       |     | =SUM(D1:D2) |',
  ]);
  const cells = analyzeTable(lines);
  assert.equal(cells.length, 3);
  assert.equal(cells[0].value, 200);  // =B1*C1 → 200*1
  assert.equal(cells[1].value, 99);   // =B2*C2 → 99*1
  assert.equal(cells[2].value, 299);  // =SUM(D1:D2) → 200+99
});

test('analyzeTable {calc}: SUM references correct column not the marker column', () => {
  // D is the 4th data column (index 3), NOT the {calc} col
  const lines = makeLines([
    '| {calc} | A  | B  | C  | D           |',
    '|--------|----|----|----|----|',
    '|        | 1  | 2  | 3  | =SUM(A1:C1) |',
  ]);
  const cells = analyzeTable(lines);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].value, 6); // 1+2+3
});

test('analyzeTable {calc}: chained formulas across rows', () => {
  const lines = makeLines([
    '| {calc} | Cost | Tax     | Total   |',
    '|--------|------|---------|---------|',
    '|        | 100  | =A1*0.1 | =A1+B1  |',
    '|        | 200  | =A2*0.1 | =A2+B2  |',
    '|        |      |         | =SUM(C1:C2) |',
  ]);
  const cells = analyzeTable(lines);
  assert.equal(cells[0].value, 10);   // =A1*0.1 → 100*0.1
  assert.equal(cells[1].value, 110);  // =A1+B1  → 100+10
  assert.equal(cells[2].value, 20);   // =A2*0.1 → 200*0.1
  assert.equal(cells[3].value, 220);  // =A2+B2  → 200+20
  assert.equal(cells[4].value, 330);  // =SUM(C1:C2) → 110+220
});

test('analyzeTable {calc}: plain table without marker is unaffected', () => {
  // Without {calc}, col 0 is A — behaviour unchanged
  const lines = makeLines([
    '| Cost | Qty | Total  |',
    '|------|-----|--------|',
    '| 10   | 5   | =A1*B1 |',
  ]);
  const cells = analyzeTable(lines);
  assert.equal(cells[0].value, 50); // A1=10, B1=5
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { JSDOM } = require('jsdom');

// src/main.js does require('obsidian') at load time; that module only
// exists inside the real Obsidian app. Intercept resolution so this file
// can load src/main.js under plain Node for DOM-level regression tests.
const mockObsidian = {
  Plugin: class Plugin {},
  PluginSettingTab: class PluginSettingTab {},
  Setting: class Setting {},
  MarkdownView: class MarkdownView {},
  Notice: class Notice {},
};
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'obsidian') return mockObsidian;
  return originalLoad.apply(this, [request, ...args]);
};

const TableCalcPlugin = require('./src/main');
const { processTable } = TableCalcPlugin;

// Obsidian injects a global createEl(tag, attrs) helper and patches it onto
// Element.prototype too; decorateTable() relies on both. Provide a minimal
// stand-in scoped to a given JSDOM instance so tests can run under plain Node.
function shimObsidianDomHelpers(dom) {
  const { document, HTMLElement } = dom.window;
  function applyAttrs(el, attrs = {}) {
    if (attrs.cls) el.className = Array.isArray(attrs.cls) ? attrs.cls.join(' ') : attrs.cls;
    if (attrs.text) el.textContent = attrs.text;
    return el;
  }
  global.createEl = (tag, attrs) => applyAttrs(document.createElement(tag), attrs);
  HTMLElement.prototype.createEl = function (tag, attrs) {
    const el = applyAttrs(document.createElement(tag), attrs);
    this.appendChild(el);
    return el;
  };
}

// Builds a minimal calc-table DOM matching what Obsidian renders for a
// markdown table, wrapped in the container class processTable() uses to
// distinguish Reading View from Live Preview: .cm-editor is CodeMirror's
// editor root, present only in Live Preview/Source Mode — Reading View
// never uses CodeMirror. (.markdown-reading-view is deliberately NOT used
// here to tell the two apart: Live Preview's table widget is rendered via
// the same internal HTML pipeline as Reading View and can carry that class
// too, which is exactly the bug this fixture exists to catch regressions of.)
function makeCalcTable(dom, { reading }) {
  const { document } = dom.window;
  const container = document.createElement('div');
  container.className = reading ? 'markdown-reading-view' : 'cm-editor markdown-reading-view';
  // Header row uses <th> (as Obsidian's real markdown table renderer does),
  // since processTable's dataRows filter (r => r.querySelector('td')) relies
  // on that to exclude the header row from the formula-reference grid.
  container.innerHTML = `
    <table>
      <thead><tr><th>Operation</th><th>Val A</th><th>Val B</th><th>Result</th></tr></thead>
      <tbody><tr><td>add</td><td>10</td><td>5</td><td>=B1+C1</td></tr></tbody>
    </table>
  `;
  document.body.appendChild(container);
  const tableEl = container.querySelector('table');
  // Simulate an already-detected {{calc}} marker so the test isn't also
  // exercising marker-detection (covered separately by hasCalcMarker logic).
  tableEl.dataset.tableCalcMarked = 'true';
  return tableEl;
}

test('Reading View: processTable replaces formula text with the computed value', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  const tableEl = makeCalcTable(dom, { reading: true });
  // Capture the reference before processing: decorateTable() prepends a
  // column-letter header row, which would shift row indices queried after.
  const resultCell = tableEl.querySelectorAll('tr')[1].querySelectorAll('td')[3];

  processTable(tableEl, { copyFormat: 'csv', copyContent: 'values' }, 'test.md');

  assert.equal(resultCell.textContent.trim(), '15');
  assert.equal(resultCell.getAttribute('data-formula'), '=B1+C1');
});

test("Live Preview: processTable never mutates a formula cell's text or child nodes", () => {
  // Regression test. An earlier version replaced td.textContent with the
  // computed value in Live Preview too, the same as Reading View. Obsidian's
  // LP table cells are natively click-to-edit and CM6 maps clicks to source
  // positions by walking the cell's actual rendered text — any change to
  // that text (length or content) desyncs the mapping and corrupts editing.
  // Confirmed via live testing: doing this produced a cell containing both
  // the stale old value and the newly typed formula concatenated together,
  // and the table never recovered without reopening the file. This must
  // never regress: in Live Preview, cell text/structure must stay untouched
  // and the computed value must only be surfaced non-destructively (a
  // tooltip + color class, not inline content — see the next test).
  const dom = new JSDOM('<!doctype html><body></body>');
  const tableEl = makeCalcTable(dom, { reading: false });

  const formulaCell = tableEl.querySelectorAll('tr')[1].querySelectorAll('td')[3];
  const textBefore = formulaCell.textContent;
  const childCountBefore = formulaCell.childNodes.length;

  processTable(tableEl, { copyFormat: 'csv', copyContent: 'values' }, 'test.md');

  assert.equal(formulaCell.textContent, textBefore, 'Live Preview must not rewrite cell text');
  assert.equal(
    formulaCell.childNodes.length,
    childCountBefore,
    'Live Preview must not add/remove child nodes',
  );
  assert.equal(formulaCell.getAttribute('data-formula'), '=B1+C1');
});

test('Live Preview: computed value is surfaced via tooltip, not inline content', () => {
  // A CSS ::after approach was also tried and reverted: it overflowed
  // Obsidian's fixed-height Live Preview table cells and visually bled into
  // neighboring rows. The tooltip (title attribute) is the safe mechanism —
  // rendered by the browser in its own overlay layer, outside page flow.
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  const tableEl = makeCalcTable(dom, { reading: false });
  // Captured before processing: decorateTable() now also runs in Live
  // Preview (see next test) and prepends a row-number cell, which would
  // shift this index if queried afterward.
  const formulaCell = tableEl.querySelectorAll('tr')[1].querySelectorAll('td')[3];

  processTable(tableEl, { copyFormat: 'csv', copyContent: 'values' }, 'test.md');

  assert.ok(formulaCell.title.includes('15'), 'computed value should appear in the tooltip');
  assert.ok(formulaCell.classList.contains('table-calc-lp-formula'));
});

test('Live Preview: processTable inserts column-header/row-number decoration', () => {
  // decorateTable() only inserts brand-new elements — it never rewrites
  // existing cell text, so it doesn't carry the cursor-mapping risk that
  // ruled out text replacement in Live Preview (see the two tests above).
  // Confirmed via live testing: this ran in Live Preview once already (by
  // an earlier, unrelated bug) and rendered/persisted fine.
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  const tableEl = makeCalcTable(dom, { reading: false });

  processTable(tableEl, { copyFormat: 'csv', copyContent: 'values' }, 'test.md');

  assert.ok(
    tableEl.querySelector('.table-calc-col-headers'),
    'column-letter header row should be added',
  );
  assert.ok(tableEl.querySelector('.table-calc-corner'), 'corner cell(s) should be added');
});

test('Live Preview: a second pass after decoration does not shift column references', () => {
  // Regression test. Unlike Reading View, Live Preview has no 'done'-and-
  // undecorated short-circuit (a formula cell always shows raw text there,
  // so that signal can't be used to skip re-processing) — it recomputes the
  // grid on every observed mutation. decorateTable() prepends a row-number
  // <td> to every data row and — critically — that cell persists across
  // passes. Without explicitly excluding it from the grid, the second pass
  // would count it as real data and shift every column reference over by
  // one, silently corrupting formula results.
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  const tableEl = makeCalcTable(dom, { reading: false });
  const formulaCell = tableEl.querySelectorAll('tr')[1].querySelectorAll('td')[3];

  processTable(tableEl, { copyFormat: 'csv', copyContent: 'values' }, 'test.md'); // first pass: adds decoration
  processTable(tableEl, { copyFormat: 'csv', copyContent: 'values' }, 'test.md'); // second pass: must not re-shift

  assert.ok(
    formulaCell.title.includes('15'),
    'B1+C1 should still resolve to 15, not shift to reference the row-label/text columns',
  );
});

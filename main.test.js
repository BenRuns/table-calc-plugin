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

// ─── {{calc}} scoping: the marker applies only to the table right after it ───

const { hasCalcMarker } = TableCalcPlugin;

// A plugin instance with just enough of Obsidian's Plugin/App surface for
// onload(), reprocess() and buildFingerprints() to run under plain Node.
function makePlugin(source = '', leaves = []) {
  const plugin = new TableCalcPlugin();
  plugin.app = {
    vault: { cachedRead: async () => source },
    workspace: {
      on: () => {},
      iterateAllLeaves: () => {},
      getActiveViewOfType: () => null,
      getLeavesOfType: () => leaves,
    },
  };
  plugin.loadData = async () => ({});
  plugin.addSettingTab = () => {};
  plugin.registerEvent = () => {};
  plugin.addCommand = () => {};
  plugin.registerMarkdownPostProcessor = (fn) => {
    plugin.postProcessor = fn;
  };
  return plugin;
}

function tableHtml(header) {
  return (
    `<table><thead><tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr></thead>` +
    '<tbody><tr><td>1</td><td>=A1+1</td></tr></tbody></table>'
  );
}

test("fingerprint fallback: a plain table sharing a calc table's header is not treated as calc", async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  const plugin = makePlugin(
    [
      '{{calc}}',
      '',
      '| Name | Score |',
      '| --- | --- |',
      '| a | =1+1 |',
      '',
      '| Name | Score |',
      '| --- | --- |',
      '| b | =2+2 |',
      '',
      '{{calc}}',
      '',
      '| Item | Cost |',
      '| --- | --- |',
      '| c | =3+3 |',
    ].join('\n'),
  );
  await plugin.buildFingerprints({ path: 'scope.md' });

  const { document } = dom.window;
  document.body.innerHTML = `<div>${tableHtml(['Name', 'Score'])}</div><div>${tableHtml(['Item', 'Cost'])}</div>`;
  const [ambiguous, unique] = document.querySelectorAll('table');
  assert.equal(hasCalcMarker(ambiguous, 'scope.md'), false);
  assert.equal(hasCalcMarker(unique, 'scope.md'), true);
});

test('post-processor: a {{calc}} in a section marks only the table right after it', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  const plugin = makePlugin();
  await plugin.onload();

  const el = dom.window.document.createElement('div');
  el.innerHTML = `<p>{{calc}}</p>${tableHtml(['A', 'B'])}<p>More text</p>${tableHtml(['C', 'D'])}`;
  dom.window.document.body.appendChild(el);
  plugin.postProcessor(el, { sourcePath: 'x.md', getSectionInfo: () => null });

  const [first, second] = el.querySelectorAll('table');
  assert.equal(first.dataset.tableCalc, 'done');
  assert.equal(second.dataset.tableCalc, 'skip');
});

test('reprocess: {{calc}} followed by non-table content does not leak onto a later table', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  const plugin = makePlugin();

  const { document } = dom.window;
  document.body.innerHTML = `<div><p>{{calc}}</p><p>Some prose</p></div><div>${tableHtml(['A', 'B'])}</div>`;
  plugin.reprocess(document.body, null);

  assert.equal(document.querySelector('table').dataset.tableCalc, 'skip');
});

test("reprocess: {{calc}} as the last child of its block still marks the next block's table", () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  const plugin = makePlugin();

  const { document } = dom.window;
  document.body.innerHTML = `<div><p>{{calc}}</p></div><div>${tableHtml(['A', 'B'])}</div>`;
  plugin.reprocess(document.body, null);

  assert.equal(document.querySelector('table').dataset.tableCalc, 'done');
});

// ─── Removing {{calc}} un-styles a table that was already evaluated ───────────

const { revalidateTables } = TableCalcPlugin;

// Minimal stand-in for the CM6 EditorView a Live Preview table lives in:
// every DOM position maps to `tableLine`, and the doc is `lines`.
function fakeEditorView(dom, lines, tableLine) {
  return {
    dom,
    posAtDOM: () => 0,
    state: {
      doc: {
        lineAt: () => ({ number: tableLine }),
        line: (n) => ({ text: lines[n - 1] }),
      },
    },
  };
}

test('Reading View: deleting {{calc}} restores an evaluated table to plain markdown', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  const plugin = makePlugin();
  const { document } = dom.window;
  document.body.innerHTML = `<div id="m"><p>{{calc}}</p></div><div>${tableHtml(['A', 'B'])}</div>`;
  plugin.reprocess(document.body, null);
  const table = document.querySelector('table');
  assert.equal(table.dataset.tableCalc, 'done');

  // Obsidian swaps the marker's section out but reuses the table's section.
  document.getElementById('m').outerHTML = '<div><h2>Heading</h2></div>';
  revalidateTables(document.body);

  assert.equal(table.dataset.tableCalc, 'skip');
  assert.equal(table.dataset.tableCalcMarked, undefined);
  assert.equal(table.querySelector('.table-calc-col-headers'), null);
  assert.equal(table.querySelectorAll('td')[1].textContent, '=A1+1');
});

test('Live Preview: deleting {{calc}} un-styles the table even though its widget is reused', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  const { document } = dom.window;
  const editor = document.createElement('div');
  editor.className = 'cm-editor';
  editor.innerHTML = tableHtml(['A', 'B']);
  document.body.appendChild(editor);
  const table = editor.querySelector('table');

  const lines = ['{{calc}}', '', '| A | B |', '| - | - |', '| 1 | =A1+1 |'];
  const leaf = {
    view: { contentEl: document.body, editor: { cm: fakeEditorView(editor, lines, 3) } },
  };
  const plugin = makePlugin('', [leaf]);
  await plugin.onload();

  processTable(table, plugin.settings, 'x.md');
  assert.equal(table.dataset.tableCalc, 'done');

  lines[0] = 'Some prose';
  processTable(table, plugin.settings, 'x.md');

  assert.equal(table.dataset.tableCalc, 'skip');
  assert.equal(table.querySelector('.table-calc-col-headers'), null);
  const formulaCell = table.querySelectorAll('td')[1];
  assert.equal(formulaCell.className, '');
  assert.equal(formulaCell.title, '');
});

test('onunload: fully restores evaluated tables so a reload re-detects markers', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  shimObsidianDomHelpers(dom);
  global.document = dom.window.document;
  try {
    const plugin = makePlugin();
    await plugin.onload();
    document.body.innerHTML = `<div><p>{{calc}}</p></div><div>${tableHtml(['A', 'B'])}</div>`;
    plugin.reprocess(document.body, null);
    const table = document.querySelector('table');
    assert.equal(table.dataset.tableCalc, 'done');

    plugin.onunload();

    assert.equal(table.dataset.tableCalc, undefined);
    assert.equal(table.dataset.tableCalcMarked, undefined);
    assert.equal(table.querySelector('.table-calc-col-headers'), null);
    assert.equal(table.querySelectorAll('td')[1].textContent, '=A1+1');
    assert.equal(document.querySelector('p').style.display, '');
  } finally {
    delete global.document;
  }
});

// ─── {{calc}} directly above a table gets the blank line Obsidian needs ──────

const { insertBlankAfterCalcMarkers } = TableCalcPlugin;

test('blank line is inserted between {{calc}} and a table directly under it', () => {
  assert.equal(
    insertBlankAfterCalcMarkers('{{calc}}\n| A | B |\n| - | - |\n| 1 | =A1 |'),
    '{{calc}}\n\n| A | B |\n| - | - |\n| 1 | =A1 |',
  );
});

test('already-separated markers and markers not followed by a table are left alone', () => {
  const src = '{{calc}}\n\n| A |\n| - |\n\n{{calc}}\nSome prose\n\n{{calc}}';
  assert.equal(insertBlankAfterCalcMarkers(src), src);
});

test('inside a callout the inserted blank line stays quoted', () => {
  assert.equal(
    insertBlankAfterCalcMarkers('> [!note]\n> {{calc}}\n> | A |\n> | - |'),
    '> [!note]\n> {{calc}}\n>\n> | A |\n> | - |',
  );
});

test('{{calc}} inside a fenced code block is not touched', () => {
  const src = '```markdown\n{{calc}}\n| A |\n| - |\n```\n';
  assert.equal(insertBlankAfterCalcMarkers(src), src);
});

test('editor fix inserts the blank line as a single transaction at the marker line end', () => {
  const plugin = makePlugin();
  let value = 'Intro\n{{calc}}\n| A |\n| - |\n\n  {{calc}}\n| B |\n| - |';
  const calls = [];
  const editor = {
    getValue: () => value,
    transaction: (tx) => {
      calls.push(tx);
      value = insertBlankAfterCalcMarkers(value);
    },
  };
  plugin.fixAdjacentCalcMarkers(editor);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].changes, [
    { from: { line: 1, ch: 8 }, text: '\n' },
    { from: { line: 5, ch: 10 }, text: '\n' },
  ]);

  plugin.fixAdjacentCalcMarkers(editor);
  assert.equal(calls.length, 1, 'a second pass is a no-op');
});

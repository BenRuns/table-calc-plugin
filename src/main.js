'use strict';

const { Plugin, MarkdownView, Notice } = require('obsidian');
const { evalFormula, formatResult } = require('../engine');

// ─── Table Processing ─────────────────────────────────────────────────────────

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function decorateTable(tableEl) {
  const allRows    = Array.from(tableEl.querySelectorAll('tr'));
  const headerRows = allRows.filter(r => r.querySelector('th'));
  const dataRows   = allRows.filter(r => r.querySelector('td'));
  if (dataRows.length === 0) return;

  const dataCols = dataRows[0].querySelectorAll('td').length - 1;

  const colLetterRow = createEl('tr', { cls: 'table-calc-col-headers' });
  colLetterRow.createEl('th', { cls: 'table-calc-corner' });

  for (let c = 0; c < dataCols; c++) {
    colLetterRow.createEl('th', { cls: 'table-calc-col-label', text: LETTERS[c] || String(c + 1) });
  }

  const thead = tableEl.querySelector('thead');
  if (thead) {
    thead.insertBefore(colLetterRow, thead.firstChild);
  } else {
    tableEl.insertBefore(colLetterRow, tableEl.firstChild);
  }

  headerRows.forEach(row => {
    const firstTh = row.querySelector('th');
    if (firstTh) {
      firstTh.textContent = '';
      firstTh.className = 'table-calc-row-label table-calc-corner';
    }
  });

  dataRows.forEach((row, r) => {
    const firstTd = row.querySelector('td');
    if (firstTd) {
      firstTd.textContent = r + 1;
      firstTd.className = 'table-calc-row-label';
      firstTd.removeAttribute('data-formula');
    }
  });
}

function hasCalcMarker(tableEl) {
  const firstTh = tableEl.querySelector('th');
  return firstTh && firstTh.textContent.trim().toLowerCase() === '{calc}';
}

function processTable(tableEl) {
  if (tableEl.dataset.tableCalc === 'done') return;
  if (!hasCalcMarker(tableEl)) {
    tableEl.dataset.tableCalc = 'skip';
    return;
  }

  const allRows  = Array.from(tableEl.querySelectorAll('tr'));
  const dataRows = allRows.filter(r => r.querySelector('td'));
  if (dataRows.length === 0) return;

  const grid = dataRows.map(row =>
    Array.from(row.querySelectorAll('td')).slice(1).map(td => td.textContent.trim())
  );

  dataRows.forEach((row, r) => {
    Array.from(row.querySelectorAll('td')).slice(1).forEach((td, c) => {
      const text = td.textContent.trim();
      if (!text.startsWith('=')) return;
      const result = evalFormula(text, grid);
      const isErr = typeof result === 'string' && result.startsWith('#');
      td.setAttribute('data-formula', text);
      td.textContent = formatResult(result);
      td.classList.add(isErr ? 'table-calc-error-cell' : 'table-calc-cell');
      td.title = text;
    });
  });

  decorateTable(tableEl);
  tableEl.dataset.tableCalc = 'done';
}

function processEl(el) {
  el.querySelectorAll('table').forEach(processTable);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

class TableCalcPlugin extends Plugin {
  constructor(...args) {
    super(...args);
    this.observers = [];
  }

  async onload() {
    this.registerMarkdownPostProcessor((el) => {
      processEl(el);
    });

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        this.attachObserver(leaf);
      })
    );

    this.app.workspace.iterateAllLeaves(leaf => this.attachObserver(leaf));

    this.addCommand({
      id: 'evaluate',
      name: 'Evaluate table formulas in this note',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return false;
        if (!checking) {
          view.contentEl.querySelectorAll('table[data-table-calc]').forEach(t => {
            delete t.dataset.tableCalc;
          });
          processEl(view.contentEl);
          new Notice('Table Calc: formulas evaluated');
        }
        return true;
      }
    });
  }

  attachObserver(leaf) {
    if (!leaf || !leaf.view || !leaf.view.contentEl) return;
    const el = leaf.view.contentEl;
    if (el._tableCalcObserver) return;

    const observer = new MutationObserver((mutations) => {
      const tables = new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches('table')) {
            tables.add(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll('table').forEach(t => tables.add(t));
          }
        }
      }
      if (tables.size === 0) return;
      setTimeout(() => tables.forEach(t => {
        delete t.dataset.tableCalc;
        processTable(t);
      }), 100);
    });

    observer.observe(el, { childList: true, subtree: true });
    el._tableCalcObserver = observer;
    this.observers.push(observer);

    processEl(el);
  }

  onunload() {
    this.observers.forEach(o => o.disconnect());
    this.observers = [];
    document.querySelectorAll('[data-table-calc]').forEach(el => {
      delete el.dataset.tableCalc;
    });
  }
}

module.exports = TableCalcPlugin;

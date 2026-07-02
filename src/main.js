'use strict';

const { Plugin, PluginSettingTab, Setting, MarkdownView, Notice } = require('obsidian');
const { evalFormula, formatResult } = require('../engine');

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  copyFormat:  'csv',    // 'csv' | 'tsv'
  copyContent: 'values', // 'values' | 'formulas'
};

class TableCalcSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Copy format')
      .setDesc('File format used by the Copy button on calc tables.')
      .addDropdown(drop => drop
        .addOption('csv', 'CSV (comma-separated)')
        .addOption('tsv', 'TSV (tab-separated)')
        .setValue(this.plugin.settings.copyFormat)
        .onChange(async v => {
          this.plugin.settings.copyFormat = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Copy content')
      .setDesc(
        'Values — copies the computed result of each formula.\n' +
        'Formulas — copies the raw formula text (e.g. =SUM(B1:C1)). ' +
        'Paste into Google Sheets or Excel to re-evaluate.'
      )
      .addDropdown(drop => drop
        .addOption('values',   'Computed values')
        .addOption('formulas', 'Formulas (for spreadsheet import)')
        .setValue(this.plugin.settings.copyContent)
        .onChange(async v => {
          this.plugin.settings.copyContent = v;
          await this.plugin.saveSettings();
        })
      );
  }
}

// ─── Table Processing ─────────────────────────────────────────────────────────

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// mode: 'data' | 'headers' | 'all'
function tableToText(tableEl, settings, mode = 'data') {
  const sep = settings.copyFormat === 'tsv' ? '\t' : ',';
  const useFormulas = settings.copyContent === 'formulas';

  function encode(raw) {
    const bad = settings.copyFormat === 'tsv'
      ? (s) => s.includes('\t') || s.includes('"') || s.includes('\n')
      : (s) => s.includes(',')  || s.includes('"') || s.includes('\n');
    if (bad(raw)) return '"' + raw.replace(/"/g, '""') + '"';
    return raw;
  }

  const rows = [];
  Array.from(tableEl.querySelectorAll('tr')).forEach(row => {
    if (row.classList.contains('table-calc-col-headers')) return;
    const isHeader = !!row.querySelector('th');
    if (isHeader && mode === 'data') return;
    if (!isHeader && mode === 'headers') return;
    const cells = [];
    Array.from(row.querySelectorAll('th, td')).forEach((cell, i) => {
      if (i === 0) return; // skip prepended row-number / corner cell
      const formula = cell.getAttribute('data-formula');
      const val = (useFormulas && formula) ? formula : cell.textContent.trim();
      cells.push(encode(val));
    });
    if (cells.length) rows.push(cells.join(sep));
  });
  return rows.join('\n');
}

function decorateTable(tableEl, settings) {
  // Guard against double-decoration (mutation observer retry race).
  if (tableEl.querySelector('.table-calc-col-headers')) return;

  const allRows    = Array.from(tableEl.querySelectorAll('tr'));
  const headerRows = allRows.filter(r => r.querySelector('th'));
  const dataRows   = allRows.filter(r => r.querySelector('td'));
  if (dataRows.length === 0) return;

  const dataCols = dataRows[0].querySelectorAll('td').length;

  // Prepend column letter header row with copy button in the corner
  function makeBtn(parentEl, mode) {
    const btn = parentEl.createEl('button', { cls: 'table-calc-csv-btn' });

    function updateLabel() {
      const fmt = settings.copyFormat.toUpperCase();
      const fx  = settings.copyContent === 'formulas' ? ' fx' : '';
      const labels = { data: `${fmt}${fx}`, headers: `H ${fmt}${fx}`, all: `All ${fmt}${fx}` };
      const titles = { data: 'Copy data rows', headers: 'Copy headers only', all: 'Copy headers + data' };
      btn.textContent = labels[mode];
      btn.title = titles[mode] + (settings.copyContent === 'formulas' ? ' — formulas preserved' : '');
    }
    updateLabel();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateLabel();
      navigator.clipboard.writeText(tableToText(tableEl, settings, mode)).then(() => {
        const prev = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = prev; }, 1500);
      });
    });
  }

  // A/B/C... row — data-only copy button in corner
  const colLetterRow = createEl('tr', { cls: 'table-calc-col-headers' });
  const abcCorner = colLetterRow.createEl('th', { cls: 'table-calc-corner' });
  makeBtn(abcCorner, 'data');

  for (let c = 0; c < dataCols; c++) {
    colLetterRow.createEl('th', { cls: 'table-calc-col-label', text: LETTERS[c] || String(c + 1) });
  }

  const thead = tableEl.querySelector('thead');
  if (thead) {
    thead.insertBefore(colLetterRow, thead.firstChild);
  } else {
    tableEl.insertBefore(colLetterRow, tableEl.firstChild);
  }

  // Header rows — copy-with-headers button in the prepended corner cell
  headerRows.forEach((row, i) => {
    const corner = createEl('th', { cls: 'table-calc-corner' });
    if (i === 0) makeBtn(corner, 'headers');
    row.insertBefore(corner, row.firstChild);
  });

  dataRows.forEach((row, r) => {
    row.insertBefore(createEl('td', { cls: 'table-calc-row-label', text: String(r + 1) }), row.firstChild);
  });
}

// ── Calc-table fingerprint cache ─────────────────────────────────────────────
// Strip common Markdown inline markers so source-side fingerprints match
// the DOM textContent that tableFingerprint() reads from rendered cells.
// e.g. "**Name**" in source → "Name" in DOM.
function stripInlineMd(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g,     '$1')
    .replace(/__([^_]+)__/g,     '$1')
    .replace(/_([^_]+)_/g,       '$1')
    .replace(/`([^`]+)`/g,       '$1')
    .replace(/~~([^~]+)~~/g,     '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// Maps file path → Set of first-row fingerprints for tables preceded by
// {{calc}} in that file's source. Used as a fallback in Live Preview mode
// when DOM traversal cannot find the {{calc}} marker (e.g. CM6 keeps
// collapsed/hidden source lines between the marker and the rendered widget).
const calcTableFingerprints = new Map(); // filePath → Set<string>

// Returns a fingerprint string for the table's first visible content row,
// skipping the decoration row (.table-calc-col-headers) and decoration cells.
function tableFingerprint(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  const contentRow = rows.find(r => !r.classList.contains('table-calc-col-headers'));
  if (!contentRow) return '';
  const cells = Array.from(contentRow.querySelectorAll('th, td'))
    .filter(c => !c.classList.contains('table-calc-corner') &&
                 !c.classList.contains('table-calc-row-label'));
  return cells.map(c => c.textContent.trim()).filter(Boolean).join('\x00');
}

// ─── DOM-based marker detection ───────────────────────────────────────────────

// Walk up the ancestor chain checking the preceding sibling at each level.
// Skippable siblings: blank/whitespace-only elements AND elements whose
// content looks like a raw markdown table line ("|...|"). In Live Preview,
// CM6 may keep "collapsed" source lines (hidden via display:none or folded)
// between {{calc}} and the rendered table widget; those lines start with "|"
// so we skip them to reach the {{calc}} paragraph.
function findPrecedingCalcMarker(tableEl) {
  const hasCalcText = el =>
    el && el.textContent && el.textContent.trim() === '{{calc}}';

  function skippable(el) {
    const text = el.textContent.trim();
    return text === '' || text.startsWith('|');
  }

  let node = tableEl;
  for (let depth = 0; depth < 5; depth++) {
    let prev = node.previousElementSibling;
    while (prev && skippable(prev)) prev = prev.previousElementSibling;
    if (prev) {
      if (hasCalcText(prev)) return prev;
      const innerP = prev.querySelector && prev.querySelector('p');
      if (innerP && hasCalcText(innerP)) return innerP;
      // Non-marker, non-skippable content found — stop at this level.
      break;
    }
    node = node.parentElement;
    if (!node) break;
  }
  return null;
}

function hasCalcMarker(tableEl, filePath) {
  if (tableEl.dataset.tableCalcMarked === 'true') return true;

  // Fast path: DOM traversal (works in Reading mode and many LP cases).
  const marker = findPrecedingCalcMarker(tableEl);
  if (marker) {
    tableEl.dataset.tableCalcMarked = 'true';
    // Only hide the marker when it is a <p> element (Reading-mode rendered
    // paragraph). In Live Preview the marker is a raw CM6 editor line that
    // CodeMirror manages; hiding it disrupts editor layout and is confusing.
    if (marker.tagName === 'P') marker.style.display = 'none';
    return true;
  }

  // Fingerprint fallback (Live Preview re-renders where DOM traversal fails).
  if (filePath) {
    const fps = calcTableFingerprints.get(filePath);
    if (fps && fps.size > 0) {
      const fp = tableFingerprint(tableEl);
      if (fp && fps.has(fp)) {
        tableEl.dataset.tableCalcMarked = 'true';
        return true;
      }
    }
  }

  return false;
}

// Live Preview's table cells are natively click-to-edit in Obsidian: CM6
// maps clicks to source positions by walking the cell's actual rendered
// text, so that text has to stay byte-identical to the source. Overwriting
// td.textContent with a computed value (safe in Reading Mode, which is a
// static one-shot render) desyncs that mapping — confirmed by direct
// testing, where editing a formula produced a corrupted cell containing
// both the stale old value and the new raw text concatenated together, and
// the table never fully recovered. So in Live Preview we never touch cell
// text or structure; the computed value is shown via a CSS ::after reading
// a data-computed attribute instead (see styles.css), which doesn't affect
// the DOM's text-node layout at all.
function processTable(tableEl, settings, filePath) {
  // Live Preview renders a table's HTML via the same internal pipeline as
  // Reading View, so .markdown-reading-view can appear in the ancestor
  // chain even inside the live editor — that check is not reliable (it let
  // decoration slip into Live Preview, which CM6 then partially reverted).
  // .cm-editor is CodeMirror's actual editor root; Reading View never uses
  // CodeMirror at all, so its absence is the definitive signal.
  const isReadingView = !tableEl.closest('.cm-editor');

  if (tableEl.dataset.tableCalc === 'done') {
    if (isReadingView) {
      // CM6 can re-render the table after a formula edit. If any data cell
      // still shows raw "=..." text, formulas need re-evaluation.
      const hasRawFormulas = Array.from(tableEl.querySelectorAll('td')).some(
        td => !td.classList.contains('table-calc-row-label') &&
              td.textContent.trim().startsWith('=')
      );
      if (hasRawFormulas) {
        // Strip existing decoration so the full pipeline can run cleanly.
        tableEl.querySelector('.table-calc-col-headers')?.remove();
        tableEl.querySelectorAll('.table-calc-corner').forEach(el => el.remove());
        tableEl.querySelectorAll('.table-calc-row-label').forEach(el => el.remove());
        delete tableEl.dataset.tableCalc;
        // fall through to full re-processing below
      } else if (!tableEl.querySelector('.table-calc-col-headers')) {
        // Decoration was stripped by CM6 but formulas are already evaluated;
        // just re-apply the decoration.
        decorateTable(tableEl, settings);
        return;
      } else {
        return;
      }
    }
    // Live Preview never mutates cell text/structure, so re-running the
    // block below on every observed change is cheap and always safe —
    // just fall through and recompute data-computed values in place.
  }

  if (!hasCalcMarker(tableEl, filePath)) {
    tableEl.dataset.tableCalc = 'skip';
    return;
  }

  const allRows  = Array.from(tableEl.querySelectorAll('tr'));
  const dataRows = allRows.filter(r => r.querySelector('td'));
  if (dataRows.length === 0) return;

  // Excludes .table-calc-row-label: in Live Preview, decorateTable() below
  // persists across passes (unlike Reading View, this function has no
  // 'done'-and-undecorated short-circuit, since a formula cell always shows
  // raw text there — see the comment above). Without this filter, the
  // second pass over an already-decorated table would count that leftover
  // row-number cell as real data and shift every column reference by one.
  const dataCells = row => Array.from(row.querySelectorAll('td'))
    .filter(td => !td.classList.contains('table-calc-row-label'));

  const grid = dataRows.map(row => dataCells(row).map(td => td.textContent.trim()));

  dataRows.forEach((row) => {
    dataCells(row).forEach((td) => {
      const text = td.textContent.trim();
      if (!text.startsWith('=')) return;
      const result = evalFormula(text, grid);
      const isErr = typeof result === 'string' && result.startsWith('#');
      const display = formatResult(result);
      td.setAttribute('data-formula', text);
      if (isReadingView) {
        td.textContent = display;
        td.title = text;
        td.classList.add(isErr ? 'table-calc-error-cell' : 'table-calc-cell');
      } else {
        // Any CSS that adds rendered content inside the cell (::after, extra
        // text, etc.) risks overflowing Obsidian's fixed-height Live Preview
        // table cell layout and bleeding into neighboring rows — confirmed
        // by direct testing. A native browser tooltip renders in its own
        // overlay layer outside page flow, so it can't do that; use it
        // instead. This is the only cell change in LP besides a color class,
        // so cell text/structure genuinely never changes here.
        td.title = isErr ? `${text} → ${display}` : `${text} = ${display}`;
        td.classList.add(isErr ? 'table-calc-lp-error' : 'table-calc-lp-formula');
      }
    });
  });

  // decorateTable() only inserts brand-new elements (a synthetic column-
  // letter header row, corner cells, row-number cells) — it never rewrites
  // existing cell text, so it doesn't carry the cursor-mapping risk that
  // ruled out text replacement in Live Preview. Confirmed empirically too:
  // an earlier, unintentional bug ran this same call in Live Preview, and
  // the decoration rendered and persisted fine — only the separate
  // text-replacement step (above) got reverted by CM6. decorateTable()
  // guards against double-insertion internally, so calling it on every
  // pass (Live Preview never marks 'done' the way Reading View does) is safe.
  decorateTable(tableEl, settings);
  tableEl.dataset.tableCalc = 'done';
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

class TableCalcPlugin extends Plugin {
  constructor(...args) {
    super(...args);
    this.observers = [];
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
  }

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new TableCalcSettingTab(this.app, this));

    // Primary path: post-processor per section.
    // ctx.getSectionInfo reads the source to detect {{calc}} on preceding lines.
    this.registerMarkdownPostProcessor((el, ctx) => {
      el.querySelectorAll('p').forEach(p => {
        if (p.textContent.trim() === '{{calc}}') p.style.display = 'none';
      });

      const tables = Array.from(el.querySelectorAll('table'));
      if (tables.length === 0) return;

      const markerInEl = Array.from(el.querySelectorAll('p'))
        .some(p => p.textContent.trim() === '{{calc}}');

      if (markerInEl) {
        tables.forEach(t => { t.dataset.tableCalcMarked = 'true'; });
      } else {
        const info = ctx.getSectionInfo(el);
        if (info && info.lineStart > 0) {
          const lines = info.text.split('\n');
          for (let i = info.lineStart - 1; i >= Math.max(0, info.lineStart - 4); i--) {
            const line = lines[i].trim();
            if (line === '{{calc}}') {
              tables.forEach(t => { t.dataset.tableCalcMarked = 'true'; });
              break;
            }
            if (line !== '') break;
          }
        }
      }

      tables.forEach(t => processTable(t, this.settings, ctx.sourcePath));
    });

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        this.attachObserver(leaf);
        // Build fingerprint cache for the newly active file so LP re-renders
        // can be identified even when DOM traversal fails.
        const view = leaf?.view;
        if (view instanceof MarkdownView && view.file) {
          this.buildFingerprints(view.file);
        }
      })
    );

    // Build fingerprint cache for the currently open file on startup.
    this.registerEvent(
      this.app.workspace.on('file-open', file => {
        if (file) this.buildFingerprints(file);
      })
    );

    // Keep the fingerprint cache in sync with in-progress edits. Without this,
    // editing a calc table's first row in Live Preview leaves the cache
    // pointing at the pre-edit content: the re-rendered table's fingerprint
    // no longer matches, hasCalcMarker() fails, and the table is stuck
    // unprocessed until the file is reopened (Reading view is unaffected
    // since it reads live source via ctx.getSectionInfo instead of the cache).
    // Pass the editor's live buffer rather than cachedRead() so the cache
    // reflects keystrokes immediately, not just after the autosave debounce.
    this.registerEvent(
      this.app.workspace.on('editor-change', (editor, info) => {
        const file = info?.file;
        if (!file) return;
        clearTimeout(this._fingerprintTimer);
        this._fingerprintTimer = setTimeout(() => {
          this.buildFingerprints(file, editor.getValue());
        }, 200);
      })
    );

    // Toggling Live Preview <-> Reading view within the same pane doesn't
    // fire 'active-leaf-change', so refresh the cache on layout changes too.
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.file) this.buildFingerprints(view.file);
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
            delete t.dataset.tableCalcMarked;
          });
          this.reprocess(view.contentEl, view.file?.path);
          new Notice('Table Calc: formulas evaluated');
        }
        return true;
      }
    });
  }

  reprocess(contentEl, filePath) {
    contentEl.querySelectorAll('p').forEach(p => {
      if (p.textContent.trim() !== '{{calc}}') return;
      p.style.display = 'none';

      let table = null;
      const next = p.nextElementSibling;
      if (next) {
        table = next.tagName === 'TABLE' ? next : next.querySelector && next.querySelector('table');
      }
      if (!table && p.parentElement) {
        const parentNext = p.parentElement.nextElementSibling;
        if (parentNext) {
          table = parentNext.tagName === 'TABLE' ? parentNext : parentNext.querySelector && parentNext.querySelector('table');
        }
      }
      if (table) table.dataset.tableCalcMarked = 'true';
    });

    contentEl.querySelectorAll('table').forEach(t => processTable(t, this.settings, filePath));
  }

  attachObserver(leaf) {
    if (!leaf || !leaf.view || !leaf.view.contentEl) return;
    const el = leaf.view.contentEl;
    if (el._tableCalcObserver) return;

    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
      const tables = new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches('table')) tables.add(node);
          else if (node.querySelectorAll) node.querySelectorAll('table').forEach(t => tables.add(t));
        }
        // Also catch in-place re-renders/edits: CM6 may update a table's
        // <tr> rows (childList change inside a <table>) without replacing
        // the element, or patch a single cell's text directly, which is a
        // characterData mutation whose target is a Text node — walk up via
        // parentElement to find the enclosing table in that case.
        const targetEl = mutation.target && mutation.target.nodeType === 3
          ? mutation.target.parentElement
          : (mutation.target && mutation.target.nodeType === 1 ? mutation.target : null);
        if (targetEl) {
          const tbl = targetEl.closest ? targetEl.closest('table') : null;
          if (tbl) tables.add(tbl);
        }
      }
      if (tables.size === 0) return;
      // Use leaf.view.file so background-pane mutations resolve the correct
      // file rather than whatever pane happens to be focused at fire time.
      const filePath = leaf.view.file?.path;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => tables.forEach(t => {
        // In Live Preview, keep 'done' so processTable's LP branch falls
        // through cheaply. In Reading View, clear it so a characterData
        // mutation on a data cell triggers full formula re-evaluation.
        const isLP = !!t.closest('.cm-editor');
        if (!isLP || t.dataset.tableCalc !== 'done') delete t.dataset.tableCalc;
        processTable(t, this.settings, filePath);
      }), 150);
    });

    observer.observe(el, { childList: true, subtree: true, characterData: true });
    el._tableCalcObserver = observer;
    this.observers.push(observer);

    const initPath = leaf.view.file?.path;
    this.reprocess(el, initPath);
  }

  // Scan the file source to build a fingerprint set for tables preceded by
  // {{calc}}. Stored in calcTableFingerprints so hasCalcMarker can identify
  // calc tables in Live Preview even when DOM traversal fails.
  // sourceOverride lets callers pass the live editor buffer (editor-change)
  // instead of the vault cache, which can lag behind unsaved keystrokes.
  async buildFingerprints(file, sourceOverride) {
    try {
      const source = sourceOverride ?? await this.app.vault.cachedRead(file);
      const lines = source.split('\n');
      const fps = new Set();
      let seenCalc = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '{{calc}}') {
          seenCalc = true;
        } else if (seenCalc && trimmed.startsWith('|')) {
          // Skip separator-only rows (| --- | :---: | etc.)
          const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
          if (cells.every(c => /^[-:]+$/.test(c))) continue;
          // First data/header row — build its fingerprint.
          // Strip inline Markdown so source "**Name**" matches DOM "Name".
          fps.add(cells.map(stripInlineMd).join('\x00'));
          seenCalc = false;
        } else if (trimmed !== '') {
          seenCalc = false;
        }
      }

      calcTableFingerprints.set(file.path, fps);

      // Re-process any tables that were skipped before the cache was ready.
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.file?.path === file.path) {
        view.contentEl.querySelectorAll('table[data-table-calc="skip"]').forEach(t => {
          delete t.dataset.tableCalc;
          processTable(t, this.settings, file.path);
        });
      }
    } catch (_) { /* ignore */ }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
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
// Exposed for DOM-level regression tests (see ../main.test.js). Obsidian
// only ever loads the default export; attaching these doesn't affect that.
module.exports.processTable = processTable;
module.exports.decorateTable = decorateTable;
module.exports.hasCalcMarker = hasCalcMarker;

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
// ─── Blank line between {{calc}} and its table ───────────────────────────────

// Obsidian won't render a table that directly follows a line of text: a
// {{calc}} line with a table row right under it renders as one plain
// paragraph, so there's no table for the plugin to evaluate. Finds every
// such marker (including inside callouts, skipping fenced code blocks) and
// returns where a blank line must be inserted, as { line, text }: insert
// `text` at the end of 0-based `line`.
const QUOTE_PREFIX = /^\s*(?:>\s*)*/;

function findAdjacentCalcMarkers(lines) {
  const fixes = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const prefix = lines[i].match(QUOTE_PREFIX)[0];
    const body = lines[i].slice(prefix.length).trim();
    if (body.startsWith('```') || body.startsWith('~~~')) inFence = !inFence;
    if (inFence || body !== '{{calc}}' || i + 1 >= lines.length) continue;
    const next = lines[i + 1];
    if (next.slice(next.match(QUOTE_PREFIX)[0].length).trim().startsWith('|')) {
      // Keep callout lines quoted: the blank line inside "> " blocks is ">".
      fixes.push({ line: i, text: `\n${prefix.trimEnd()}` });
    }
  }
  return fixes;
}

function insertBlankAfterCalcMarkers(source) {
  const lines = source.split('\n');
  for (const { line, text } of findAdjacentCalcMarkers(lines)) lines[line] += text;
  return lines.join('\n');
}

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
// Returns { marker } when {{calc}} is found, { other: true } when some other
// content sits directly before the table (so it is definitely NOT a calc
// table), or {} when nothing conclusive was found within the search depth.
function precedingMarker(tableEl) {
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
      if (hasCalcText(prev)) return { marker: prev };
      // Descend through the block's trailing content only: the marker must
      // be the last thing before the table, not just anywhere inside the
      // preceding block (e.g. a callout with prose after its {{calc}}).
      let inner = prev.lastElementChild;
      while (inner) {
        while (inner && skippable(inner)) inner = inner.previousElementSibling;
        if (!inner) break;
        if (hasCalcText(inner)) return { marker: inner };
        inner = inner.lastElementChild;
      }
      // Non-marker, non-skippable content found — stop at this level.
      return { other: true };
    }
    node = node.parentElement;
    if (!node) break;
  }
  return {};
}

function findPrecedingCalcMarker(tableEl) {
  return precedingMarker(tableEl).marker || null;
}

// ─── Source-based marker detection (Live Preview) ────────────────────────────

// Set by the plugin on load: maps a table element to the CM6 EditorView of
// the Live Preview editor that contains it (null when there isn't one).
let resolveEditorView = () => null;

// Reads the note source around a Live Preview table to decide whether
// {{calc}} sits directly above it. Returns true/false, or null when the
// table can't be located in the source (e.g. it's inside a callout widget).
// Unlike DOM traversal or header fingerprints this is exact, so it also
// catches a {{calc}} line being deleted after the table was evaluated.
function calcMarkerFromSource(tableEl) {
  if (!tableEl.closest('.cm-editor')) return null;
  try {
    const cm = resolveEditorView(tableEl);
    if (!cm || !cm.dom.contains(tableEl)) return null;
    const doc = cm.state.doc;
    const isRow = n => doc.line(n).text.trim().startsWith('|');
    let n = doc.lineAt(cm.posAtDOM(tableEl)).number;
    if (!isRow(n)) return null;
    while (n > 1 && isRow(n - 1)) n--;
    for (let i = n - 1; i >= 1; i--) {
      const line = doc.line(i).text.trim();
      if (line === '{{calc}}') return true;
      if (line !== '') return false;
    }
    return false;
  } catch (_) {
    return null;
  }
}

// Reverses everything processTable/decorateTable did to a table, so a table
// whose {{calc}} marker was removed goes back to plain markdown rendering.
function undoTable(tableEl) {
  tableEl.querySelector('.table-calc-col-headers')?.remove();
  tableEl.querySelectorAll('.table-calc-corner, .table-calc-row-label').forEach(el => el.remove());
  tableEl.querySelectorAll('td[data-formula]').forEach(td => {
    if (!td.closest('.cm-editor')) td.textContent = td.dataset.formula;
    td.removeAttribute('data-formula');
    td.removeAttribute('title');
    td.classList.remove('table-calc-cell', 'table-calc-error-cell', 'table-calc-lp-formula', 'table-calc-lp-error');
  });
  delete tableEl.dataset.tableCalc;
  delete tableEl.dataset.tableCalcMarked;
}

// Re-checks every evaluated table under contentEl and undoes the ones that
// are no longer preceded by {{calc}}. Only acts on a conclusive answer, so a
// table whose marker simply can't be seen right now is left alone.
function revalidateTables(contentEl) {
  contentEl.querySelectorAll('table[data-table-calc="done"]').forEach(tableEl => {
    const stillCalc = tableEl.closest('.cm-editor')
      ? calcMarkerFromSource(tableEl) !== false
      : !precedingMarker(tableEl).other;
    if (!stillCalc) {
      undoTable(tableEl);
      tableEl.dataset.tableCalc = 'skip';
    }
  });
}

function hasCalcMarker(tableEl, filePath) {
  // In Live Preview the source is authoritative when it can be read.
  const fromSource = calcMarkerFromSource(tableEl);
  if (fromSource !== null) {
    if (fromSource) tableEl.dataset.tableCalcMarked = 'true';
    else delete tableEl.dataset.tableCalcMarked;
    return fromSource;
  }

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
    if (tableEl.dataset.tableCalc === 'done') undoTable(tableEl);
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

    resolveEditorView = el => {
      for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
        if (leaf.view.contentEl?.contains(el)) return leaf.view.editor?.cm ?? null;
      }
      return null;
    };

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

      // When the marker is inside this section, leave detection to the
      // per-table DOM walk in hasCalcMarker so only the table immediately
      // after {{calc}} is marked — not every table in the section.
      if (!markerInEl) {
        const info = ctx.getSectionInfo(el);
        if (info && info.lineStart > 0) {
          const lines = info.text.split('\n');
          for (let i = info.lineStart - 1; i >= Math.max(0, info.lineStart - 4); i--) {
            const line = lines[i].trim();
            if (line === '{{calc}}') {
              tables[0].dataset.tableCalcMarked = 'true';
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
      this.app.workspace.on('file-open', async file => {
        if (!file) return;
        if (file.extension === 'md') {
          const source = await this.app.vault.read(file);
          if (findAdjacentCalcMarkers(source.split('\n')).length > 0) {
            await this.app.vault.process(file, insertBlankAfterCalcMarkers);
          }
        }
        this.buildFingerprints(file);
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
          this.fixAdjacentCalcMarkers(editor);
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

  // Inserts the blank line Obsidian needs between {{calc}} and a table typed
  // directly under it, as one undoable edit.
  fixAdjacentCalcMarkers(editor) {
    const lines = editor.getValue().split('\n');
    const fixes = findAdjacentCalcMarkers(lines);
    if (fixes.length === 0) return;
    editor.transaction({
      changes: fixes.map(({ line, text }) => ({
        from: { line, ch: lines[line].length },
        text,
      })),
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
      // Only look past the parent when the marker is its last child;
      // otherwise whatever follows the marker isn't a table and {{calc}}
      // must not leak onto a later, unrelated table.
      if (!next && p.parentElement) {
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
      // A removed node may have been a {{calc}} marker, which can turn an
      // evaluated table back into a plain one — re-check those too.
      const removed = mutations.some(m => m.removedNodes.length > 0);
      if (tables.size === 0 && !removed) return;
      // Use leaf.view.file so background-pane mutations resolve the correct
      // file rather than whatever pane happens to be focused at fire time.
      const filePath = leaf.view.file?.path;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        tables.forEach(t => {
          // In Live Preview, keep 'done' so processTable's LP branch falls
          // through cheaply. In Reading View, clear it so a characterData
          // mutation on a data cell triggers full formula re-evaluation.
          const isLP = !!t.closest('.cm-editor');
          if (!isLP || t.dataset.tableCalc !== 'done') delete t.dataset.tableCalc;
          processTable(t, this.settings, filePath);
        });
        revalidateTables(el);
      }, 150);
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
      // Fingerprint every table's first row, split by whether {{calc}}
      // precedes it. A fingerprint shared with an unmarked table is
      // ambiguous, so it's dropped — otherwise {{calc}} would leak onto
      // any plain table that happens to have the same header.
      const calcFps = new Set();
      const plainFps = new Set();
      let seenCalc = false;
      let inTable = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('|')) {
          if (!inTable) {
            // Skip separator-only rows (| --- | :---: | etc.)
            const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.every(c => /^[-:]+$/.test(c))) continue;
            // First data/header row — build its fingerprint.
            // Strip inline Markdown so source "**Name**" matches DOM "Name".
            (seenCalc ? calcFps : plainFps).add(cells.map(stripInlineMd).join('\x00'));
            inTable = true;
          }
          seenCalc = false;
          continue;
        }
        inTable = false;
        if (trimmed === '{{calc}}') {
          seenCalc = true;
        } else if (trimmed !== '') {
          seenCalc = false;
        }
      }

      const fps = new Set([...calcFps].filter(fp => !plainFps.has(fp)));

      calcTableFingerprints.set(file.path, fps);

      // Re-process any tables that were skipped before the cache was ready.
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.file?.path === file.path) {
        view.contentEl.querySelectorAll('table[data-table-calc="skip"]').forEach(t => {
          delete t.dataset.tableCalc;
          processTable(t, this.settings, file.path);
        });
        // ...and undo any evaluated table whose {{calc}} was since removed.
        revalidateTables(view.contentEl);
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
    resolveEditorView = () => null;
    // Fully restore rendered tables and markers; leaving the marked flag
    // behind made tables stay calc tables after a plugin reload even when
    // their {{calc}} had been removed.
    document.querySelectorAll('table[data-table-calc]').forEach(undoTable);
    document.querySelectorAll('p').forEach(p => {
      if (p.textContent.trim() === '{{calc}}') p.style.display = '';
    });
  }
}

module.exports = TableCalcPlugin;
// Exposed for DOM-level regression tests (see ../main.test.js). Obsidian
// only ever loads the default export; attaching these doesn't affect that.
module.exports.processTable = processTable;
module.exports.decorateTable = decorateTable;
module.exports.hasCalcMarker = hasCalcMarker;
module.exports.revalidateTables = revalidateTables;
module.exports.insertBlankAfterCalcMarkers = insertBlankAfterCalcMarkers;

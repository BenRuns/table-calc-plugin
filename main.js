"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// engine.js
var require_engine = __commonJS({
  "engine.js"(exports2, module2) {
    "use strict";
    function parseRef(s) {
      const m = s.trim().match(/^([A-Z])(\d+)$/i);
      if (!m) return null;
      return { r: parseInt(m[2]) - 1, c: m[1].toUpperCase().charCodeAt(0) - 65 };
    }
    function getRawCell(grid, r, c) {
      if (r < 0 || r >= grid.length) return "";
      const row = grid[r];
      if (!row || c < 0 || c >= row.length) return "";
      return row[c].trim();
    }
    function parseCellNumber(str) {
      return /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(str) ? parseFloat(str) : NaN;
    }
    function getGridValue(grid, r, c, depth) {
      if (depth <= 0 || r < 0 || r >= grid.length) return 0;
      const raw = getRawCell(grid, r, c);
      if (!raw) return 0;
      if (raw.startsWith("=")) return +evalFormula2(raw, grid, depth - 1) || 0;
      const n = parseCellNumber(raw);
      return isNaN(n) ? 0 : n;
    }
    function resolveArgs(argsStr, grid, depth) {
      const vals = [];
      for (const part of argsStr.split(",")) {
        const t = part.trim();
        const rangeM = t.match(/^([A-Z]\d+):([A-Z]\d+)$/i);
        if (rangeM) {
          const from = parseRef(rangeM[1]), to = parseRef(rangeM[2]);
          if (from && to) {
            for (let r = Math.min(from.r, to.r); r <= Math.max(from.r, to.r); r++)
              for (let c = Math.min(from.c, to.c); c <= Math.max(from.c, to.c); c++) {
                const raw = getRawCell(grid, r, c);
                vals.push({ num: getGridValue(grid, r, c, depth), raw });
              }
          }
          continue;
        }
        const ref = parseRef(t);
        if (ref) {
          const raw = getRawCell(grid, ref.r, ref.c);
          vals.push({ num: getGridValue(grid, ref.r, ref.c, depth), raw });
          continue;
        }
        vals.push({ num: parseCellNumber(t), raw: t });
      }
      return vals;
    }
    function shiftDecimal(num, exp) {
      const [mantissa, exponent] = String(num).split("e");
      return Number(mantissa + "e" + (Number(exponent || 0) + exp));
    }
    function preciseRound(num, decimals) {
      const shifted = shiftDecimal(num, decimals);
      const rounded = Math.sign(shifted) * Math.round(Math.abs(shifted));
      return shiftDecimal(rounded, -decimals);
    }
    function preciseTrunc(num, decimals) {
      return shiftDecimal(Math.trunc(shiftDecimal(num, decimals)), -decimals);
    }
    function spreadsheetMod(a, b) {
      const r = a % b;
      return r !== 0 && r < 0 !== b < 0 ? r + b : r;
    }
    function evalFormula2(formula, grid, depth) {
      if (depth === void 0) depth = 20;
      if (!formula || !formula.startsWith("=")) return formula;
      let expr = formula.slice(1).trim();
      try {
        let earlyError = null;
        let prevExpr;
        let passes = 0;
        do {
          prevExpr = expr;
          expr = expr.replace(/([A-Z][A-Z0-9]*)\(([^()]*)\)/gi, function(_, fn, args) {
            if (earlyError) return 0;
            const pairs = resolveArgs(args, grid, depth);
            const nums = pairs.map((p) => p.num).filter((v) => typeof v === "number" && isFinite(v));
            const numericVals = pairs.filter((p) => p.raw !== "" && !isNaN(parseCellNumber(p.raw))).map((p) => p.num);
            let result2;
            switch (fn.toUpperCase()) {
              case "SUM":
                result2 = nums.reduce((a, b) => a + b, 0);
                break;
              case "AVERAGE":
                result2 = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
                break;
              // reduce (not Math.min/max(...nums)) avoids RangeError: Maximum
              // call stack size exceeded when spreading very large ranges.
              case "MIN":
                result2 = numericVals.length ? numericVals.reduce((a, b) => Math.min(a, b)) : 0;
                break;
              case "MAX":
                result2 = numericVals.length ? numericVals.reduce((a, b) => Math.max(a, b)) : 0;
                break;
              case "COUNT":
                result2 = numericVals.length;
                break;
              case "COUNTA":
                result2 = pairs.filter((p) => p.raw !== "").length;
                break;
              case "ABS":
                result2 = Math.abs(nums[0] || 0);
                break;
              case "ROUND":
                result2 = preciseRound(nums[0] || 0, nums[1] || 0);
                break;
              case "FLOOR":
              case "INT":
                result2 = Math.floor(nums[0] || 0);
                break;
              case "CEILING":
                result2 = Math.ceil(nums[0] || 0);
                break;
              case "TRUNC":
                result2 = preciseTrunc(nums[0] || 0, nums[1] || 0);
                break;
              case "SIGN":
                result2 = Math.sign(nums[0] || 0);
                break;
              case "SQRT":
                result2 = Math.sqrt(nums[0] || 0);
                break;
              case "POW":
              case "POWER":
                result2 = Math.pow(nums[0] || 0, nums[1] || 0);
                break;
              case "MOD":
                result2 = spreadsheetMod(nums[0] || 0, nums[1] || 0);
                break;
              case "EXP":
                result2 = Math.exp(nums[0] || 0);
                break;
              // pairs.length (not nums.length) decides arg count: nums silently
              // drops invalid/non-numeric entries, which previously made
              // LOG(8, <bad literal>) look like a 1-arg call and fall back to
              // natural log instead of erroring.
              case "LN":
                result2 = Math.log(nums[0]);
                break;
              case "LOG":
                result2 = pairs.length > 1 ? Math.log(nums[0]) / Math.log(nums[1]) : Math.log10(nums[0]);
                break;
              case "LOG10":
                result2 = Math.log10(nums[0]);
                break;
              case "PI":
                result2 = Math.PI;
                break;
              case "MEDIAN": {
                const sorted = [...numericVals].sort((a, b) => a - b);
                if (!sorted.length) {
                  result2 = 0;
                  break;
                }
                const mid = Math.floor(sorted.length / 2);
                result2 = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
                break;
              }
              case "PRODUCT":
                result2 = numericVals.length ? numericVals.reduce((a, b) => a * b, 1) : 0;
                break;
              case "STDEV":
              case "VAR": {
                if (numericVals.length < 2) {
                  result2 = 0;
                  break;
                }
                const mean = numericVals.reduce((a, b) => a + b, 0) / numericVals.length;
                const variance = numericVals.reduce((a, b) => a + (b - mean) ** 2, 0) / (numericVals.length - 1);
                result2 = fn.toUpperCase() === "VAR" ? variance : Math.sqrt(variance);
                break;
              }
              default:
                earlyError = "#NAME?";
                return 0;
            }
            if (typeof result2 !== "number" || !isFinite(result2)) {
              earlyError = "#ERR";
              return 0;
            }
            return result2;
          });
        } while (!earlyError && expr !== prevExpr && ++passes < 100);
        if (earlyError) return earlyError;
        expr = expr.replace(/\b([A-Z]\d+)\b/gi, function(_, ref) {
          const pos = parseRef(ref);
          return pos ? getGridValue(grid, pos.r, pos.c, depth) : 0;
        });
        expr = expr.replace(/\^/g, "**");
        if (!/^[\d\s+\-*\/().%eE]+$/.test(expr)) return "#ERR";
        const result = Function('"use strict"; return (' + expr + ")")();
        if (typeof result !== "number" || !isFinite(result)) return "#ERR";
        return Number.isInteger(result) ? result || 0 : parseFloat(result.toFixed(8)) || 0;
      } catch (e) {
        return "#ERR";
      }
    }
    function formatResult2(val) {
      if (typeof val === "number") {
        return Number.isInteger(val) ? String(val) : parseFloat(val.toFixed(6)).toString();
      }
      return String(val);
    }
    module2.exports = { parseRef, evalFormula: evalFormula2, formatResult: formatResult2 };
  }
});

// src/main.js
var { Plugin, PluginSettingTab, Setting, MarkdownView, Notice } = require("obsidian");
var { evalFormula, formatResult } = require_engine();
var DEFAULT_SETTINGS = {
  copyFormat: "csv",
  // 'csv' | 'tsv'
  copyContent: "values"
  // 'values' | 'formulas'
};
var TableCalcSettingTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Copy format").setDesc("File format used by the Copy button on calc tables.").addDropdown(
      (drop) => drop.addOption("csv", "CSV (comma-separated)").addOption("tsv", "TSV (tab-separated)").setValue(this.plugin.settings.copyFormat).onChange(async (v) => {
        this.plugin.settings.copyFormat = v;
        await this.plugin.saveSettings();
      })
    );
    new Setting(containerEl).setName("Copy content").setDesc(
      "Values \u2014 copies the computed result of each formula.\nFormulas \u2014 copies the raw formula text (e.g. =SUM(B1:C1)). Paste into Google Sheets or Excel to re-evaluate."
    ).addDropdown(
      (drop) => drop.addOption("values", "Computed values").addOption("formulas", "Formulas (for spreadsheet import)").setValue(this.plugin.settings.copyContent).onChange(async (v) => {
        this.plugin.settings.copyContent = v;
        await this.plugin.saveSettings();
      })
    );
  }
};
var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function tableToText(tableEl, settings, mode = "data") {
  const sep = settings.copyFormat === "tsv" ? "	" : ",";
  const useFormulas = settings.copyContent === "formulas";
  function encode(raw) {
    const bad = settings.copyFormat === "tsv" ? (s) => s.includes("	") || s.includes('"') || s.includes("\n") : (s) => s.includes(",") || s.includes('"') || s.includes("\n");
    if (bad(raw)) return '"' + raw.replace(/"/g, '""') + '"';
    return raw;
  }
  const rows = [];
  Array.from(tableEl.querySelectorAll("tr")).forEach((row) => {
    if (row.classList.contains("table-calc-col-headers")) return;
    const isHeader = !!row.querySelector("th");
    if (isHeader && mode === "data") return;
    if (!isHeader && mode === "headers") return;
    const cells = [];
    Array.from(row.querySelectorAll("th, td")).forEach((cell, i) => {
      if (i === 0) return;
      const formula = cell.getAttribute("data-formula");
      const val = useFormulas && formula ? formula : cell.textContent.trim();
      cells.push(encode(val));
    });
    if (cells.length) rows.push(cells.join(sep));
  });
  return rows.join("\n");
}
function decorateTable(tableEl, settings) {
  if (tableEl.querySelector(".table-calc-col-headers")) return;
  const allRows = Array.from(tableEl.querySelectorAll("tr"));
  const headerRows = allRows.filter((r) => r.querySelector("th"));
  const dataRows = allRows.filter((r) => r.querySelector("td"));
  if (dataRows.length === 0) return;
  const dataCols = dataRows[0].querySelectorAll("td").length;
  function makeBtn(parentEl, mode) {
    const btn = parentEl.createEl("button", { cls: "table-calc-csv-btn" });
    function updateLabel() {
      const fmt = settings.copyFormat.toUpperCase();
      const fx = settings.copyContent === "formulas" ? " fx" : "";
      const labels = { data: `${fmt}${fx}`, headers: `H ${fmt}${fx}`, all: `All ${fmt}${fx}` };
      const titles = { data: "Copy data rows", headers: "Copy headers only", all: "Copy headers + data" };
      btn.textContent = labels[mode];
      btn.title = titles[mode] + (settings.copyContent === "formulas" ? " \u2014 formulas preserved" : "");
    }
    updateLabel();
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      updateLabel();
      navigator.clipboard.writeText(tableToText(tableEl, settings, mode)).then(() => {
        const prev = btn.textContent;
        btn.textContent = "\u2713";
        setTimeout(() => {
          btn.textContent = prev;
        }, 1500);
      });
    });
  }
  const colLetterRow = createEl("tr", { cls: "table-calc-col-headers" });
  const abcCorner = colLetterRow.createEl("th", { cls: "table-calc-corner" });
  makeBtn(abcCorner, "data");
  for (let c = 0; c < dataCols; c++) {
    colLetterRow.createEl("th", { cls: "table-calc-col-label", text: LETTERS[c] || String(c + 1) });
  }
  const thead = tableEl.querySelector("thead");
  if (thead) {
    thead.insertBefore(colLetterRow, thead.firstChild);
  } else {
    tableEl.insertBefore(colLetterRow, tableEl.firstChild);
  }
  headerRows.forEach((row, i) => {
    const corner = createEl("th", { cls: "table-calc-corner" });
    if (i === 0) makeBtn(corner, "headers");
    row.insertBefore(corner, row.firstChild);
  });
  dataRows.forEach((row, r) => {
    row.insertBefore(createEl("td", { cls: "table-calc-row-label", text: String(r + 1) }), row.firstChild);
  });
}
var calcTableFingerprints = /* @__PURE__ */ new Map();
function tableFingerprint(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll("tr"));
  const contentRow = rows.find((r) => !r.classList.contains("table-calc-col-headers"));
  if (!contentRow) return "";
  const cells = Array.from(contentRow.querySelectorAll("th, td")).filter((c) => !c.classList.contains("table-calc-corner") && !c.classList.contains("table-calc-row-label"));
  return cells.map((c) => c.textContent.trim()).filter(Boolean).join("\0");
}
function findPrecedingCalcMarker(tableEl) {
  const hasCalcText = (el) => el && el.textContent && el.textContent.trim() === "{{calc}}";
  function skippable(el) {
    const text = el.textContent.trim();
    return text === "" || text.startsWith("|");
  }
  let node = tableEl;
  for (let depth = 0; depth < 5; depth++) {
    let prev = node.previousElementSibling;
    while (prev && skippable(prev)) prev = prev.previousElementSibling;
    if (prev) {
      if (hasCalcText(prev)) return prev;
      const innerP = prev.querySelector && prev.querySelector("p");
      if (innerP && hasCalcText(innerP)) return innerP;
      break;
    }
    node = node.parentElement;
    if (!node) break;
  }
  return null;
}
function hasCalcMarker(tableEl, filePath) {
  if (tableEl.dataset.tableCalcMarked === "true") return true;
  const marker = findPrecedingCalcMarker(tableEl);
  if (marker) {
    tableEl.dataset.tableCalcMarked = "true";
    if (marker.tagName === "P") marker.style.display = "none";
    return true;
  }
  if (filePath) {
    const fps = calcTableFingerprints.get(filePath);
    if (fps && fps.size > 0) {
      const fp = tableFingerprint(tableEl);
      if (fp && fps.has(fp)) {
        tableEl.dataset.tableCalcMarked = "true";
        return true;
      }
    }
  }
  return false;
}
function processTable(tableEl, settings, filePath) {
  const isReadingView = !tableEl.closest(".cm-editor");
  if (tableEl.dataset.tableCalc === "done") {
    if (isReadingView) {
      const hasRawFormulas = Array.from(tableEl.querySelectorAll("td")).some(
        (td) => !td.classList.contains("table-calc-row-label") && td.textContent.trim().startsWith("=")
      );
      if (hasRawFormulas) {
        tableEl.querySelector(".table-calc-col-headers")?.remove();
        tableEl.querySelectorAll(".table-calc-corner").forEach((el) => el.remove());
        tableEl.querySelectorAll(".table-calc-row-label").forEach((el) => el.remove());
        delete tableEl.dataset.tableCalc;
      } else if (!tableEl.querySelector(".table-calc-col-headers")) {
        decorateTable(tableEl, settings);
        return;
      } else {
        return;
      }
    }
  }
  if (!hasCalcMarker(tableEl, filePath)) {
    tableEl.dataset.tableCalc = "skip";
    return;
  }
  const allRows = Array.from(tableEl.querySelectorAll("tr"));
  const dataRows = allRows.filter((r) => r.querySelector("td"));
  if (dataRows.length === 0) return;
  const dataCells = (row) => Array.from(row.querySelectorAll("td")).filter((td) => !td.classList.contains("table-calc-row-label"));
  const grid = dataRows.map((row) => dataCells(row).map((td) => td.textContent.trim()));
  dataRows.forEach((row) => {
    dataCells(row).forEach((td) => {
      const text = td.textContent.trim();
      if (!text.startsWith("=")) return;
      const result = evalFormula(text, grid);
      const isErr = typeof result === "string" && result.startsWith("#");
      const display = formatResult(result);
      td.setAttribute("data-formula", text);
      if (isReadingView) {
        td.textContent = display;
        td.title = text;
        td.classList.add(isErr ? "table-calc-error-cell" : "table-calc-cell");
      } else {
        td.title = isErr ? `${text} \u2192 ${display}` : `${text} = ${display}`;
        td.classList.add(isErr ? "table-calc-lp-error" : "table-calc-lp-formula");
      }
    });
  });
  decorateTable(tableEl, settings);
  tableEl.dataset.tableCalc = "done";
}
var TableCalcPlugin = class extends Plugin {
  constructor(...args) {
    super(...args);
    this.observers = [];
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new TableCalcSettingTab(this.app, this));
    this.registerMarkdownPostProcessor((el, ctx) => {
      el.querySelectorAll("p").forEach((p) => {
        if (p.textContent.trim() === "{{calc}}") p.style.display = "none";
      });
      const tables = Array.from(el.querySelectorAll("table"));
      if (tables.length === 0) return;
      const markerInEl = Array.from(el.querySelectorAll("p")).some((p) => p.textContent.trim() === "{{calc}}");
      if (markerInEl) {
        tables.forEach((t) => {
          t.dataset.tableCalcMarked = "true";
        });
      } else {
        const info = ctx.getSectionInfo(el);
        if (info && info.lineStart > 0) {
          const lines = info.text.split("\n");
          for (let i = info.lineStart - 1; i >= Math.max(0, info.lineStart - 4); i--) {
            const line = lines[i].trim();
            if (line === "{{calc}}") {
              tables.forEach((t) => {
                t.dataset.tableCalcMarked = "true";
              });
              break;
            }
            if (line !== "") break;
          }
        }
      }
      tables.forEach((t) => processTable(t, this.settings, ctx.sourcePath));
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.attachObserver(leaf);
        const view = leaf?.view;
        if (view instanceof MarkdownView && view.file) {
          this.buildFingerprints(view.file);
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file) this.buildFingerprints(file);
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, info) => {
        const file = info?.file;
        if (!file) return;
        clearTimeout(this._fingerprintTimer);
        this._fingerprintTimer = setTimeout(() => {
          this.buildFingerprints(file, editor.getValue());
        }, 200);
      })
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.file) this.buildFingerprints(view.file);
      })
    );
    this.app.workspace.iterateAllLeaves((leaf) => this.attachObserver(leaf));
    this.addCommand({
      id: "evaluate",
      name: "Evaluate table formulas in this note",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return false;
        if (!checking) {
          view.contentEl.querySelectorAll("table[data-table-calc]").forEach((t) => {
            delete t.dataset.tableCalc;
            delete t.dataset.tableCalcMarked;
          });
          this.reprocess(view.contentEl, view.file?.path);
          new Notice("Table Calc: formulas evaluated");
        }
        return true;
      }
    });
  }
  reprocess(contentEl, filePath) {
    contentEl.querySelectorAll("p").forEach((p) => {
      if (p.textContent.trim() !== "{{calc}}") return;
      p.style.display = "none";
      let table = null;
      const next = p.nextElementSibling;
      if (next) {
        table = next.tagName === "TABLE" ? next : next.querySelector && next.querySelector("table");
      }
      if (!table && p.parentElement) {
        const parentNext = p.parentElement.nextElementSibling;
        if (parentNext) {
          table = parentNext.tagName === "TABLE" ? parentNext : parentNext.querySelector && parentNext.querySelector("table");
        }
      }
      if (table) table.dataset.tableCalcMarked = "true";
    });
    contentEl.querySelectorAll("table").forEach((t) => processTable(t, this.settings, filePath));
  }
  attachObserver(leaf) {
    if (!leaf || !leaf.view || !leaf.view.contentEl) return;
    const el = leaf.view.contentEl;
    if (el._tableCalcObserver) return;
    const observer = new MutationObserver((mutations) => {
      const tables = /* @__PURE__ */ new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches("table")) tables.add(node);
          else if (node.querySelectorAll) node.querySelectorAll("table").forEach((t) => tables.add(t));
        }
        const targetEl = mutation.target && mutation.target.nodeType === 3 ? mutation.target.parentElement : mutation.target && mutation.target.nodeType === 1 ? mutation.target : null;
        if (targetEl) {
          const tbl = targetEl.closest ? targetEl.closest("table") : null;
          if (tbl) tables.add(tbl);
        }
      }
      if (tables.size === 0) return;
      const filePath = this.app.workspace.getActiveFile()?.path;
      setTimeout(() => tables.forEach((t) => {
        if (t.dataset.tableCalc !== "done") delete t.dataset.tableCalc;
        processTable(t, this.settings, filePath);
      }), 150);
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    el._tableCalcObserver = observer;
    this.observers.push(observer);
    const initPath = this.app.workspace.getActiveFile()?.path;
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
      const lines = source.split("\n");
      const fps = /* @__PURE__ */ new Set();
      let seenCalc = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "{{calc}}") {
          seenCalc = true;
        } else if (seenCalc && trimmed.startsWith("|")) {
          const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
          if (cells.every((c) => /^[-:]+$/.test(c))) continue;
          fps.add(cells.join("\0"));
          seenCalc = false;
        } else if (trimmed !== "") {
          seenCalc = false;
        }
      }
      calcTableFingerprints.set(file.path, fps);
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.file?.path === file.path) {
        view.contentEl.querySelectorAll('table[data-table-calc="skip"]').forEach((t) => {
          delete t.dataset.tableCalc;
          processTable(t, this.settings, file.path);
        });
      }
    } catch (_) {
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  onunload() {
    this.observers.forEach((o) => o.disconnect());
    this.observers = [];
    document.querySelectorAll("[data-table-calc]").forEach((el) => {
      delete el.dataset.tableCalc;
    });
  }
};
module.exports = TableCalcPlugin;
module.exports.processTable = processTable;
module.exports.decorateTable = decorateTable;
module.exports.hasCalcMarker = hasCalcMarker;

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
    function getGridValue(grid, r, c, depth) {
      if (depth <= 0 || r < 0 || r >= grid.length) return 0;
      const raw = getRawCell(grid, r, c);
      if (!raw) return 0;
      if (raw.startsWith("=")) return +evalFormula2(raw, grid, depth - 1) || 0;
      const n = parseFloat(raw);
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
        const n = parseFloat(t);
        if (!isNaN(n)) vals.push({ num: n, raw: t });
      }
      return vals;
    }
    function evalFormula2(formula, grid, depth) {
      if (depth === void 0) depth = 20;
      if (!formula || !formula.startsWith("=")) return formula;
      let expr = formula.slice(1).trim();
      let earlyError = null;
      let prevExpr;
      let passes = 0;
      do {
        prevExpr = expr;
        expr = expr.replace(/([A-Z]+)\(([^()]*)\)/gi, function(_, fn, args) {
          if (earlyError) return 0;
          const pairs = resolveArgs(args, grid, depth);
          const nums = pairs.map((p) => p.num).filter((v) => typeof v === "number" && isFinite(v));
          const numericCount = pairs.filter((p) => p.raw !== "" && !isNaN(parseFloat(p.raw))).length;
          const sum = nums.reduce((a, b) => a + b, 0);
          switch (fn.toUpperCase()) {
            case "SUM":
              return sum;
            case "AVG":
            case "AVERAGE":
              return nums.length ? sum / nums.length : 0;
            case "MIN":
              return nums.length ? Math.min(...nums) : 0;
            case "MAX":
              return nums.length ? Math.max(...nums) : 0;
            case "COUNT":
              return numericCount;
            case "ABS":
              return Math.abs(nums[0] || 0);
            case "ROUND":
              return Math.round((nums[0] || 0) * Math.pow(10, nums[1] || 0)) / Math.pow(10, nums[1] || 0);
            default:
              earlyError = "#NAME?";
              return 0;
          }
        });
      } while (!earlyError && expr !== prevExpr && ++passes < 10);
      if (earlyError) return earlyError;
      expr = expr.replace(/\b([A-Z]\d+)\b/gi, function(_, ref) {
        const pos = parseRef(ref);
        return pos ? getGridValue(grid, pos.r, pos.c, depth) : 0;
      });
      if (!/^[\d\s+\-*\/().%]+$/.test(expr)) return "#ERR";
      try {
        const result = Function('"use strict"; return (' + expr + ")")();
        if (typeof result !== "number" || !isFinite(result)) return "#ERR";
        return Number.isInteger(result) ? result : parseFloat(result.toFixed(8));
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
var { Plugin, MarkdownView, Notice } = require("obsidian");
var { evalFormula, formatResult } = require_engine();
var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function decorateTable(tableEl) {
  const allRows = Array.from(tableEl.querySelectorAll("tr"));
  const headerRows = allRows.filter((r) => r.querySelector("th"));
  const dataRows = allRows.filter((r) => r.querySelector("td"));
  if (dataRows.length === 0) return;
  const dataCols = dataRows[0].querySelectorAll("td").length - 1;
  const colLetterRow = createEl("tr", { cls: "table-calc-col-headers" });
  colLetterRow.createEl("th", { cls: "table-calc-corner" });
  for (let c = 0; c < dataCols; c++) {
    colLetterRow.createEl("th", { cls: "table-calc-col-label", text: LETTERS[c] || String(c + 1) });
  }
  const thead = tableEl.querySelector("thead");
  if (thead) {
    thead.insertBefore(colLetterRow, thead.firstChild);
  } else {
    tableEl.insertBefore(colLetterRow, tableEl.firstChild);
  }
  headerRows.forEach((row) => {
    const firstTh = row.querySelector("th");
    if (firstTh) {
      firstTh.textContent = "";
      firstTh.className = "table-calc-row-label table-calc-corner";
    }
  });
  dataRows.forEach((row, r) => {
    const firstTd = row.querySelector("td");
    if (firstTd) {
      firstTd.textContent = r + 1;
      firstTd.className = "table-calc-row-label";
      firstTd.removeAttribute("data-formula");
    }
  });
}
function hasCalcMarker(tableEl) {
  const firstTh = tableEl.querySelector("th");
  return firstTh && firstTh.textContent.trim().toLowerCase() === "{calc}";
}
function processTable(tableEl) {
  if (tableEl.dataset.tableCalc === "done") return;
  if (!hasCalcMarker(tableEl)) {
    tableEl.dataset.tableCalc = "skip";
    return;
  }
  const allRows = Array.from(tableEl.querySelectorAll("tr"));
  const dataRows = allRows.filter((r) => r.querySelector("td"));
  if (dataRows.length === 0) return;
  const grid = dataRows.map(
    (row) => Array.from(row.querySelectorAll("td")).slice(1).map((td) => td.textContent.trim())
  );
  dataRows.forEach((row, r) => {
    Array.from(row.querySelectorAll("td")).slice(1).forEach((td, c) => {
      const text = td.textContent.trim();
      if (!text.startsWith("=")) return;
      const result = evalFormula(text, grid);
      const isErr = typeof result === "string" && result.startsWith("#");
      td.setAttribute("data-formula", text);
      td.textContent = formatResult(result);
      td.classList.add(isErr ? "table-calc-error-cell" : "table-calc-cell");
      td.title = text;
    });
  });
  decorateTable(tableEl);
  tableEl.dataset.tableCalc = "done";
}
function processEl(el) {
  el.querySelectorAll("table").forEach(processTable);
}
var TableCalcPlugin = class extends Plugin {
  constructor(...args) {
    super(...args);
    this.observers = [];
  }
  async onload() {
    this.registerMarkdownPostProcessor((el) => {
      processEl(el);
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.attachObserver(leaf);
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
          });
          processEl(view.contentEl);
          new Notice("Table Calc: formulas evaluated");
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
      const tables = /* @__PURE__ */ new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches("table")) {
            tables.add(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll("table").forEach((t) => tables.add(t));
          }
        }
      }
      if (tables.size === 0) return;
      setTimeout(() => tables.forEach((t) => {
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
    this.observers.forEach((o) => o.disconnect());
    this.observers = [];
    document.querySelectorAll("[data-table-calc]").forEach((el) => {
      delete el.dataset.tableCalc;
    });
  }
};
module.exports = TableCalcPlugin;

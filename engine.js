'use strict';

// ─── Formula Engine ───────────────────────────────────────────────────────────

function parseRef(s) {
  const m = s.trim().match(/^([A-Z])(\d+)$/i);
  if (!m) return null;
  return { r: parseInt(m[2]) - 1, c: m[1].toUpperCase().charCodeAt(0) - 65 };
}

// Returns the raw cell string (not coerced to number) for COUNT/type checks.
function getRawCell(grid, r, c) {
  if (r < 0 || r >= grid.length) return '';
  const row = grid[r];
  if (!row || c < 0 || c >= row.length) return '';
  return row[c].trim();
}

function getGridValue(grid, r, c, depth) {
  if (depth <= 0 || r < 0 || r >= grid.length) return 0;
  const raw = getRawCell(grid, r, c);
  if (!raw) return 0;
  if (raw.startsWith('=')) return +(evalFormula(raw, grid, depth - 1)) || 0;
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

// resolveArgs returns { num, raw } pairs so COUNT can distinguish text from numbers.
function resolveArgs(argsStr, grid, depth) {
  const vals = [];
  for (const part of argsStr.split(',')) {
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

function evalFormula(formula, grid, depth) {
  if (depth === undefined) depth = 20;
  if (!formula || !formula.startsWith('=')) return formula;
  let expr = formula.slice(1).trim();

  // Evaluate functions innermost-first using multiple passes.
  // [^()]* ensures we only match calls with no nested parens in their args,
  // so nested calls like ROUND(AVG(A1:A3), 2) resolve AVG first, then ROUND.
  let earlyError = null;
  let prevExpr;
  let passes = 0;
  do {
    prevExpr = expr;
    expr = expr.replace(/([A-Z]+)\(([^()]*)\)/gi, function(_, fn, args) {
      if (earlyError) return 0;
      const pairs = resolveArgs(args, grid, depth);
      const nums = pairs.map(p => p.num).filter(v => typeof v === 'number' && isFinite(v));
      const numericCount = pairs.filter(p => p.raw !== '' && !isNaN(parseFloat(p.raw))).length;
      const sum = nums.reduce((a, b) => a + b, 0);
      switch (fn.toUpperCase()) {
        case 'SUM':     return sum;
        case 'AVG':
        case 'AVERAGE': return nums.length ? sum / nums.length : 0;
        case 'MIN':     return nums.length ? Math.min(...nums) : 0;
        case 'MAX':     return nums.length ? Math.max(...nums) : 0;
        case 'COUNT':   return numericCount;
        case 'ABS':     return Math.abs(nums[0] || 0);
        case 'ROUND':   return Math.round((nums[0] || 0) * Math.pow(10, nums[1] || 0)) / Math.pow(10, nums[1] || 0);
        default:        earlyError = '#NAME?'; return 0;
      }
    });
  } while (!earlyError && expr !== prevExpr && ++passes < 10);
  if (earlyError) return earlyError;

  expr = expr.replace(/\b([A-Z]\d+)\b/gi, function(_, ref) {
    const pos = parseRef(ref);
    return pos ? getGridValue(grid, pos.r, pos.c, depth) : 0;
  });

  if (!/^[\d\s+\-*\/().%]+$/.test(expr)) return '#ERR';
  try {
    const result = Function('"use strict"; return (' + expr + ')')();
    if (typeof result !== 'number' || !isFinite(result)) return '#ERR';
    return Number.isInteger(result) ? result : parseFloat(result.toFixed(8));
  } catch (e) {
    return '#ERR';
  }
}

function formatResult(val) {
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : parseFloat(val.toFixed(6)).toString();
  }
  return String(val);
}

module.exports = { parseRef, evalFormula, formatResult };

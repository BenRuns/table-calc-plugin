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

// Stricter than parseFloat: parseFloat accepts the literal strings
// "Infinity"/"-Infinity" as numeric, and silently truncates at the first
// invalid character (parseFloat('1,234') === 1, parseFloat('5 apples') === 5).
// A cell containing that text almost never means the number it would yield,
// so anything that isn't a complete, well-formed numeral is treated as text.
function parseCellNumber(str) {
  return /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(str) ? parseFloat(str) : NaN;
}

function getGridValue(grid, r, c, depth) {
  if (depth <= 0 || r < 0 || r >= grid.length) return 0;
  const raw = getRawCell(grid, r, c);
  if (!raw) return 0;
  if (raw.startsWith('=')) return +(evalFormula(raw, grid, depth - 1)) || 0;
  const n = parseCellNumber(raw);
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
    const n = parseCellNumber(t);
    if (!isNaN(n)) vals.push({ num: n, raw: t });
  }
  return vals;
}

// Shifts the decimal point of `num` by `exp` places via string manipulation,
// so the shift itself introduces no binary floating-point error. Plain
// `num * 10 ** exp` drifts for inputs like 1.005 (1.005 * 100 ===
// 100.49999999999999), which makes naive rounding silently wrong.
function shiftDecimal(num, exp) {
  const [mantissa, exponent] = String(num).split('e');
  return Number(mantissa + 'e' + (Number(exponent || 0) + exp));
}

function preciseRound(num, decimals) {
  const shifted = shiftDecimal(num, decimals);
  // Math.round breaks ties toward +Infinity (Math.round(-2.5) === -2);
  // round half away from zero instead, matching spreadsheet ROUND semantics.
  const rounded = Math.sign(shifted) * Math.round(Math.abs(shifted));
  return shiftDecimal(rounded, -decimals);
}

function preciseTrunc(num, decimals) {
  return shiftDecimal(Math.trunc(shiftDecimal(num, decimals)), -decimals);
}

function evalFormula(formula, grid, depth) {
  if (depth === undefined) depth = 20;
  if (!formula || !formula.startsWith('=')) return formula;
  let expr = formula.slice(1).trim();

  try {
    // Evaluate functions innermost-first using multiple passes.
    // [^()]* ensures we only match calls with no nested parens in their args,
    // so nested calls like ROUND(AVG(A1:A3), 2) resolve AVG first, then ROUND.
    let earlyError = null;
    let prevExpr;
    let passes = 0;
    do {
      prevExpr = expr;
      expr = expr.replace(/([A-Z][A-Z0-9]*)\(([^()]*)\)/gi, function(_, fn, args) {
        if (earlyError) return 0;
        const pairs = resolveArgs(args, grid, depth);
        const nums = pairs.map(p => p.num).filter(v => typeof v === 'number' && isFinite(v));
        const numericCount = pairs.filter(p => p.raw !== '' && !isNaN(parseCellNumber(p.raw))).length;
        const nonEmptyCount = pairs.filter(p => p.raw !== '').length;
        const sum = nums.reduce((a, b) => a + b, 0);
        const sorted = [...nums].sort((a, b) => a - b);
        switch (fn.toUpperCase()) {
          case 'SUM':     return sum;
          case 'AVG':
          case 'AVERAGE': return nums.length ? sum / nums.length : 0;
          // reduce (not Math.min/max(...nums)) avoids RangeError: Maximum
          // call stack size exceeded when spreading very large ranges.
          case 'MIN':     return nums.length ? nums.reduce((a, b) => Math.min(a, b)) : 0;
          case 'MAX':     return nums.length ? nums.reduce((a, b) => Math.max(a, b)) : 0;
          case 'COUNT':   return numericCount;
          case 'COUNTA':  return nonEmptyCount;
          case 'ABS':     return Math.abs(nums[0] || 0);
          case 'ROUND':   return preciseRound(nums[0] || 0, nums[1] || 0);
          case 'FLOOR':   return Math.floor(nums[0] || 0);
          case 'CEIL':
          case 'CEILING': return Math.ceil(nums[0] || 0);
          case 'TRUNC':   return preciseTrunc(nums[0] || 0, nums[1] || 0);
          case 'INT':     return Math.floor(nums[0] || 0);
          case 'SIGN':    return Math.sign(nums[0] || 0);
          case 'SQRT':    return Math.sqrt(nums[0] || 0);
          case 'POW':
          case 'POWER':   return Math.pow(nums[0], nums[1]);
          case 'MOD':     return nums[0] % nums[1];
          case 'EXP':     return Math.exp(nums[0] || 0);
          case 'LOG':     return nums.length > 1 ? Math.log(nums[0]) / Math.log(nums[1]) : Math.log(nums[0]);
          case 'LOG10':   return Math.log10(nums[0]);
          case 'PI':      return Math.PI;
          case 'MEDIAN': {
            if (!sorted.length) return 0;
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
          }
          case 'PRODUCT': return nums.length ? nums.reduce((a, b) => a * b, 1) : 0;
          case 'STDEV':
          case 'VAR': {
            if (nums.length < 2) return 0;
            const mean = sum / nums.length;
            const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1);
            return fn.toUpperCase() === 'VAR' ? variance : Math.sqrt(variance);
          }
          default:        earlyError = '#NAME?'; return 0;
        }
      });
    } while (!earlyError && expr !== prevExpr && ++passes < 10);
    if (earlyError) return earlyError;

    expr = expr.replace(/\b([A-Z]\d+)\b/gi, function(_, ref) {
      const pos = parseRef(ref);
      return pos ? getGridValue(grid, pos.r, pos.c, depth) : 0;
    });

    // '^' isn't a JS operator (it's bitwise XOR), so translate the spreadsheet
    // exponent syntax to '**' before validating/evaluating the expression.
    expr = expr.replace(/\^/g, '**');

    // 'e'/'E' is allowed so scientific-notation values round-trip cleanly:
    // a function/cell result like 1e-7 or 3e+21 is embedded into `expr` via
    // JS's default Number-to-String conversion, which itself switches to
    // exponential notation outside the 1e-6..1e21 range. Without 'e' in the
    // whitelist, a perfectly valid result like ABS(-0.0000001) would fail
    // this check and incorrectly return #ERR.
    if (!/^[\d\s+\-*\/().%eE]+$/.test(expr)) return '#ERR';
    const result = Function('"use strict"; return (' + expr + ')')();
    if (typeof result !== 'number' || !isFinite(result)) return '#ERR';
    // `|| 0` normalizes -0 to 0 (-0 + 0 === 0): -0 is a legitimate result of
    // e.g. `=0*-1`, but is a footgun for callers comparing with strict
    // equality (Object.is(-0, 0) is false) and serves no display purpose.
    return Number.isInteger(result) ? (result || 0) : parseFloat(result.toFixed(8));
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

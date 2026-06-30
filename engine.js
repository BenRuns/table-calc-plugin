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
    // Always push literal tokens, even unparseable ones (num: NaN) — callers
    // that care about "was an argument provided" (e.g. LOG's 1-arg-vs-2-arg
    // check) need an accurate arg count; silently dropping invalid literals
    // previously made e.g. LOG(8, abc) look like a 1-arg call.
    vals.push({ num: parseCellNumber(t), raw: t });
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

// JS's `%` returns a result with the sign of the dividend (-7 % 3 === -1);
// spreadsheets define MOD as taking the sign of the divisor (MOD(-7,3) === 2).
function spreadsheetMod(a, b) {
  const r = a % b;
  return r !== 0 && (r < 0) !== (b < 0) ? r + b : r;
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
        // `nums`: every resolved value, including the 0s that blank/text
        // range cells contribute — matches the documented SUM/AVG convention
        // (a non-numeric cell "contributes 0" rather than being skipped).
        const nums = pairs.map(p => p.num).filter(v => typeof v === 'number' && isFinite(v));
        // `numericVals`: only genuinely numeric, non-blank entries. Functions
        // where a phantom 0 would corrupt the result more than just skew a
        // running total (PRODUCT zeroing out entirely, MEDIAN/STDEV/VAR
        // treating a text cell as a real data point) use this instead.
        const numericVals = pairs
          .filter(p => p.raw !== '' && !isNaN(parseCellNumber(p.raw)))
          .map(p => p.num);
        let result;
        switch (fn.toUpperCase()) {
          case 'SUM':     result = nums.reduce((a, b) => a + b, 0); break;
          case 'AVG':
          case 'AVERAGE': result = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; break;
          // reduce (not Math.min/max(...nums)) avoids RangeError: Maximum
          // call stack size exceeded when spreading very large ranges.
          case 'MIN':     result = numericVals.length ? numericVals.reduce((a, b) => Math.min(a, b)) : 0; break;
          case 'MAX':     result = numericVals.length ? numericVals.reduce((a, b) => Math.max(a, b)) : 0; break;
          case 'COUNT':   result = numericVals.length; break;
          case 'COUNTA':  result = pairs.filter(p => p.raw !== '').length; break;
          case 'ABS':     result = Math.abs(nums[0] || 0); break;
          case 'ROUND':   result = preciseRound(nums[0] || 0, nums[1] || 0); break;
          case 'FLOOR':
          case 'INT':     result = Math.floor(nums[0] || 0); break;
          case 'CEIL':
          case 'CEILING': result = Math.ceil(nums[0] || 0); break;
          case 'TRUNC':   result = preciseTrunc(nums[0] || 0, nums[1] || 0); break;
          case 'SIGN':    result = Math.sign(nums[0] || 0); break;
          case 'SQRT':    result = Math.sqrt(nums[0] || 0); break;
          case 'POW':
          case 'POWER':   result = Math.pow(nums[0] || 0, nums[1] || 0); break;
          case 'MOD':     result = spreadsheetMod(nums[0] || 0, nums[1] || 0); break;
          case 'EXP':     result = Math.exp(nums[0] || 0); break;
          // pairs.length (not nums.length) decides arg count: nums silently
          // drops invalid/non-numeric entries, which previously made
          // LOG(8, <bad literal>) look like a 1-arg call and fall back to
          // natural log instead of erroring.
          case 'LOG':     result = pairs.length > 1 ? Math.log(nums[0]) / Math.log(nums[1]) : Math.log(nums[0]); break;
          case 'LOG10':   result = Math.log10(nums[0]); break;
          case 'PI':      result = Math.PI; break;
          case 'MEDIAN': {
            const sorted = [...numericVals].sort((a, b) => a - b);
            if (!sorted.length) { result = 0; break; }
            const mid = Math.floor(sorted.length / 2);
            result = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            break;
          }
          case 'PRODUCT': result = numericVals.length ? numericVals.reduce((a, b) => a * b, 1) : 0; break;
          case 'STDEV':
          case 'VAR': {
            if (numericVals.length < 2) { result = 0; break; }
            const mean = numericVals.reduce((a, b) => a + b, 0) / numericVals.length;
            const variance = numericVals.reduce((a, b) => a + (b - mean) ** 2, 0) / (numericVals.length - 1);
            result = fn.toUpperCase() === 'VAR' ? variance : Math.sqrt(variance);
            break;
          }
          default:        earlyError = '#NAME?'; return 0;
        }
        // A function call that produces NaN/Infinity (SQRT(-4), LOG(0), a
        // missing-arg MOD, ...) must invalidate the whole formula. Without
        // this check the NaN/Infinity gets stringified into `expr` and, on
        // the next pass, silently dropped as an "unparseable" argument to
        // whatever function it's nested inside — e.g. SUM(SQRT(-4), 5) would
        // quietly return 5 instead of erroring.
        if (typeof result !== 'number' || !isFinite(result)) {
          earlyError = '#ERR';
          return 0;
        }
        return result;
      });
    } while (!earlyError && expr !== prevExpr && ++passes < 100);
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
    return Number.isInteger(result) ? (result || 0) : (parseFloat(result.toFixed(8)) || 0);
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

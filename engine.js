'use strict';

// ─── Formula Engine ───────────────────────────────────────────────────────────

function parseRef(s) {
  const m = s.trim().match(/^([A-Z])(\d+)$/i);
  if (!m) return null;
  return { r: parseInt(m[2], 10) - 1, c: m[1].toUpperCase().charCodeAt(0) - 65 };
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
//
// Thousands separators are supported, but only when correctly grouped in
// 3s (1,234 / 1,234,567.89) — a comma anywhere else (12,34) marks the cell
// as malformed text rather than guessing at what it meant.
const CELL_NUMBER_RE = /^[+-]?((\d+|\d{1,3}(?:,\d{3})+)(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

function parseCellNumber(str) {
  return CELL_NUMBER_RE.test(str) ? parseFloat(str.replace(/,/g, '')) : NaN;
}

// ─── Durations ────────────────────────────────────────────────────────────────
//
// Cells like `03:36` or `1:02:45` are durations. Internally a duration is a
// plain number of seconds, so every function and operator works on it
// unchanged; a separate format (`fmt`) travels alongside so the result can be
// displayed the same way the inputs were written.
//
//   two parts   m:ss    (`03:36` = 3 min 36 s; the first field is unbounded,
//                        so `75:00` is 75 minutes)
//   three parts h:mm:ss (`1:02:45`; hours unbounded, so totals past 24h
//                        never wrap the way a time-of-day would)
//   either may carry fractional seconds: `3:05.5`, `0:01:02.25`
//
// Two-part values are ambiguous in general (Excel reads `03:36` as h:mm).
// Treating them as m:ss is only observable when they're mixed with
// three-part values or used in arithmetic with plain numbers: a column of
// two-part values sums to the same digits under either reading (`03:36` +
// `02:29` = `06:05`), because the output keeps the two-part form and leaves
// its first field unbounded.
const DURATION_RE = /^([+-]?)(\d+):([0-5]\d)(?::([0-5]\d))?(?:\.(\d+))?$/;
// Same shape, for duration literals typed inline in an arithmetic formula
// (`=A1+1:30`). The lookarounds keep it from matching inside a cell
// reference (`B1:30` has no word boundary before the 1) or a decimal.
const INLINE_DURATION_RE = /(?<![\w.:])\d+:[0-5]\d(?::[0-5]\d)?(?:\.\d+)?(?![\w.:])/g;
const MAX_DURATION_DECIMALS = 3;

class Duration {
  constructor(seconds, fmt) {
    this.seconds = seconds;
    this.fmt = fmt;
  }
}

function parseDuration(str) {
  const m = DURATION_RE.exec(str);
  if (!m) return null;
  const [, sign, a, b, c, frac] = m;
  let seconds =
    c === undefined ? Number(a) * 60 + Number(b) : Number(a) * 3600 + Number(b) * 60 + Number(c);
  if (frac) seconds += Number(`0.${frac}`);
  return {
    seconds: sign === '-' ? -seconds : seconds,
    fmt: {
      parts: c === undefined ? 2 : 3,
      pad: a.length >= 2,
      decimals: Math.min(frac ? frac.length : 0, MAX_DURATION_DECIMALS),
    },
  };
}

// Combines the formats of every duration feeding a result: three parts win
// over two (so mixed m:ss/h:mm:ss input shows h:mm:ss), and the result keeps
// the most precise fractional seconds of any input.
function mergeDurationFmt(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    parts: Math.max(a.parts, b.parts),
    pad: a.pad || b.pad,
    decimals: Math.max(a.decimals, b.decimals),
  };
}

function formatDuration(seconds, fmt) {
  const scale = 10 ** fmt.decimals;
  // Round once, in integer units, so 59.9996s can't display as `0:60`.
  const units = Math.round(Math.abs(seconds) * scale);
  const whole = Math.floor(units / scale);
  const pad2 = (n) => String(n).padStart(2, '0');
  let out = pad2(whole % 60);
  if (fmt.decimals) out += `.${String(units % scale).padStart(fmt.decimals, '0')}`;
  let lead;
  if (fmt.parts === 3) {
    out = `${pad2(Math.floor((whole % 3600) / 60))}:${out}`;
    lead = Math.floor(whole / 3600);
  } else {
    lead = Math.floor(whole / 60);
  }
  out = `${fmt.pad ? pad2(lead) : lead}:${out}`;
  return seconds < 0 && units !== 0 ? `-${out}` : out;
}

// Functions whose result is in the same unit as their input, so a duration
// in gives a duration out (SUM of song lengths is a length). Functions that
// count, or that change the unit (PRODUCT, VAR, SQRT, ...), return plain
// numbers even when given durations.
const DURATION_FNS = new Set([
  'SUM',
  'AVERAGE',
  'MEDIAN',
  'MIN',
  'MAX',
  'ABS',
  'ROUND',
  'FLOOR',
  'INT',
  'CEILING',
  'TRUNC',
  'STDEV',
]);

// Functions that take a specific single/positional argument (as opposed to
// aggregating a whole range) treat a text argument the same way a bare
// `=A1` reference does: the whole formula errors, matching Excel/Sheets'
// #VALUE! for direct arithmetic on text.
const SINGLE_VALUE_FNS = new Set([
  'ABS',
  'ROUND',
  'FLOOR',
  'INT',
  'CEILING',
  'TRUNC',
  'SIGN',
  'SQRT',
  'POW',
  'POWER',
  'MOD',
  'EXP',
  'LN',
  'LOG',
  'LOG10',
]);

// Every cell/argument value flows through one of these two classifiers, so
// there is exactly one place that decides "blank vs. text vs. number vs.
// error" — every consumer (bare references, SUM/AVERAGE, MIN/MAX, ABS/ROUND,
// COUNT/COUNTA, ...) reads the same verdict instead of each re-deriving its
// own slightly-different notion of "is this usable".
//   'blank'  — empty cell/argument slot; contributes 0, excluded from COUNTA
//   'text'   — non-blank, non-formula, not a well-formed number
//   'error'  — a formula that itself resolved to an error (e.g. '#ERR')
//   'number' — a well-formed number, or a formula that resolved to one
//
// A literal argument typed directly in the formula (not a cell reference)
// can never be 'error' — it isn't evaluated as a nested formula, matching
// the pre-existing behavior for e.g. `=SUM(5, abc)`.
function classifyLiteral(raw) {
  if (raw === '') return { kind: 'blank', num: 0 };
  const n = parseCellNumber(raw);
  if (!Number.isNaN(n)) return { kind: 'number', num: n };
  const d = parseDuration(raw);
  return d ? { kind: 'number', num: d.seconds, dur: d.fmt } : { kind: 'text', num: 0 };
}

function classifyCell(grid, r, c, depth) {
  if (depth <= 0) return { kind: 'blank', num: 0 };
  const raw = getRawCell(grid, r, c);
  if (raw.startsWith('=')) {
    const result = evalFormula(raw, grid, depth - 1);
    if (result instanceof Duration) return { kind: 'number', num: result.seconds, dur: result.fmt };
    return typeof result === 'number' ? { kind: 'number', num: result } : { kind: 'error', num: 0 };
  }
  return classifyLiteral(raw);
}

// resolveArgs returns one classification per argument so callers can tell
// blank, text, number, and error apart without re-parsing.
function resolveArgs(argsStr, grid, depth) {
  const vals = [];
  for (const part of argsStr.split(',')) {
    const t = part.trim();
    const rangeM = t.match(/^([A-Z]\d+):([A-Z]\d+)$/i);
    if (rangeM) {
      const from = parseRef(rangeM[1]),
        to = parseRef(rangeM[2]);
      if (from && to) {
        for (let r = Math.min(from.r, to.r); r <= Math.max(from.r, to.r); r++)
          for (let c = Math.min(from.c, to.c); c <= Math.max(from.c, to.c); c++) {
            vals.push(classifyCell(grid, r, c, depth));
          }
      }
      continue;
    }
    const ref = parseRef(t);
    if (ref) {
      vals.push(classifyCell(grid, ref.r, ref.c, depth));
      continue;
    }
    // Always push literal tokens, even unparseable ones — callers that care
    // about "was an argument provided" (e.g. LOG's 1-arg-vs-2-arg check)
    // need an accurate arg count; silently dropping invalid literals
    // previously made e.g. LOG(8, abc) look like a 1-arg call.
    vals.push(classifyLiteral(t));
  }
  return vals;
}

// Shifts the decimal point of `num` by `exp` places via string manipulation,
// so the shift itself introduces no binary floating-point error. Plain
// `num * 10 ** exp` drifts for inputs like 1.005 (1.005 * 100 ===
// 100.49999999999999), which makes naive rounding silently wrong.
function shiftDecimal(num, exp) {
  const [mantissa, exponent] = String(num).split('e');
  return Number(`${mantissa}e${Number(exponent || 0) + exp}`);
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
  return r !== 0 && r < 0 !== b < 0 ? r + b : r;
}

function evalFormula(formula, grid, depth) {
  if (depth === undefined) depth = 20;
  if (!formula?.startsWith('=')) return formula;
  let expr = formula.slice(1).trim();

  try {
    // Evaluate functions innermost-first using multiple passes.
    // [^()]* ensures we only match calls with no nested parens in their args,
    // so nested calls like ROUND(AVERAGE(A1:A3), 2) resolve AVERAGE first, then ROUND.
    let earlyError = null;
    // Set when any duration feeds the result: a duration-preserving
    // function given a duration argument, a direct reference to a duration
    // cell, or an inline duration literal. The final result is then shown
    // as a duration in this (merged) format.
    let durFmt = null;
    let prevExpr;
    let passes = 0;
    do {
      prevExpr = expr;
      expr = expr.replace(/([A-Z][A-Z0-9]*)\(([^()]*)\)/gi, (_, fn, args) => {
        if (earlyError) return 0;
        const fnName = fn.toUpperCase();
        const pairs = resolveArgs(args, grid, depth);
        // An 'error' argument (a nested formula that itself errored) always
        // invalidates the whole call — errors are contagious in spreadsheets,
        // unlike blank/text which individual functions may skip below.
        const hasError = pairs.some((p) => p.kind === 'error');
        if (hasError) {
          earlyError = '#ERR';
          return 0;
        }
        // `nums`: every resolved value, positionally — blank contributes 0.
        // Used by single-value functions (ABS, ROUND, ...), which separately
        // gate on `hasText` below since they take a specific argument rather
        // than aggregating a range.
        const nums = pairs.map((p) => p.num);
        const hasText = pairs.some((p) => p.kind === 'text');
        // `numericVals`: only genuine numbers — blank AND text excluded.
        // Used by functions where a phantom 0 would corrupt the result more
        // than just skew a running total (PRODUCT zeroing out entirely,
        // MIN/MAX/MEDIAN/STDEV/VAR treating a text cell as a real data point).
        const numericVals = pairs.filter((p) => p.kind === 'number').map((p) => p.num);
        // `nonTextNums`: like `nums`, but drops text (blanks still count as
        // 0). Matches Excel/Sheets: SUM/AVERAGE skip text cells in a range
        // rather than erroring or treating them as 0, but still count blanks.
        const nonTextNums = pairs.filter((p) => p.kind !== 'text').map((p) => p.num);
        // Functions that take a specific single/positional argument (as
        // opposed to aggregating a whole range) treat a text argument the
        // same way a bare `=A1` reference does: the whole formula errors,
        // matching Excel/Sheets' #VALUE! for direct arithmetic on text.
        if (hasText && SINGLE_VALUE_FNS.has(fnName)) {
          earlyError = '#ERR';
          return 0;
        }
        let result;
        switch (fnName) {
          case 'SUM':
            result = nonTextNums.reduce((a, b) => a + b, 0);
            break;
          case 'AVERAGE':
            result = nonTextNums.length
              ? nonTextNums.reduce((a, b) => a + b, 0) / nonTextNums.length
              : 0;
            break;
          // reduce (not Math.min/max(...nums)) avoids RangeError: Maximum
          // call stack size exceeded when spreading very large ranges.
          case 'MIN':
            result = numericVals.length ? numericVals.reduce((a, b) => Math.min(a, b)) : 0;
            break;
          case 'MAX':
            result = numericVals.length ? numericVals.reduce((a, b) => Math.max(a, b)) : 0;
            break;
          case 'COUNT':
            result = numericVals.length;
            break;
          case 'COUNTA':
            result = pairs.filter((p) => p.kind !== 'blank').length;
            break;
          case 'ABS':
            result = Math.abs(nums[0] || 0);
            break;
          case 'ROUND':
            result = preciseRound(nums[0] || 0, nums[1] || 0);
            break;
          case 'FLOOR':
          case 'INT':
            result = Math.floor(nums[0] || 0);
            break;
          case 'CEILING':
            result = Math.ceil(nums[0] || 0);
            break;
          case 'TRUNC':
            result = preciseTrunc(nums[0] || 0, nums[1] || 0);
            break;
          case 'SIGN':
            result = Math.sign(nums[0] || 0);
            break;
          case 'SQRT':
            result = Math.sqrt(nums[0] || 0);
            break;
          case 'POW':
          case 'POWER':
            result = (nums[0] || 0) ** (nums[1] || 0);
            break;
          case 'MOD':
            result = spreadsheetMod(nums[0] || 0, nums[1] || 0);
            break;
          case 'EXP':
            result = Math.exp(nums[0] || 0);
            break;
          // pairs.length (not nums.length) decides arg count: nums silently
          // drops invalid/non-numeric entries, which previously made
          // LOG(8, <bad literal>) look like a 1-arg call and fall back to
          // natural log instead of erroring.
          case 'LN':
            result = Math.log(nums[0]);
            break;
          case 'LOG':
            result = pairs.length > 1 ? Math.log(nums[0]) / Math.log(nums[1]) : Math.log10(nums[0]);
            break;
          case 'LOG10':
            result = Math.log10(nums[0]);
            break;
          case 'PI':
            result = Math.PI;
            break;
          case 'MEDIAN': {
            const sorted = [...numericVals].sort((a, b) => a - b);
            if (!sorted.length) {
              result = 0;
              break;
            }
            const mid = Math.floor(sorted.length / 2);
            result = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            break;
          }
          case 'PRODUCT':
            result = numericVals.length ? numericVals.reduce((a, b) => a * b, 1) : 0;
            break;
          case 'STDEV':
          case 'VAR': {
            if (numericVals.length < 2) {
              result = 0;
              break;
            }
            const mean = numericVals.reduce((a, b) => a + b, 0) / numericVals.length;
            const variance =
              numericVals.reduce((a, b) => a + (b - mean) ** 2, 0) / (numericVals.length - 1);
            result = fnName === 'VAR' ? variance : Math.sqrt(variance);
            break;
          }
          default:
            earlyError = '#NAME?';
            return 0;
        }
        // A function call that produces NaN/Infinity (SQRT(-4), LOG(0), a
        // missing-arg MOD, ...) must invalidate the whole formula. Without
        // this check the NaN/Infinity gets stringified into `expr` and, on
        // the next pass, silently dropped as an "unparseable" argument to
        // whatever function it's nested inside — e.g. SUM(SQRT(-4), 5) would
        // quietly return 5 instead of erroring.
        if (typeof result !== 'number' || !Number.isFinite(result)) {
          earlyError = '#ERR';
          return 0;
        }
        if (DURATION_FNS.has(fnName)) {
          for (const p of pairs) durFmt = mergeDurationFmt(durFmt, p.dur);
        }
        return result;
      });
    } while (!earlyError && expr !== prevExpr && ++passes < 100);
    if (earlyError) return earlyError;

    expr = expr.replace(INLINE_DURATION_RE, (lit) => {
      const d = parseDuration(lit);
      durFmt = mergeDurationFmt(durFmt, d.fmt);
      return d.seconds;
    });

    // A bare reference (=A1, =A1+5, ...) to a cell containing actual text,
    // or to a formula cell that itself resolved to an error, invalidates
    // the whole formula instead of silently substituting 0 — unlike a
    // blank cell, which stays a silent 0.
    let directRefError = false;
    expr = expr.replace(/\b([A-Z]\d+)\b/gi, (_, ref) => {
      if (directRefError) return 0;
      const pos = parseRef(ref);
      if (!pos) return 0;
      const cell = classifyCell(grid, pos.r, pos.c, depth);
      if (cell.kind === 'text' || cell.kind === 'error') {
        directRefError = true;
        return 0;
      }
      durFmt = mergeDurationFmt(durFmt, cell.dur);
      return cell.num;
    });
    if (directRefError) return '#ERR';

    // '^' isn't a JS operator (it's bitwise XOR), so translate the spreadsheet
    // exponent syntax to '**' before validating/evaluating the expression.
    expr = expr.replace(/\^/g, '**');

    // 'e'/'E' is allowed so scientific-notation values round-trip cleanly:
    // a function/cell result like 1e-7 or 3e+21 is embedded into `expr` via
    // JS's default Number-to-String conversion, which itself switches to
    // exponential notation outside the 1e-6..1e21 range. Without 'e' in the
    // whitelist, a perfectly valid result like ABS(-0.0000001) would fail
    // this check and incorrectly return #ERR.
    if (!/^[\d\s+\-*/().%eE]+$/.test(expr)) return '#ERR';
    const result = Function(`"use strict"; return (${expr})`)();
    if (typeof result !== 'number' || !Number.isFinite(result)) return '#ERR';
    // `|| 0` normalizes -0 to 0 (-0 + 0 === 0): -0 is a legitimate result of
    // e.g. `=0*-1`, but is a footgun for callers comparing with strict
    // equality (Object.is(-0, 0) is false) and serves no display purpose.
    const num = Number.isInteger(result) ? result || 0 : parseFloat(result.toFixed(8)) || 0;
    return durFmt ? new Duration(num, durFmt) : num;
  } catch (_e) {
    return '#ERR';
  }
}

function formatResult(val) {
  if (val instanceof Duration) return formatDuration(val.seconds, val.fmt);
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : parseFloat(val.toFixed(6)).toString();
  }
  return String(val);
}

module.exports = { parseRef, evalFormula, formatResult, Duration };

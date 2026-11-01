# Table Calc — Obsidian Plugin

Add spreadsheet-style formulas to your markdown tables. Write `=SUM(A1:A5)`, `=B1*C1`, or `=AVERAGE(A1:A3)` directly in any table cell and see the results rendered inline — in both Live Preview and Reading view.

> [!WARNING]
> **This is a hobby project, not intended for critical calculations.** Anyone is welcome to use it, but it comes with no warranty or guaranteed support, so please don't rely on it where a wrong result could cause harm or loss, such as medical, legal, financial, tax, engineering, or safety work. See the [Disclaimer](#disclaimer).

---

## Quick Start

Add `{{calc}}` above your table, separated by a blank line, to opt it into formula evaluation:

```markdown
{{calc}}

| Item        | Cost | Qty | Total       |
|-------------|------|-----|-------------|
| LLC filing  | 200  | 1   | =B1*C1      |
| Dev account | 99   | 1   | =B2*C2      |
| Accountant  | 250  | 1   | =B3*C3      |
| **Total**   |      |     | =SUM(D1:D3) |
```

The plugin hides the `{{calc}}` marker and adds column letters (A, B, C…) above the header and row numbers on the left so you always know which cell to reference.

Obsidian only renders a table that has a blank line above it, so if you type `{{calc}}` directly on the line above a table, the plugin inserts that blank line for you (as you type, when a note is opened, and in notes already open when the plugin loads).

`{{calc}}` applies only to the one table directly below it. Tables without a `{{calc}}` marker are left completely untouched, and deleting a table's `{{calc}}` turns it back into a plain table straight away.

---

## Column and Row Reference

| Label | Meaning |
|-------|---------|
| `A1`  | Row 1, first column |
| `B2`  | Row 2, second column |
| `A1:A5` | Range: column A, rows 1 through 5 |
| `A1:C3` | 2D range: columns A–C, rows 1–3 |

---

## Supported Formulas

### Functions

| Formula | Description | Example |
|---------|-------------|---------|
| `=SUM(A1:A5)` | Sum a range | `=SUM(D1:D3)` |
| `=AVERAGE(A1:A5)` | Average of a range | `=AVERAGE(B1:B4)` |
| `=MEDIAN(A1:A5)` | Median of a range | `=MEDIAN(B1:B5)` |
| `=MIN(A1:A5)` | Smallest value | `=MIN(B1:B10)` |
| `=MAX(A1:A5)` | Largest value | `=MAX(B1:B10)` |
| `=COUNT(A1:A5)` | Count numeric cells | `=COUNT(A1:A5)` |
| `=COUNTA(A1:A5)` | Count non-empty cells (numbers or text) | `=COUNTA(A1:A5)` |
| `=PRODUCT(A1:A5)` | Multiply a range together | `=PRODUCT(B1:B3)` |
| `=STDEV(A1:A5)` | Sample standard deviation | `=STDEV(B1:B10)` |
| `=VAR(A1:A5)` | Sample variance | `=VAR(B1:B10)` |
| `=ABS(A1)` | Absolute value | `=ABS(A3)` |
| `=ROUND(A1, 2)` | Round to N decimals | `=ROUND(B1, 2)` |
| `=FLOOR(A1)` | Round down to nearest integer | `=FLOOR(B1)` |
| `=CEILING(A1)` | Round up to nearest integer | `=CEILING(B1)` |
| `=TRUNC(A1, 2)` | Truncate to N decimals (no rounding) | `=TRUNC(B1, 2)` |
| `=INT(A1)` | Round down to integer | `=INT(B1)` |
| `=SIGN(A1)` | -1, 0, or 1 depending on sign | `=SIGN(B1)` |
| `=SQRT(A1)` | Square root | `=SQRT(B1)` |
| `=POW(A1, B1)` / `=POWER(A1, B1)` | Exponentiation | `=POW(2, 10)` |
| `=MOD(A1, B1)` | Remainder of division (result takes the sign of the divisor, e.g. `MOD(-7,3)` → `2`) | `=MOD(A1, 3)` |
| `=EXP(A1)` | e raised to the power of x | `=EXP(1)` |
| `=LN(A1)` | Natural logarithm | `=LN(8)` |
| `=LOG(A1)` / `=LOG(A1, base)` | Base-10 log (single-arg), or log to a given base | `=LOG(8, 2)` |
| `=LOG10(A1)` | Base-10 logarithm | `=LOG10(100)` |
| `=PI()` | The constant π | `=ROUND(PI(), 2)` |
| `=TIME(h, m, s)` | A duration of h hours, m minutes, s seconds (arguments truncated to integers; doesn't wrap at 24h, unlike Excel) | `=SUM(B1:B5)/TIME(0,1,0)` |

### Arithmetic

| Operator | Example |
|----------|---------|
| `+` | `=A1+B1` |
| `-` | `=A1-B1` |
| `*` | `=B1*C1` |
| `/` | `=A1/B1` |
| `^` | `=A1^2` (exponent) |
| Grouped | `=(A1+B1)*C1` |
| Scientific notation | `=1e3+1` → `1001` |

### Mixed

Combine functions and arithmetic freely:

```
=SUM(A1:A3)*1.1
=ROUND(AVERAGE(B1:B5), 2)
=A1+SUM(B1:B3)
```

> **Note:** Function arguments must be cell references, ranges, or literal numbers — not inline expressions. Use `=ABS(A1)` not `=ABS(A1-B1)`.

### Durations and Clock Times

Cells written as `m:ss` (`03:36`) or `h:mm:ss` (`1:02:45`) are durations, and the result of a formula that uses them is shown in the same format:

| Title | Time |
|-------|------|
| America | 03:36 |
| Homeward Bound | 02:29 |
| Total | `=SUM(B1:B2)` → `06:05` |

- `SUM`, `AVERAGE`, `MEDIAN`, `MIN`, `MAX`, `ABS`, `ROUND`, `FLOOR`, `INT`, `CEILING`, `TRUNC`, and `STDEV` of durations return a duration. `COUNT`/`COUNTA` (and functions that change the unit, like `PRODUCT` or `VAR`) return plain numbers.
- Totals never wrap: `45:00 + 30:30` is `75:30`, and `23:30:00 + 1:00:00` is `24:30:00`.
- If any input is `h:mm:ss`, the result is `h:mm:ss`.
- Fractional seconds work (`3:05.5`), up to 3 decimals; other results round to the nearest second.
- Durations can be typed inline (`=B1+1:30`) or built with `TIME(h, m, s)` (`=B1+TIME(0,1,30)`). Prefer `TIME` if you'll copy the formulas into a spreadsheet; see below.
- Plain numbers combined with a duration count as **seconds**: `=B1+30` adds 30 seconds.

**Arithmetic keeps track of units**, so a formula gives a duration only when the result really is one:

| Formula | Result |
|---------|--------|
| `=B1+B2`, `=B1-B2`, `=B1*2`, `=SUM(B1:B2)/2` | duration |
| `=SUM(B1:B2)/TIME(0,1,0)` or `/0:01:00` | plain number: total **minutes** (`6.083333`) |
| `=SUM(B1:B2)/TIME(1,0,0)` or `/1:00:00` | plain number: total **hours** |
| `=B1/B2` | plain number: the ratio of two durations |
| `=B1*B2`, `=B1^2` | plain number |

**Two-part times** (`03:36`) are read as minutes:seconds by default. If you mostly track hours:minutes (timesheets), change **Settings → Table Calc → Two-part times** to *Hours:minutes*. A column of only two-part values totals to the same digits either way (`8:30 + 7:45` → `16:15`); the setting matters when they're mixed with `h:mm:ss` values (`0:30 + 0:30:00` is `0:30:30` as m:ss, `1:00:00` as h:mm), combined with plain numbers, or divided into a number. Write `0:01:00` (one minute) or `1:00:00` (one hour) to be unambiguous under either setting. Fractional seconds aren't allowed in the hours:minutes reading.

**Clock times** are written with `am`/`pm` (`9:00 am`, `5:15 PM`, `7:05 a.m.`, `1:30:15pm`):

| Formula | Result |
|---------|--------|
| `=B1-A1` with `9:00 am` and `5:15 pm` | `8:15:00` (a duration) |
| `=B1-A1+24:00:00` with `10:00 pm` and `6:00 am` | `08:00:00` (overnight shift: add a day) |
| `=A1+3:00:00` with `10:00 PM` | `1:00 AM` (wraps at midnight) |
| `=MIN(A1:A5)` / `MAX` / `MEDIAN` / `AVERAGE` | a clock time |

A 24-hour time like `14:30` has no am/pm, so it's read as a duration.

#### Compared with Excel, Google Sheets, and Numbers

The arithmetic matches: sums, differences, clock time + duration wrapping at midnight, and `MIN`/`MAX`/`AVERAGE` of times give the same values everywhere. Excel and Sheets store a time as a fraction of a day plus a display format, so the differences are about reading and display:

| | Table Calc | Excel / Sheets |
|---|---|---|
| `03:36` | 3 min 36 s (or h:mm via the setting) | 3:36 AM (h:mm) |
| Totals over 24h | Never wrap | Wrap unless formatted `[h]:mm` (Excel) or Duration (Sheets) |
| Duration ÷ duration | Plain number | A number, usually displayed as a time |
| Plain number + duration | Number counts as **seconds** | Number counts as **days** |
| Negative durations | `-1:07` | `#####` in Excel |
| `TIME(25,0,0)` | `25:00:00` | `1:00 AM` |

Typed results (duration ÷ duration is a number, end − start is a duration) follow the same rules as Apple Numbers' Duration type.

**Copying formulas into a spreadsheet** (Copy content → *Formulas*): a few formulas compute differently once pasted.

- Inline durations (`=B1+1:30`) aren't valid spreadsheet syntax. Use `TIME(0,1,30)` instead; it means the same thing in both.
- `=B1+30` adds 30 seconds here, but 30 days in Excel/Sheets. Write `=B1+TIME(0,0,30)`.
- Two-part values like `03:36` are read as hours:minutes there. Totals still show the right digits if you format the result cell as `[m]:ss` (song lengths) or `[h]:mm` (timesheets).

Copying *Computed values* has none of these problems.

---

## Error Values

| Error | Cause |
|-------|-------|
| `#ERR` | Invalid expression, divide by zero, or any other non-finite result (e.g. `SQRT` of a negative number) |
| `#NAME?` | Unknown function name |

A function that produces `#ERR` invalidates the whole formula, even when nested inside another function — `=SUM(SQRT(-4), 5)` is `#ERR`, not `5`.

---

## Formulas in Context

Hover over any result cell to see the original formula. Formulas are stored in the markdown — the plugin only changes how they're displayed.

When you click into a formula cell in Live Preview, the raw formula reappears for editing. Click away and the result renders again.

---

## Example: Budget Tracker

```markdown
{{calc}}
| Category     | Budget      | Spent       | Remaining   |
|--------------|-------------|-------------|-------------|
| LLC setup    | 500         | 200         | =B1-C1      |
| Dev tools    | 200         | 99          | =B2-C2      |
| Marketing    | 300         | 0           | =B3-C3      |
| **Total**    | =SUM(B1:B3) | =SUM(C1:C3) | =SUM(D1:D3) |
```

## Example: Sales Table

```markdown
{{calc}}
| Product | Price | Units | Revenue     | Tax (10%)   |
|---------|-------|-------|-------------|-------------|
| Widget  | 29    | 12    | =B1*C1      | =D1*0.1     |
| Gadget  | 49    | 7     | =B2*C2      | =D2*0.1     |
| Totals  |       |       | =SUM(D1:D2) | =SUM(E1:E2) |
```

---

## Installation

### From Obsidian Community Plugins

1. Open **Settings → Community Plugins**
2. Click **Browse** and search for **Table Calc**
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/BenRuns/table-calc-plugin/releases/latest)
2. Create a folder: `<your vault>/.obsidian/plugins/table-calc/`
3. Copy the three files into that folder
4. In Obsidian: **Settings → Community Plugins → reload → enable Table Calc**

---

## Commands

| Command | Description |
|---------|-------------|
| `Evaluate table formulas in this note` | Re-runs formula evaluation on all `{{calc}}` tables in the active note. Useful if a table doesn't update automatically. |

Access via `Cmd+P` (Mac) or `Ctrl+P` (Windows/Linux).

---

## How It Works

Formulas are stored as plain text in your markdown file — the plugin never rewrites them. The only edit it ever makes to a note is inserting a blank line between `{{calc}}` and a table typed directly under it. A MutationObserver watches for rendered tables and evaluates any `=formula` cells on the fly. Only tables immediately preceded by a `{{calc}}` paragraph are processed; all others are ignored. In Reading view the cell's display is replaced with the computed result; in Live Preview the raw formula stays visible (tinted, since those cells are natively click-to-edit and rewriting their text would break Obsidian's cursor placement) and the result shows as a tooltip on hover instead.

This means your notes remain portable: open them anywhere and you'll see the raw formulas. Enable the plugin and you see the results.

---

## Testing

`npm test` runs the automated suite: `engine.test.js` covers the formula engine directly, and `main.test.js` exercises `processTable`'s DOM handling (via jsdom) — in particular, that Live Preview never rewrites a formula cell's text (Obsidian's Live Preview tables are natively click-to-edit, and CM6 maps cursor position by walking the cell's rendered text, so any change to it desyncs that mapping and corrupts editing).

`test/example-vault-note.md` is a manual fixture, not run by `npm test`. Copy it into any vault with this plugin installed to eyeball formula evaluation, error handling (`#ERR`/`#NAME?`), and Live Preview vs. Reading View rendering side by side — every `Result` cell should match the `Expected` cell next to it (Section 6 is deliberately the exception).

---

## Limitations

- Column letters support A–Z (26 columns max)
- Circular references are stopped at depth 20 and return `0`
- Formulas only evaluate in **Live Preview** and **Reading** view, not in Source mode
- Function arguments must be cell references, ranges, or literal numbers — not inline expressions (use `=ABS(A1)`, not `=ABS(A1-B1)`)
- A cell counts as numeric only if it's a complete, well-formed number. `1,234` (correctly-grouped thousands separator) is recognized and parsed as `1234`, but `5 apples` (trailing text), the literal text `Infinity`/`NaN`, and malformed groupings like `12,34` or `1,23,456` are all treated as **text**, not as the number they might resemble — they're excluded from `COUNT`. This is intentional: `parseFloat` in JavaScript would otherwise silently read `1,234` as `1` and the string `"Infinity"` as the number `Infinity`.
- A text cell (non-blank, not a formula, not a valid number) referenced **directly** in a formula or passed as a specific function argument — `=A1`, `=A1+5`, `=ABS(A1)`, `=ROUND(A1,2)` — returns `#ERR` instead of silently treating the text as `0`, matching Excel/Sheets' `#VALUE!` behavior for direct arithmetic on text. A **blank** cell is not text and still silently contributes `0`. `SUM`, `AVERAGE`, `MIN`, `MAX`, `MEDIAN`, `PRODUCT`, `STDEV`, and `VAR`, on the other hand, **skip** non-numeric cells within a range instead of erroring or treating them as `0` — this matches how Excel and Google Sheets handle text inside a range argument to those same functions. A range member that's a *formula* resolving to a number counts as a number everywhere, including `MIN`/`MAX`/`COUNT`/`MEDIAN`/`PRODUCT`/`STDEV`/`VAR`.
- Errors are contagious, like in a real spreadsheet: if a formula references another cell (directly, in a range, or as a function argument) whose own formula resolved to an error, the referencing formula also returns `#ERR` — it's never silently swallowed into `0` partway down a chain of formulas.
- Numbers are standard JavaScript doubles (IEEE 754), the same numeric type spreadsheets like Excel use. Integers beyond `2^53` (~9 quadrillion) lose precision, and results are snapped to 8 decimal places to absorb ordinary binary floating-point drift (e.g. `0.1+0.2` reliably shows `0.3`, not `0.30000000000000004`)
- `ROUND` rounds half away from zero (`ROUND(2.5,0)` → `3`, `ROUND(-2.5,0)` → `-3`), matching spreadsheet conventions rather than JavaScript's native `Math.round` (which rounds `-2.5` to `-2`)
- Dividing a duration by a plain number gives a duration (`=SUM(B1:B2)/60` is a sixtieth of the total, shown as `00:06`), as in Excel/Sheets. To get a number of minutes or hours, divide by a duration instead: `=SUM(B1:B2)/0:01:00`.
- Clock times need `am`/`pm`; 24-hour times are read as durations. Adding two clock times, or subtracting a clock time from a duration, gives a plain number of seconds. Malformed values like `3:5`, `3:60`, or `13:00 pm` are text.
- References are positional, not tracked. `A2` always means "column A, row 2 of the table as it exists right now" — there's no concept of a formula "belonging" to a row. If you insert, delete, or reorder rows, formula text doesn't shift to compensate, so a formula can silently start pointing at the wrong cells. Re-check (or rewrite) formulas after restructuring a table. This is intentional: the plugin never rewrites your formulas, and auto-shifting references would require doing exactly that

---

## Disclaimer

**Table Calc is a hobby project.** Anyone is welcome to use it, for free, under the [MIT License](LICENSE). It's provided "as is", with no warranty and no guarantee of support or fixes.

**It is not intended for critical calculations.** It's designed for **personal notes, budgets, and quick calculations**. Please don't rely on it for medical, legal, financial, tax, regulatory, engineering, or safety-critical work, or for anything else where a wrong result could cause harm or loss.

Results are computed in the browser using JavaScript's standard IEEE 754 floating-point arithmetic, which has the same rounding characteristics as any spreadsheet. Some values also depend on how they're read: `03:36` can mean minutes or hours, depending on the **Two-part times** setting. If a number matters, verify it independently.

---

## License

MIT

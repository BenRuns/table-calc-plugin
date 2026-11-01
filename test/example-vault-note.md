<!--
Manual test fixture for Table Calc — not run by `npm test` (that's
engine.test.js / main.test.js). Copy this file into any Obsidian vault
that has this plugin installed and open it to manually verify formula
evaluation, error handling, and Live Preview vs. Reading View rendering.

Every `Result`/`Expected` (or `Formula`/`Expected`) cell pair should match.
Section 6 is a deliberate exception — those cells are meant to produce
errors (#ERR / #NAME?) — and section 12's `Expected` column is itself the
thing to check row-by-row (each row is meant to error).
Section 13 checks marker scoping: every table labelled "plain" must stay
unevaluated, so its `=` cells are expected to show as raw text.
-->

# Table Calc – Formula Test Suite

Formulas shown in **accent color** are evaluated. Check each `Result` against `Expected`.

---

## 1. Arithmetic & Cell References

{{calc}}

| Operation   | Val A  | Val B  | Result     | Expected |     |
| ----------- | ------ | ------ | ---------- | -------- | --- |
| add         | 10     | 5      | =B1+C1     | 15       |     |
| subtract    | 10     | 5      | =B2-C2     | 5        |     |
| multiply    | 6      | 7      | =B3*C3     | 42       |     |
| divide      | 15     | 4      | =B4/C4     | 3.75     |     |
| power (^)   | 2      | 10     | =B5^C5     | 1024     |     |
| parentheses | 2      | 4      | =(B6+3)*C6 | 20       |     |
| cross-ref   | =B1+B2 | =C3+C4 | =B7+C7     | 31       |     |
|             |        |        |            |          |     |

---

## 2. Aggregate Functions

Data values 4, 8, 2, 6, 1 in column B rows 1–5.

{{calc}}

| Function | Data | Result                   | Expected |     |
| -------- | ---- | ------------------------ | -------- | --- |
| SUM      | 4    | =SUM(B1:B5)              | 21       |     |
| AVERAGE  | 8    | =AVERAGE(B1:B5)          | 4.2      |     |
| MIN      | 2    | =MIN(B1:B5)              | 1        |     |
| MAX      | 6    | =MAX(B1:B5)              | 8        |     |
| MEDIAN   | 1    | =MEDIAN(B1:B5)           | 4        |     |
| PRODUCT  |      | =PRODUCT(B1:B5)          | 384      |     |
| STDEV    |      | =STDEV(B1:B5)            | 2.863564 |     |
| VAR      |      | =VAR(B1:B5)              | 8.2      |     |
| nested   |      | =ROUND(AVERAGE(B1:B5),2) | 4.2      |     |
|          |      |                          |          |     |

---

## 3. COUNT vs COUNTA

{{calc}}

| Value | Function | Result         | Expected |
| ----- | -------- | -------------- | -------- |
| hello | COUNT    | =COUNT(A1:A4)  | 1        |
| 42    | COUNTA   | =COUNTA(A1:A4) | 3        |
|       |          |                |          |
| world |          |                |          |

---

## 4. Math Functions

{{calc}}

| Function | Input | Result | Expected |
| -------- | ----- | ------ | -------- |
| ABS | -7 | =ABS(B1) | 7 |
| ROUND 2dp | 3.14159 | =ROUND(B2,2) | 3.14 |
| FLOOR | 4.9 | =FLOOR(B3) | 4 |
| INT | 4.9 | =INT(B4) | 4 |
| CEILING | 4.1 | =CEILING(B5) | 5 |
| TRUNC | 3.7 | =TRUNC(B6) | 3 |
| SIGN neg | -5 | =SIGN(B7) | -1 |
| SIGN zero | 0 | =SIGN(B8) | 0 |
| SIGN pos | 3 | =SIGN(B9) | 1 |
| SQRT | 144 | =SQRT(B10) | 12 |
| POW | 2 | =POW(B11,10) | 1024 |
| POWER | 3 | =POWER(B12,3) | 27 |
| MOD pos | 17 | =MOD(B13,5) | 2 |
| MOD neg | -17 | =MOD(B14,5) | 3 |

---

## 5. Logarithms & Constants

{{calc}}

| Function | Input | Result | Expected |
| -------- | ----- | ------ | -------- |
| PI | | =PI() | 3.14159265 |
| EXP | 1 | =EXP(B2) | 2.71828183 |
| LN | 8 | =LN(B3) | 2.07944154 |
| LOG (base 10) | 100 | =LOG(B4) | 2 |
| LOG (custom base) | 8 | =LOG(B5,2) | 3 |
| LOG10 | 1000 | =LOG10(B6) | 3 |

---

## 6. Error Cases

{{calc}}

| Case | Formula | Expected |
| ---- | ------- | -------- |
| sqrt of negative | =SQRT(-1) | #ERR |
| log of zero | =LOG(0) | #ERR |
| unknown function | =BADFUNCTION(1) | #NAME? |

---

## 7. Normal Table (no marker — should be unstyled)

| Name | Score |
| ---- | ----- |
| Alice | 95 |
| Bob | 87 |

---

## 8. Comma Thousands Separators

{{calc}}

| Case | Input | Result | Expected |
| ---- | ----- | ------ | -------- |
| valid grouping | 1,234 | =B1 | 1234 |
| valid grouping with decimal | 1,234,567.89 | =B2 | 1234567.89 |
| negative | -1,234 | =B3 | -1234 |
| used inside SUM | 1,234 | =SUM(B4,10) | 1244 |
| malformed grouping (stays text → errors like any text) | 12,34 | =B5 | #ERR |

---

## 9. Text Cells: Direct References & Single-Value Functions Error

A cell referenced directly (or passed to a single-value function like ABS/ROUND)
now errors like a real spreadsheet's #VALUE! if it's non-blank text — a blank
cell is not text and still silently contributes 0.

{{calc}}

| Case | Cell Value | Formula | Expected |
| ---- | ---------- | ------- | -------- |
| direct reference to text | hello | =B1 | #ERR |
| arithmetic on a text cell | hello | =B2+5 | #ERR |
| ABS on a text cell | hello | =ABS(B3) | #ERR |
| blank cell (not text) in arithmetic |  | =B4+5 | 5 |

---

## 10. SUM/AVERAGE/MIN/MAX Skip Text in a Range, But Errors Still Propagate

Matches Excel/Sheets: aggregate functions silently skip a text cell within a
range instead of erroring or treating it as 0 — but if a range member cell
is itself an error (not just text), the aggregate still errors.

Data column (B): row 1 = `5`, row 2 = `oops` (text), row 3 = `10`.

{{calc}}

| Row | Data | Result | Expected |
| --- | ---- | ------ | -------- |
| 1 | 5 |  |  |
| 2 | oops |  |  |
| 3 | 10 | =SUM(B1:B3) | 15 |
| 4 |  | =AVERAGE(B1:B3) | 7.5 |
| 5 |  | =MIN(B1:B3) | 5 |
| 6 |  | =MAX(B1:B3) | 10 |

---

## 11. A Formula Cell Counts as a Number Everywhere

A range member that's itself a formula resolving to a number counts as a
number for every aggregate function, not just SUM/AVERAGE.

Data column (B): row 1 = `=5+5` (a formula, evaluates to 10), row 2 = `1`.

{{calc}}

| Row | Data | Result | Expected |
| --- | ---- | ------ | -------- |
| 1 | =5+5 |  |  |
| 2 | 1 | =MAX(B1:B2) | 10 |
| 3 |  | =MIN(B1:B2) | 1 |
| 4 |  | =COUNT(B1:B2) | 2 |

---

## 12. Errors Propagate Through Chained Formulas

Each row's `Formula` cell (column B) is the thing under test — its own
computed value is what should match `Expected`. Row 2 references row 1's
text cell directly; row 3 references row 2, which is itself an error.

{{calc}}

| Row | Formula | Expected |
| --- | ------- | -------- |
| 1: plain text, not a formula | hello | n/a |
| 2: references row 1's text cell | =B1 | #ERR |
| 3: references row 2, which itself errors | =B2+1 | #ERR |

---

## 13. `{{calc}}` Applies Only to the Table Right After It

In each case below, the table marked **plain** must stay untouched: its
`=` cells show as raw text (no accent color, no A/B/C column letters).
Check in both Reading View and Live Preview.

### 13a. Two tables back to back

{{calc}}

| Case | Value | Result | Expected |
| ---- | ----- | ------ | -------- |
| calc | 2 | =B1*10 | 20 |

| Case | Value | Result | Expected |
| ---- | ----- | ------ | -------- |
| plain | 2 | =B1*10 | =B1*10 |

### 13b. Plain table with the same header as an earlier calc table

This copies the 13a calc table's header exactly, but has no marker. In Live
Preview the plugin used to match tables by header row, which made this one
evaluate too. The 13a calc table must still evaluate.

| Case | Value | Result | Expected |
| ---- | ----- | ------ | -------- |
| plain (same header as 13a) | 3 | =B1*10 | =B1*10 |

### 13c. Callout with `{{calc}}` followed by prose, then a table outside

> [!note]
> {{calc}}
>
> Prose after the marker means it has no table to attach to.

| Case | Value | Result | Expected |
| ---- | ----- | ------ | -------- |
| plain (after callout) | 4 | =B1*10 | =B1*10 |

### 13d. Callout with two tables — only the first is calc

> [!note]
> {{calc}}
>
> | Case | Value | Result | Expected |
> | ---- | ----- | ------ | -------- |
> | calc (in callout) | 5 | =B1*10 | 50 |
>
> Some text between the tables.
>
> | Case | Value | Result | Expected |
> | ---- | ----- | ------ | -------- |
> | plain (in callout) | 5 | =B1*10 | =B1*10 |

### 13e. Deleting `{{calc}}` un-styles the table (interactive)

This table starts out as calc. Delete the `{{calc}}` line above it: the
table should go plain right away (raw `=B1*10`, no column letters) with no
reload. Undo the delete and it should evaluate again. Try it in both views
(edit in Live Preview, then switch to Reading View to check that too).

{{calc}}

| Case | Value | Result | Expected |
| ---- | ----- | ------ | -------- |
| calc until marker deleted | 6 | =B1*10 | 60 |

### 13f. `{{calc}}` directly above a table (no blank line)

The marker below was written with no blank line before the table. Obsidian
won't render that as a table, so opening this note should make the plugin
insert the blank line. After that the table evaluates normally. Typing
`{{calc}}` directly above a table should get the same fix as you type.

{{calc}}
| Case | Value | Result | Expected |
| ---- | ----- | ------ | -------- |
| marker was directly above | 7 | =B1*10 | 70 |

---

## 14. Durations (`m:ss` and `h:mm:ss`)

Each `Result` should match `Expected`. Rows 1–2 are the song table from
issue #7.

{{calc}}

| Case | Time | Result | Expected |
| ---- | ---- | ------ | -------- |
| song 1 | 03:36 | =B1 | 03:36 |
| song 2 | 02:29 | =SUM(B1:B2) | 06:05 |
| total over an hour stays m:ss | 58:00 | =SUM(B1:B3) | 64:05 |
| h:mm:ss mixed with m:ss | 1:00:00 | =SUM(B1:B4) | 02:04:05 |
| average | | =AVERAGE(B1:B2) | 03:03 |
| difference (negative) | | =B2-B1 | -01:07 |
| inline literal | | =B1+1:30 | 05:06 |
| COUNT is still a number | | =COUNT(B1:B4) | 4 |
| malformed (stays text) | 3:5 | =B9 | #ERR |

---

## 15. Units, Clock Times, and the Two-Part Times Setting

Rows assume the default **Two-part times: Minutes:seconds** setting except
where noted.

{{calc}}

| Case | Value | Result | Expected |
| ---- | ----- | ------ | -------- |
| song 1 | 03:36 | =B1 | 03:36 |
| song 2 | 02:29 | =SUM(B1:B2)/0:01:00 | 6.083333 |
| ratio of durations | | =B1/B2 | 1.449664 |
| duration ÷ number stays a duration | | =SUM(B1:B2)/2 | 03:03 |
| shift start | 9:00 am | =B5 | 9:00 am |
| shift end | 5:15 pm | =B6-B5 | 8:15:00 |
| clock + duration wraps | 10:00 PM | =B7+3:00:00 | 1:00 AM |
| earliest start | | =MIN(B5:B6) | 9:00 am |
| subtract a negative | -5 | =10-B9 | 15 |
| mixed two/three-part (m:ss) | 0:30 | =B10+0:30:00 | 0:30:30 |

Now switch **Settings → Table Calc → Two-part times** to *Hours:minutes*.
Without reopening the note, two Results should change: row 2 to `365`
(03:36 + 02:29 is now 6 h 5 min) and the last row to `1:00:00`. Every other
row should stay the same.

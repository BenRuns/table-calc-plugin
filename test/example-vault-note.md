<!--
Manual test fixture for Table Calc — not run by `npm test` (that's
engine.test.js / main.test.js). Copy this file into any Obsidian vault
that has this plugin installed and open it to manually verify formula
evaluation, error handling, and Live Preview vs. Reading View rendering.

Every `Result`/`Expected` (or `Formula`/`Expected`) cell pair should match.
Section 6 is a deliberate exception — those cells are meant to produce
errors (#ERR / #NAME?) — and section 12's `Expected` column is itself the
thing to check row-by-row (each row is meant to error).
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

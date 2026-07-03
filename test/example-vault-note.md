<!--
Manual test fixture for Table Calc — not run by `npm test` (that's
engine.test.js / main.test.js). Copy this file into any Obsidian vault
that has this plugin installed and open it to manually verify formula
evaluation, error handling, and Live Preview vs. Reading View rendering.

Every `Result` cell should equal the `Expected` cell next to it. Section 6
is the exception: those are meant to produce errors (#ERR / #NAME?).
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

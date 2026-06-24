# Table Calc — Obsidian Plugin

Add spreadsheet-style formulas to your markdown tables. Write `=SUM(A1:A5)`, `=B1*C1`, or `=AVG(A1:A3)` directly in any table cell and see the results rendered inline — in both Live Preview and Reading view.

---

## Quick Start

Add `{calc}` as the first header cell to opt a table into formula evaluation:

```markdown
| {calc} | Item        | Cost | Qty | Total      |
|--------|-------------|------|-----|------------|
|        | LLC filing  | 200  | 1   | =B1*C1     |
|        | Dev account | 99   | 1   | =B2*C2     |
|        | Accountant  | 250  | 1   | =B3*C3     |
|        | **Total**   |      |     | =SUM(D1:D3)|
```

The `{calc}` column is automatically converted into a row-number column. Column letters (A, B, C…) appear above the header so you always know which column to reference.

Tables without `{calc}` are left completely untouched.

---

## Column and Row Reference

| Label | Meaning |
|-------|---------|
| `A1`  | Row 1, first data column (after `{calc}`) |
| `B2`  | Row 2, second data column |
| `A1:A5` | Range: column A, rows 1 through 5 |
| `A1:C3` | 2D range: columns A–C, rows 1–3 |

---

## Supported Formulas

### Functions

| Formula | Description | Example |
|---------|-------------|---------|
| `=SUM(A1:A5)` | Sum a range | `=SUM(D1:D3)` |
| `=AVG(A1:A5)` | Average of a range | `=AVG(B1:B4)` |
| `=AVERAGE(A1:A5)` | Same as AVG | |
| `=MIN(A1:A5)` | Smallest value | `=MIN(B1:B10)` |
| `=MAX(A1:A5)` | Largest value | `=MAX(B1:B10)` |
| `=COUNT(A1:A5)` | Count numeric cells | `=COUNT(A1:A5)` |
| `=ABS(A1)` | Absolute value | `=ABS(A3)` |
| `=ROUND(A1, 2)` | Round to N decimals | `=ROUND(B1, 2)` |

### Arithmetic

| Operator | Example |
|----------|---------|
| `+` | `=A1+B1` |
| `-` | `=A1-B1` |
| `*` | `=B1*C1` |
| `/` | `=A1/B1` |
| Grouped | `=(A1+B1)*C1` |

### Mixed

Combine functions and arithmetic freely:

```
=SUM(A1:A3)*1.1
=ROUND(AVG(B1:B5), 2)
=A1+SUM(B1:B3)
```

> **Note:** Function arguments must be cell references, ranges, or literal numbers — not inline expressions. Use `=ABS(A1)` not `=ABS(A1-B1)`.

---

## Error Values

| Error | Cause |
|-------|-------|
| `#ERR` | Invalid expression or divide by zero |
| `#NAME?` | Unknown function name |

---

## Formulas in Context

Hover over any result cell to see the original formula. Formulas are stored in the markdown — the plugin only changes how they're displayed.

When you click into a formula cell in Live Preview, the raw formula reappears for editing. Click away and the result renders again.

---

## Example: Budget Tracker

```markdown
| {calc} | Category     | Budget | Spent  | Remaining  |
|--------|--------------|--------|--------|------------|
|        | LLC setup    | 500    | 200    | =B1-C1     |
|        | Dev tools    | 200    | 99     | =B2-C2     |
|        | Marketing    | 300    | 0      | =B3-C3     |
|        | **Total**    | =SUM(B1:B3) | =SUM(C1:C3) | =SUM(D1:D3) |
```

## Example: Sales Table

```markdown
| {calc} | Product | Price | Units | Revenue     | Tax (10%)    |
|--------|---------|-------|-------|-------------|--------------|
|        | Widget  | 29    | 12    | =B1*C1      | =D1*0.1      |
|        | Gadget  | 49    | 7     | =B2*C2      | =D2*0.1      |
|        | Totals  |       |       | =SUM(D1:D2) | =SUM(E1:E2)  |
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
| `Evaluate table formulas in this note` | Re-runs formula evaluation on all `{calc}` tables in the active note. Useful if a table doesn't update automatically. |

Access via `Cmd+P` (Mac) or `Ctrl+P` (Windows/Linux).

---

## How It Works

Formulas are stored as plain text in your markdown file — the plugin never modifies the source. In Live Preview and Reading view, a MutationObserver watches for rendered tables and evaluates any `=formula` cells on the fly, replacing the display with the computed result.

This means your notes remain portable: open them anywhere and you'll see the raw formulas. Enable the plugin and you see the results.

---

## Limitations

- Column letters support A–Z (26 columns max)
- Circular references are stopped at depth 20 and return `0`
- Formulas only evaluate in **Live Preview** and **Reading** view, not in Source mode

---

## License

MIT

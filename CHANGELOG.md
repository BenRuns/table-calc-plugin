# Changelog

## 2.1.0

### Added

- Comma thousands separators are now recognized in cell values (`1,234`, `1,234,567.89`) as long as groups are correctly sized — a comma placed anywhere else (`12,34`) is still treated as text, not guessed at.

### Fixed

- A text cell (non-blank, not a formula, not a valid number) referenced directly in a formula or passed to a single-value function — `=A1`, `=A1+5`, `=ABS(A1)`, `=ROUND(A1,2)` — now returns `#ERR` instead of silently computing as if the cell were `0`, matching Excel/Sheets' `#VALUE!` for direct arithmetic on text. A blank cell is unaffected and still contributes `0`.
- `SUM`/`AVERAGE`/`MIN`/`MAX`/`MEDIAN`/`PRODUCT`/`STDEV`/`VAR` now skip text cells within a range instead of silently treating them as `0`, matching how Excel/Sheets handle text inside a range argument.
- Errors now propagate through chained formula references: a formula that references another cell (directly, in a range, or as a function argument) whose own formula resolved to an error now also returns `#ERR`, instead of that error silently collapsing to `0` partway down the chain.
- A range member that is itself a formula resolving to a number is now counted consistently by `MIN`/`MAX`/`COUNT`/`MEDIAN`/`PRODUCT`/`STDEV`/`VAR` (previously dropped by those functions while `SUM`/`AVERAGE` already counted it).

## 2.0.0

### Breaking changes

- **`{{calc}}` paragraph replaces `{calc}` column header.** Instead of putting `{calc}` as the first column header, add `{{calc}}` on the line immediately above your table. The old column-header format is no longer recognised. To migrate, remove the `{calc}` header cell and its blank data cells, then add `{{calc}}` as its own paragraph above the table. Column letters are unchanged (A is still the first data column).
- Removed the `AVG` alias for `AVERAGE`. Formulas using `=AVG(...)` will now return `#NAME?` — update them to `=AVERAGE(...)`.
- Removed the `CEIL` alias for `CEILING`. Formulas using `=CEIL(...)` will now return `#NAME?` — update them to `=CEILING(...)`.
- Changed single-argument `LOG(x)` from natural log to base-10 log, matching Google Sheets/Excel convention. Formulas relying on the old natural-log default should switch to the new `LN(x)` function.

### Added

- `LN(x)`: natural logarithm function.
- `main.test.js`: a jsdom-based regression suite covering `processTable`'s DOM handling in both Reading View and Live Preview, including the two bugs described below so they can't silently regress.
- `test/example-vault-note.md`: a copy-paste-ready manual fixture for eyeballing formula rendering in a real Obsidian vault (not run by `npm test`).
- `README.md` "Testing" section documenting both test paths.
- `CHANGELOG.md` (this file).

### Fixed

- **Fingerprint fallback now matches tables with formatted headers.** `buildFingerprints` was hashing raw Markdown source text (e.g. `**Name**`) while `tableFingerprint` read rendered DOM text (`Name`). The two values never matched, so the fingerprint cache — the fallback used to identify calc tables in Live Preview when DOM traversal fails — silently did nothing for any table whose first row contained bold, italic, or linked text. Source cells are now stripped of inline Markdown before hashing.
- **Background-pane mutations now resolve the correct file.** The MutationObserver handler was using `getActiveFile()` to look up the current file path, which returns the focused pane's file. If a table in a background pane was mutated (e.g. by another plugin or a Obsidian partial re-render), the handler would pass the wrong file path to the fingerprint cache and the table would be permanently stamped as skipped. The handler now uses the leaf's own `file` property.
- **MutationObserver handler is now debounced.** Rapid edits (N keystrokes) were scheduling N independent 150 ms `setTimeout` calls. All N fired, re-processing the same tables in sequence. A `clearTimeout`/re-arm pattern now collapses bursts into a single pass.
- **Reading View formula cells update when data cells change.** The observer was preserving the `data-table-calc="done"` marker for already-evaluated tables in Reading View, causing `processTable` to short-circuit and skip formula re-evaluation when a data cell was modified via a characterData mutation. Done is now cleared for Reading View tables before re-processing so the full evaluation pipeline runs.
- **Live Preview formulas no longer corrupt on edit.** Obsidian's Live Preview table cells are natively click-to-edit, and CodeMirror maps clicks to source positions by walking each cell's actual rendered text. The plugin previously replaced that text with the computed value — the same approach Reading View uses — which desynced CodeMirror's cursor mapping. Editing a formula could leave the cell showing corrupted, concatenated old/new content that never recovered without reopening the file. Live Preview cells now keep their raw formula text completely untouched; the computed result is surfaced via a hover tooltip and a color tint instead, neither of which touch cell text/structure.
- Live Preview vs. Reading View detection now checks for CodeMirror's `.cm-editor` root instead of `.markdown-reading-view`. Obsidian renders Live Preview table widgets through the same internal HTML pipeline as Reading View, so that class could appear in both — misidentifying Live Preview as Reading View, which let destructive text replacement run there and get partially (inconsistently) reverted by CodeMirror.
- The `{{calc}}` marker fingerprint cache (a fallback used to re-identify tables in Live Preview when DOM traversal fails) is now refreshed on every edit and on view-mode toggles, not just when switching files or panes. Previously it could go stale after editing a table's first row, permanently losing track of that table until the file was reopened.
- Fixed a column-reference shift bug: Live Preview recomputes the formula grid on every observed change (it has no "already done" short-circuit the way Reading View does, since a Live Preview formula cell always shows raw text by design). The row-number cell that decoration inserts persists across passes, and was being counted as real data on the second pass, silently shifting every cell reference over by one column.

### Changed

- Live Preview now also shows the column-letter/row-number decoration and CSV copy buttons that were previously Reading-View-only. Unlike rewriting existing cell text, inserting new decoration elements doesn't disturb CodeMirror's cursor mapping, so this is safe there too.
- `compare.js` and `generate-compare-csv.js` (ad hoc local scripts for manually cross-checking formula output against Google Sheets) have been removed. They weren't referenced by `npm test`, CI, or the README, and their cases are now covered by `engine.test.js`.

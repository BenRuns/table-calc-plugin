# Changelog

## Unreleased

### Breaking changes

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

- **Live Preview formulas no longer corrupt on edit.** Obsidian's Live Preview table cells are natively click-to-edit, and CodeMirror maps clicks to source positions by walking each cell's actual rendered text. The plugin previously replaced that text with the computed value — the same approach Reading View uses — which desynced CodeMirror's cursor mapping. Editing a formula could leave the cell showing corrupted, concatenated old/new content that never recovered without reopening the file. Live Preview cells now keep their raw formula text completely untouched; the computed result is surfaced via a hover tooltip and a color tint instead, neither of which touch cell text/structure.
- Live Preview vs. Reading View detection now checks for CodeMirror's `.cm-editor` root instead of `.markdown-reading-view`. Obsidian renders Live Preview table widgets through the same internal HTML pipeline as Reading View, so that class could appear in both — misidentifying Live Preview as Reading View, which let destructive text replacement run there and get partially (inconsistently) reverted by CodeMirror.
- The `{{calc}}` marker fingerprint cache (a fallback used to re-identify tables in Live Preview when DOM traversal fails) is now refreshed on every edit and on view-mode toggles, not just when switching files or panes. Previously it could go stale after editing a table's first row, permanently losing track of that table until the file was reopened.
- Fixed a column-reference shift bug: Live Preview recomputes the formula grid on every observed change (it has no "already done" short-circuit the way Reading View does, since a Live Preview formula cell always shows raw text by design). The row-number cell that decoration inserts persists across passes, and was being counted as real data on the second pass, silently shifting every cell reference over by one column.

### Changed

- Live Preview now also shows the column-letter/row-number decoration and CSV copy buttons that were previously Reading-View-only. Unlike rewriting existing cell text, inserting new decoration elements doesn't disturb CodeMirror's cursor mapping, so this is safe there too.
- `compare.js` (an ad hoc local script for manually cross-checking formula output against Google Sheets) has been removed. It wasn't referenced by `npm test`, CI, or the README, and its cases are now covered by `engine.test.js`.

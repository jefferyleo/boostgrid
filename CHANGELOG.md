# Changelog

All notable changes to Boostgrid are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.5.1] — 2026-05-22

### Fixed
- **CDN `<script src>` blocked by strict-MIME browsers.** The previous
  `main` entry pointed at `dist/boostgrid.umd.cjs`. jsdelivr / unpkg
  serve `.cjs` files with `Content-Type: application/node`, which
  modern browsers refuse to execute under strict MIME checking.
  `main` (plus new `browser` / `unpkg` / `jsdelivr` fields, and an
  `exports[".default"]` condition) now resolves to a new
  `dist/boostgrid.umd.js` mirror that serves as
  `application/javascript`. Node consumers are unaffected — the
  `exports.require` condition still resolves to the `.cjs` so
  `require('boostgrid')` keeps working inside `"type": "module"`
  packages. The `.umd.js` bundle is byte-identical to the `.umd.cjs`;
  only the extension (and the server-determined MIME) differ.
- **Silent option-drop when `data-toggle="boostgrid"` auto-init runs
  before an explicit `attach(target, options)` call.** The pre-existing
  default-options instance was returned with the caller's options
  dropped silently. `attach()` now emits a `console.warn` describing
  the conflict and the recommended fix (omit `data-toggle` and call
  `attach(target, options)` instead). The runtime behavior is
  unchanged for users who never relied on the silent merge — the
  warn is purely diagnostic.

### Changed
- **Build emits both `dist/boostgrid.umd.cjs` and `dist/boostgrid.umd.js`.**
  A new Vite plugin (`mirrorUmdAsJs` in `vite.config.ts`) copies the
  UMD bundle to a `.js` mirror at the end of the build. The
  Boostgrid.csproj's previous `MirrorUmdAsJs` MSBuild target — which
  did the same copy only during `dotnet pack` — has been removed; the
  npm build is now the single source of truth for emitting both files.
- **`package.json` `main` flipped to `./dist/boostgrid.umd.js`** so
  CDNs resolve the browser-safe entry. Added explicit `browser`,
  `unpkg`, `jsdelivr` fields and a `default` export condition all
  pointing at the same `.umd.js` for defense in depth across bundler
  resolution algorithms.

### Docs
- **Docs site: Ajax wire format reference.** A new `§ 03.4 — Ajax
  wire format` section lists every field of `AjaxRequest` (8 fields)
  and `AjaxResponse` (4 fields) with type and when-sent semantics.
  Surfaces the canonical payload shape so server-side adopters don't
  have to read `core.ts`'s `fetchAjax` to figure out the request /
  response contract.
- **Docs site: filled OPTIONS table gaps.** Added 7 missing rows —
  `highlightRows`, `ajaxSettings`, `requestHandler`, `responseHandler`,
  `converters`, `formatters`, `performanceMarks` — removed a duplicate
  `virtualScroll` row, sharpened the `rowCount` and `caseSensitive`
  descriptions to flag the most-common naming mistakes (assuming
  `rowsPerPage` instead of `rowCount`; assuming
  `searchSettings.caseSensitive` instead of the top-level option).
- **Docs site: auto-init vs explicit attach callout.** New heads-up
  note under "Getting started → Minimal markup" explaining why
  `data-toggle="boostgrid"` and a later `attach(target, options)`
  call conflict, paired with the new `console.warn` for runtime
  visibility.
- **README + docs install snippet** now use the explicit
  `dist/boostgrid.umd.js` CDN path with an inline comment explaining
  the MIME-type rationale.

### Tests
- 153 specs; no count change (no public API surface change).

### Notes
- Bundle: 16.25 KB → 16.41 KB brotli (+~160 bytes for the
  `console.warn` block in `attach()`). The shipped UMD bundle is
  otherwise unchanged. Hard ceiling stays at 18 KB.

## [2.5.0] — 2026-05-12

### Added
- **`scrollToRow(index)` on the public API.** Programmatically scrolls
  the virtual viewport so `currentRows[index]` becomes visible, clamped
  to `[0, total - 1]`. No-op when `virtualScroll` is off or the
  dataset is empty. Returns `this` for chaining. Synchronously refreshes
  the virtual window and re-renders, so callers can rely on the row
  being in the DOM after the call returns. The first index-based
  navigation method on the grid (all prior navigation was by row id
  or page number).

### Performance
- **Element pooling under virtual scroll.** The windowed body render
  no longer rebuilds the slice on every scroll tick. The data `<tr>`s
  between the top and bottom pad rows are now a fixed-capacity pool:
  rebound to the new row payload in place, grown only when the window
  widens, shrunk only when it narrows. Per-cell work drops from
  "create td + set class + set style + paint" to just "paint".
  Cell-selection rectangle and row-selection class are reapplied once
  after the rebind pass instead of being implicitly destroyed and
  rebuilt. Expected ~5–10× speed-up on scroll-heavy workloads.
- **Active cell edit is committed before its row is recycled.** Pool-
  path scrolls in 2.4.x would have silently destroyed an in-flight
  edit; now the value is committed silently before the row's `<tr>`
  is rebound to a new payload. The full-rebuild path keeps its
  prior "silently destroyed" semantics (out of scope for this round).

### Changed
- Bundle: 15.68 KB → 16.25 KB brotli (+~570 bytes for the three pool
  helpers, the `commitActiveEdit` hook, the `rerenderSelectionState`
  wrapper, and `scrollToRow`). Hard ceiling stays at 18 KB.

### Tests
- 144 → 153 specs (+9 in a new `describe("element pool")` block
  covering tr-identity preservation across scroll, pool grow on
  initial render, pool shrink on dataset narrowing, `scrollToRow`
  scrollTop / window / clamping / no-op behavior, row-selection
  class re-application on recycled rows, pad-row identity
  preservation, and pad-height updates after scroll).

## [2.4.3] — 2026-05-10

### Performance
- **Diffed column-visibility toggle.** Hiding / showing a non-frozen column
  from the visibility menu now flips the `hidden` attribute on the existing
  cells in that column instead of rebuilding `<thead>`, `<tbody>`, and
  `<tfoot>`. Frozen columns retain the full-render path because their
  sticky offsets need to reflow. Wins scale with row count.
- **Pre-resolved per-column paint pipeline.** The cell-paint branch
  (`col.formatter ? td.innerHTML = … : td.textContent = …`) used to fire
  N rows × M cols times per render. Now resolved once per column at render
  entry as a `paint[]` array of closures; the inner cell loop is
  branch-free.
- **Virtual scroll: skip body rebuild on pad-only changes.** When new
  rows arrive but the visible window's slice didn't move (e.g. user is
  scrolled at the top while ajax delivers more rows), the pad row heights
  are mutated in place. The data `<tr>`s keep their identity — preserving
  cell-selection rectangles and any focus the user had inside the body.

### Changed
- Bundle: 15.46 KB → 15.68 KB brotli (+~220 bytes for the three diff
  branches and the `lastRenderedVirtualWindow` snapshot field). Hard
  ceiling stays at 18 KB.

### Tests
- 140 → 144 specs (+4 new in `test/quality.test.ts` covering the paint
  pipeline closure capture, the diffed visibility toggle's identity
  preservation, the toggle un-flip, and the virtual pad-only fast path).

## [2.4.2] — 2026-05-09

### Performance
- **Diffed selection toggle.** Single-row `select([id])` / `deselect([id])`
  now updates only the affected row's `<tr>` instead of walking every
  visible row to re-evaluate selection state. Select-all / deselect-all
  (no rowIds argument) keep the full-table refresh path. Wins scale with
  visible row count.
- **Column-resize drag throttled to rAF + cached cell list.** The live
  width sync used to call `querySelectorAll("tbody > tr > td")` and
  iterate it on every pointermove (60–240 Hz). Now we resolve the
  matching `<td>`s once at drag start (rows can't change mid-drag) and
  coalesce moves into one width write per animation frame. Synchronous
  flush on mouseup so the final position is exact.

### Added
- `performanceMarks: boolean` option (default `false`). When on, brackets
  `renderHeader` / `renderBody` / `renderFooter` with `performance.mark()`
  + `performance.measure()` entries (User Timing API). Mark name is
  `boostgrid:<id>:<phase>`. Lets app authors profile grid renders in
  production via Chrome DevTools' Performance panel without touching
  any production code paths.

### Changed
- Bundle: 15.09 → 15.46 KB brotli (+~370 B for the three additions; new
  `mark()` helper, the diff-path branch, and the rAF coalescer for resize).

## [2.4.1] — 2026-05-09

### Fixed
- AJAX request sequencing now drops stale responses. Rapid search typing
  or sort clicks could previously trigger overlapping fetches where a
  later-resolving older response would overwrite a fresher one. A
  monotonic id + `AbortController` makes this impossible. `destroy()`
  aborts in-flight requests too.
- Cell-edit listener cleanup. The inline `<input>`'s `keydown` and
  `blur` handlers were never removed when the editor closed; the
  synthetic blur dispatched by `innerHTML` mutation re-entered `commit()`.
  Fixed via explicit detach before swap.

### Performance
- Frozen-offset arrays cached per render (`computeFrozenOffsets`):
  O(n²) → O(n). 50 cols × 100 rows = 5000 walks → 1.
- Selection refresh uses `rowIndex: Map` instead of `currentRows.find()`.
- Search regex cached on `grid.searchRegex` per phrase.
- Sort comparator cached, invalidated when `sortDictionary` mutates.
- Visible-cols + columnById Maps memoized inside body / group / footer
  / column-visibility paths.
- Tree `markUp` short-circuits on already-walked ancestors.
- Virtual scroll skips re-render when the windowed slice is unchanged.
- Virtual scroll length read direct from internal arrays (no `.slice()`).
- `saveState` debounced 200 ms; column-resize drag at 60 Hz no longer
  pays `JSON.stringify` per pointermove.

### Added
- `grid.flushState()` — synchronously flush any pending debounced save.
  Useful in `beforeunload` handlers or tests reading `localStorage`
  mid-flight. `destroy()` flushes automatically.

### Changed
- Bundle ceiling raised from 15 KB → 18 KB brotli to accommodate the
  AJAX-abort plumbing + frozen-offset cache arrays. Current size: 15.09 KB.

### Tests
- 144 → 151 specs. New `test/quality.test.ts` covers race conditions,
  listener hygiene, debounce coalescing, locale validation, double-destroy.

## [2.4.0] — 2026-04
i18n hardening — every UI string routes through `options.labels` (14 new keys).
Locale-aware digit grouping via `Intl.NumberFormat`. Sticky `<thead>`
(`stickyHeader: true`). Auto-tooltips on truncated cells.

## [2.3.0] — 2026-04
Power-user UX & server-side. Master/detail row expansion, cell selection
with TSV clipboard copy, sticky bulk-action bar, animated loading
skeleton, ajax payload surfaces grouping + tree state.

## [2.2.0] — 2026-03
Column UX & tree polish. Frozen-right columns, header drag-reorder,
edge drag-resize, polished column-visibility panel, tree
drag-to-reparent, indented tree export, multi-level subtotal-on-top.

## [2.1.0] — 2026-03
Hierarchical data. Multi-level grouping (`groupBy: string[]`), tree
data mode (`treeMode: true`), ancestor-aware search, state schema v:2,
cycle + orphan defenses.

## [2.0.0] — 2026-02
Vanilla rewrite. No jQuery. ESM + UMD output. Virtual scroll,
cell-level edit, row grouping + subtotals, frozen-left columns,
companion packages (React / Vue / Export), state persistence.

[2.4.2]: https://github.com/JefferyLeo/boostgrid/releases/tag/v2.4.2
[2.4.1]: https://github.com/JefferyLeo/boostgrid/releases/tag/v2.4.1
[2.4.0]: https://github.com/JefferyLeo/boostgrid/releases/tag/v2.4.0
[2.3.0]: https://github.com/JefferyLeo/boostgrid/releases/tag/v2.3.0
[2.2.0]: https://github.com/JefferyLeo/boostgrid/releases/tag/v2.2.0
[2.1.0]: https://github.com/JefferyLeo/boostgrid/releases/tag/v2.1.0
[2.0.0]: https://github.com/JefferyLeo/boostgrid/releases/tag/v2.0.0

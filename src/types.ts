export type Row = Record<string, unknown>;
export type SortOrder = "asc" | "desc";
export type SortDictionary = Record<string, SortOrder>;
export type Align = "left" | "center" | "right";

export interface Converter {
  from: (value: string) => unknown;
  to: (value: unknown) => string;
}

export interface Column<TRow extends Row = Row> {
  id: string;
  text: string;
  identifier: boolean;
  type: string;
  converter: Converter;
  align: Align;
  headerAlign: Align;
  cssClass: string;
  headerCssClass: string;
  formatter: Formatter<TRow> | null;
  /**
   * Per-column footer formatter. Receives the column and a {@link FooterContext}
   * snapshot of the current view; returns HTML for the cell. Resolved from the
   * `data-footer-formatter` attribute via `options.footerFormatters[key]`,
   * mirroring how `formatter` resolves through `options.formatters`.
   */
  footerFormatter: FooterFormatter<TRow> | null;
  /** Whether double-click on this column's cells opens an editor. */
  editable: boolean;
  /** Editor element variant. Defaults to `"text"`. */
  editType: EditType;
  /** Choices for `editType: "select"`. Ignored otherwise. */
  editOptions: EditOption[];
  /**
   * Pin this column to an edge during horizontal scroll inside a
   * `.table-responsive` parent. `"left"` sticks to the leading edge,
   * `"right"` to the trailing edge. Pure CSS (`position: sticky`).
   * Right-frozen columns keep their natural visible order — they're
   * positioned via a `right:` offset, not reshuffled to the end.
   */
  frozen: "left" | "right" | null;
  /**
   * Marks this column as the caret-bearing column in `treeMode`. Only one
   * column should carry the caret — if more are flagged the leftmost wins.
   * Equivalent to setting `options.treeColumn` to this column's id.
   */
  treeColumn: boolean;
  order: SortOrder | null;
  searchable: boolean;
  sortable: boolean;
  visible: boolean;
  width: string | null;
  /** Whether this column can be reordered via header drag. Default `true`. */
  reorderable: boolean;
  /** Whether this column can be resized via the right-edge grip. Default `true`. */
  resizable: boolean;
  /** Lower bound (px) for drag-resize. Default `40`. */
  minWidth: number;
  /** Upper bound (px) for drag-resize. `Infinity` (default) means unbounded. */
  maxWidth: number;
}

export type Formatter<TRow extends Row = Row> = (column: Column<TRow>, row: TRow) => string;

/**
 * Snapshot of the grid's view state, passed to footer formatters and the
 * table-level footer callback. Lets summary cells compute totals, counts,
 * or running aggregates from whichever slice the caller cares about
 * (current page, all filtered rows, or the unfiltered dataset).
 *
 * `TRow` defaults to `Row` (the loose record shape) so existing call sites
 * keep working; pass a typed row interface (`FooterContext<MyRow>`) when
 * you want narrowed inference inside formatters and callbacks.
 */
export interface FooterContext<TRow extends Row = Row> {
  /** Rows visible on the current page (after filter + sort + pagination). */
  currentRows: TRow[];
  /** All rows that match the current search/filter, across pages. */
  filteredRows: TRow[];
  /** The unfiltered row dataset. */
  allRows: TRow[];
  /** Rows currently selected (only populated when `selection: true`). */
  selectedRows: TRow[];
  /** 1-indexed first row number of the current page; 0 when empty. */
  start: number;
  /** 1-indexed last row number of the current page; 0 when empty. */
  end: number;
  /** 1-indexed page number. */
  pageIndex: number;
  /** Total page count. */
  totalPages: number;
}

export type FooterFormatter<TRow extends Row = Row> =
  (column: Column<TRow>, ctx: FooterContext<TRow>) => string;
export type FooterCallback<TRow extends Row = Row> =
  (tfootRow: HTMLTableRowElement, ctx: FooterContext<TRow>) => void;

/**
 * Payload passed to `onCellEdit` after the user commits a cell edit. Gives
 * the consumer the raw before/after values plus a `revert()` escape hatch
 * — call it (synchronously or after an async server rejection) to roll the
 * row back to `oldValue`.
 */
export interface EditCommit<TRow extends Row = Row> {
  row: TRow;
  column: Column<TRow>;
  oldValue: unknown;
  newValue: unknown;
  revert: () => void;
}

export type CellEditCallback<TRow extends Row = Row> =
  (commit: EditCommit<TRow>) => void | Promise<void>;

/**
 * Multi-level grouping config. A single string is shorthand for a one-level
 * group (back-compat with Round 3); an array drives nested levels in order.
 */
export type GroupBy = string | readonly string[] | null;

/**
 * Snapshot describing one rendered group, passed to {@link GroupAggregator}
 * so per-column subtotals can be computed. With multi-level grouping,
 * `groupPath` and `depth` describe where this group sits in the hierarchy.
 */
export interface GroupContext<TRow extends Row = Row> {
  /** Raw value of the `groupBy` column for THIS level. */
  groupKey: unknown;
  /** Display label — defaults to `column.converter.to(groupKey)`. */
  groupLabel: string;
  /** Values of all ancestor levels plus this one (last entry = `groupKey`). */
  groupPath: unknown[];
  /** 0 for the outermost level, 1 for level-2, … */
  depth: number;
  /** Rows in this group (and all nested sub-groups), in render order. */
  rows: TRow[];
  /** 0-based position among rendered groups at the same depth, same parent. */
  index: number;
}

/**
 * Aggregator key syntax in `options.groupAggregators`:
 *  - `"amount"`  — runs at every depth for the `amount` column
 *  - `"amount@0"` — runs only at depth 0 (outermost group)
 *  - `"amount@1"` — runs only at depth 1, etc.
 */
export type GroupAggregator<TRow extends Row = Row> =
  (column: Column<TRow>, ctx: GroupContext<TRow>) => string;

/**
 * Snapshot describing one rendered tree row, passed to formatters / hooks
 * that need to know hierarchy info. Boostgrid populates this internally
 * when `treeMode` is on.
 */
export interface TreeContext<TRow extends Row = Row> {
  row: TRow;
  parent: TRow | null;
  /** root → … → parent (excludes the row itself) */
  ancestors: TRow[];
  /** 0 for roots, 1 for direct children of roots, … */
  depth: number;
  /** number of direct children */
  childCount: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

/**
 * The HTML element variant rendered when the user begins editing a cell.
 *  - "text"   → <input type="text">
 *  - "number" → <input type="number"> with numeric coercion on commit
 *  - "select" → <select> populated from `column.editOptions`
 */
export type EditType = "text" | "number" | "select";

export interface EditOption {
  value: unknown;
  label: string;
}

export interface Labels {
  all: string;
  /** Pagination summary template; `{start}`, `{end}`, `{total}` are
   *  substituted with the current page bounds. */
  infos: string;
  loading: string;
  noResults: string;
  refresh: string;
  search: string;
  /** Title on the column-visibility toggle button. */
  columns: string;
  /** Reset-to-defaults button inside the column-visibility panel. */
  resetColumns: string;
  /** Search-input placeholder inside the column-visibility panel. */
  searchColumns: string;
  /** Tooltip on the drag handle in the column-visibility panel. */
  dragToReorder: string;
  /** aria-label on the drag-resize grip. `{column}` → column text. */
  resizeColumn: string;
  /** aria-label on the master/detail header cell. */
  rowDetailsHeader: string;
  /** aria-label on the row-detail chevron when collapsed. */
  showDetails: string;
  /** aria-label on the row-detail chevron when expanded. */
  hideDetails: string;
  /** aria-label on the bulk-action bar. */
  bulkActions: string;
  /** Counter format inside the bulk bar. `{n}` → selection size. */
  bulkSelected: string;
  /** "Clear" button inside the bulk bar. */
  bulkClear: string;
  /** aria-label on the tree-row caret when collapsed. */
  treeExpand: string;
  /** aria-label on the tree-row caret when expanded. */
  treeCollapse: string;
}

export interface IconSet {
  /** sort-asc / sort-desc / sort-none / search / refresh / columns */
  sortAsc: string;
  sortDesc: string;
  sortNone: string;
  search: string;
  refresh: string;
  columns: string;
}

export interface SearchSettings {
  delay: number;
  characters: number;
}

export interface BoostgridOptions<TRow extends Row = Row> {
  /** 0 = none, 1 = top, 2 = bottom, 3 = both */
  navigation: 0 | 1 | 2 | 3;
  padding: number;
  columnSelection: boolean;
  rowCount: number | number[];
  selection: boolean;
  multiSelect: boolean;
  rowSelect: boolean;
  keepSelection: boolean;
  highlightRows: boolean;
  sorting: boolean;
  multiSort: boolean;
  caseSensitive: boolean;
  searchSettings: SearchSettings;
  /** virtual scroll for very large datasets */
  virtualScroll: boolean;
  /** estimated row height (px) used for virtual scroll math */
  rowHeight: number;
  /** number of rows to render outside the viewport on each side */
  overscan: number;
  ajax: boolean;
  url: string | (() => string);
  ajaxSettings: { method: string };
  requestHandler: (request: AjaxRequest) => unknown;
  responseHandler: (response: AjaxResponse) => AjaxResponse;
  converters: Record<string, Converter>;
  formatters: Record<string, Formatter<TRow>>;
  /**
   * Force-enable footer rendering even when no `<tfoot>` markup is present
   * and no `footerFormatters` / `footerCallback` are set. Most users never
   * need this — footer rendering is implicit if any of those signals exist.
   */
  footer: boolean;
  /**
   * Map of named footer formatters, resolved by a column's
   * `data-footer-formatter` attribute. Same dictionary pattern as
   * `formatters`.
   */
  footerFormatters: Record<string, FooterFormatter<TRow>>;
  /**
   * Optional table-level callback that runs after per-column footer
   * formatters on every render (page change, sort, search, select, append,
   * remove). Receives the footer `<tr>` and a {@link FooterContext} so it
   * can read the current view and write arbitrary HTML into footer cells.
   */
  footerCallback: FooterCallback<TRow> | null;
  /**
   * Group rows by column value. Pass a `string` for a single level (back-compat),
   * a `readonly string[]` for nested levels in order, or `null` to disable.
   * Sorting is applied **before** grouping, so rows within the innermost
   * bucket respect the user's sort dictionary.
   */
  groupBy: GroupBy;
  /**
   * Initial expand/collapse state for groups. `"all"` (default), `"none"`,
   * or a partial `Record<group-path-string, boolean>` for per-path control.
   * Path strings are joined with `//` (e.g. `"active//us"`).
   */
  groupExpanded: "all" | "none" | Record<string, boolean>;
  /**
   * Per-column-id aggregator functions, like `footerFormatters` but at
   * the group scope. Key syntax: `"colId"` to run at every depth, or
   * `"colId@N"` to scope to a specific depth.
   */
  groupAggregators: Record<string, GroupAggregator<TRow>>;
  /**
   * Render group footer rows ABOVE their member rows instead of after.
   * Useful when the subtotal is the headline and the rows are detail.
   * Default `false` preserves the bottom-subtotal layout. Affects every
   * grouping level uniformly.
   */
  groupSubtotalsOnTop: boolean;
  /**
   * Allow users to drag column headers to rearrange them. Persists to
   * localStorage when `stateSave: true`. Default `true`. Reorder is
   * constrained within each frozen group (left / non-frozen / right) to
   * keep sticky stacking sensible.
   */
  columnReorder: boolean;
  /** Fired after a successful header reorder, with the new id list. */
  onColumnReorder: ((orderedIds: string[]) => void) | null;
  /**
   * Allow users to drag the right edge of a header to resize the column.
   * Persists `col.width` (in px) to localStorage when `stateSave: true`.
   * Default `true`. Per-column opt-out via `Column.resizable: false`.
   */
  columnResize: boolean;
  /** Fired after a resize commits (on mouseup), with the new width in px. */
  onColumnResize: ((id: string, widthPx: number) => void) | null;
  /**
   * Allow users to drag tree rows onto another row to change `parentId`.
   * Opt-in (default `false`) because the move mutates user data. Combine
   * with `onReparent` to validate / persist the move; return `false` from
   * the callback to abort.
   */
  treeReparent: boolean;
  /**
   * Fired before a tree reparent commits. Return `false` to abort. The
   * `Promise` form lets the caller await async server validation.
   */
  onReparent:
    | ((
        childRow: TRow,
        newParentRow: TRow | null,
        oldParentRow: TRow | null,
      ) => boolean | void | Promise<boolean | void>)
    | null;
  /**
   * Render rows as an adjacency-list tree. Each row needs an id (the
   * identifier column) and `row[treeParentField]` pointing at its parent's
   * id (or `null` for roots). Mutually exclusive with `groupBy` — when
   * both are set, treeMode wins and a warning is logged.
   */
  treeMode: boolean;
  /** Field name on each row that holds the parent's id. Default `"parentId"`. */
  treeParentField: string;
  /** Field name on each row that holds the row's id. `null` → identifier column. */
  treeIdField: string | null;
  /** Pixels of indentation per depth level. Default `24`. */
  treeIndentPx: number;
  /** Column id to render the caret in. `null` → first visible non-frozen column. */
  treeColumn: string | null;
  /** Initial expand state. `"all"` / `"none"` / per-id record. */
  treeExpanded: "all" | "none" | Record<string | number, boolean>;
  /**
   * Render an expandable detail panel under each row. Returns the panel's
   * HTML string or a node to mount; return `null` to skip the panel for
   * that row (the chevron then becomes inert). When set, an extra leading
   * cell carries the expand chevron — it lives between the selection
   * cell (if any) and the first data column.
   */
  rowDetail: ((row: TRow) => string | HTMLElement | null) | null;
  /**
   * Render a sticky toolbar above the table whenever at least one row is
   * selected. The function receives the live array of selected rows and
   * returns either an HTML string or a node to mount inside the bar.
   * Boostgrid prepends an "N selected" counter and a "Clear" button to
   * whatever the function returns. `null` (default) disables the bar.
   *
   * Pairs naturally with `selection: true` and `multiSelect: true`.
   */
  bulkActions: ((selected: TRow[]) => string | HTMLElement) | null;
  /**
   * Render animated placeholder rows during ajax fetches in place of the
   * blank "Loading..." text. `true` (default) uses `rowsPerPage` as the
   * placeholder count; pass a number to override; `false` disables the
   * skeleton (falls back to the previous behaviour). Has no effect when
   * `ajax: false` since synchronous loads don't observe a fetch window.
   */
  loadingSkeleton: boolean | number;
  /**
   * Spreadsheet-style range selection inside the grid body. Click a cell
   * to anchor; shift-click or drag to extend; Ctrl/Cmd+C copies the
   * rectangle as tab-separated values (one row per `\n`). Escape clears.
   *
   * Off by default because it changes click semantics — and conflicts
   * with `rowSelect: true`. Only one of the two should be on at a time.
   */
  cellSelection: boolean;
  /**
   * Pin the `<thead>` to the viewport top while the table scrolls past.
   * Pure CSS via `position: sticky; top: 0;` on the header cells.
   * Coexists with frozen columns (which sit on the same `position: sticky`
   * — their `left:` offset isn't disturbed by the header's `top:`). Pair
   * with `--boostgrid-sticky-top: <Npx>;` to offset for a fixed page nav.
   */
  stickyHeader: boolean;
  /**
   * When a body cell's text is clipped by overflow, show the full text on
   * hover via a native `title` attribute. Default `true` — purely additive
   * UX. Set `false` to opt out (e.g. if you want custom tooltip styling).
   */
  truncatedTooltips: boolean;
  /**
   * BCP-47 locale tag (e.g. `"en-US"`, `"de-DE"`, `"ja-JP"`) read by the
   * built-in `infos` template number-formatter and exposed for user-defined
   * formatters via `grid.options.locale`. `null` (default) lets the
   * runtime decide via `Intl.NumberFormat()`.
   */
  locale: string | null;
  /**
   * When `true`, bracket each render pass with `performance.mark()` +
   * `performance.measure()` entries (User Timing API). Lets app authors
   * profile grid renders in production via Chrome DevTools' Performance
   * panel — the entries appear under the Timings track without changing
   * any production code paths.
   *
   * Mark names are namespaced as `boostgrid:<id>:<phase>:start|end` and
   * the measure as `boostgrid:<id>:<phase>` where `<phase>` is one of
   * `render`, `header`, `body`, `footer`. `<id>` is the table's id
   * (or a hash if unset). Default `false` so we don't pay any overhead
   * by default — even cheap marks add up at 60Hz scroll.
   */
  performanceMarks: boolean;
  /**
   * Initial expand state for detail panels. `"all"` opens every row's
   * panel on first render; `"none"` (default) opens none. A
   * `Record<id, boolean>` lets you set per-row defaults — `true` means
   * "expanded".
   */
  rowDetailExpanded: "all" | "none" | Record<string | number, boolean>;
  /**
   * Default value for `column.editable` when no per-column flag is set.
   * Even with this on, the identifier column is never editable.
   */
  editable: boolean;
  /**
   * Fired after a cell edit is committed (Enter or blur). Return a Promise
   * to chain async server work; call `commit.revert()` from inside or after
   * the promise to roll the row back if the server rejects.
   */
  onCellEdit: CellEditCallback<TRow> | null;
  /**
   * Persist sort, page, page-size, search, column visibility and (optional)
   * selection in `localStorage` so the table re-opens in the same state on
   * the next visit. No-ops when `localStorage` is unavailable.
   */
  stateSave: boolean;
  /**
   * localStorage key for state persistence. Defaults to `boostgrid:<table-id>`
   * if the table has an `id`, or `boostgrid:<column-id-hash>` otherwise.
   */
  stateKey: string | null;
  labels: Labels;
  icons: IconSet;
  statusMapping: Record<number, string>;
}

export interface AjaxRequest {
  current: number;
  rowCount: number;
  sort: SortDictionary;
  searchPhrase: string;
  /**
   * Active grouping config when `groupBy` is set on the grid. Always sent
   * as an array (single-string `groupBy: "status"` is normalized here).
   * Omitted when grouping is off so existing servers see the same payload.
   */
  groupBy?: string[];
  /**
   * Path strings of groups the user has explicitly collapsed
   * (e.g. `["active", "active//us"]`). Sent only when grouping is active
   * AND at least one path is collapsed.
   */
  collapsedGroups?: string[];
  /**
   * Whether `treeMode` is on. Lets the server decide whether to return
   * a flat slice or a tree-shaped response.
   */
  treeMode?: boolean;
  /**
   * Ids of tree nodes the user has explicitly expanded (when default is
   * `"none"`) or NOT collapsed (when default is `"all"`). Send only when
   * `treeMode` is on.
   */
  expandedTreeNodes?: Array<string | number>;
}

export interface AjaxResponse {
  current: number;
  rowCount: number;
  rows: Row[];
  total: number;
}

/**
 * Persisted view state. Versioned so older payloads can be discarded or
 * partially-applied on a schema bump. Selection is only saved when
 * `keepSelection: true`. Group/tree state is only present when
 * `groupBy` / `treeMode` are in use.
 *
 *  - **v: 1** — original (no group/tree state).
 *  - **v: 2** — adds `collapsedGroups` (path-string set) and
 *    `expandedTreeNodes` (id set). v:1 payloads still apply non-hierarchical
 *    fields cleanly.
 *  - **v: 3** — adds `columnOrder` (id list) and `columnWidths` (id → "Npx")
 *    so user reorders + drag-resizes round-trip across reloads. v:2 payloads
 *    still apply cleanly; missing v:3-only fields are simply ignored.
 */
export interface BoostgridState {
  v: 3;
  current: number;
  rowsPerPage: number;
  searchPhrase: string;
  sortDictionary: SortDictionary;
  columnVisibility: Record<string, boolean>;
  selected: unknown[];
  /** Path strings of collapsed group buckets, e.g. `["active", "active//us"]`. */
  collapsedGroups: string[];
  /** Ids of tree nodes the user has explicitly expanded (or NOT collapsed,
   *  depending on `treeExpanded` semantics — saveState records the live
   *  expanded set). */
  expandedTreeNodes: Array<string | number>;
  /** Persisted column order (left-to-right), if the user reordered headers. */
  columnOrder: string[];
  /** Per-column widths in the form `{"amount": "180px"}`. */
  columnWidths: Record<string, string>;
}

export type EventName =
  | "initialized"
  | "load"
  | "loaded"
  | "appended"
  | "removed"
  | "cleared"
  | "selected"
  | "deselected"
  | "sorted"
  | "searched";

export type Listener = (...args: unknown[]) => void;

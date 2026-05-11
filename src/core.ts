import type {
  AjaxRequest, AjaxResponse, BoostgridOptions, Column, EventName, Listener, Row, SortDictionary,
} from "./types.js";
import { mergeOptions, parseColumns, parseRowsFromTable } from "./options.js";
import { $, $$, debounce, delegate, el, readData } from "./dom.js";
import { renderHeader } from "./render/header.js";
import { renderBody, renderSkeleton } from "./render/body.js";
import { resolveTreeColumnId } from "./render/tree.js";
import { renderFooter } from "./render/footer.js";
import { renderToolbar } from "./render/toolbar.js";
import { renderPagination, renderInfos } from "./render/pagination.js";
import { mountVirtualScroll, refreshVirtualWindow, type VirtualWindow } from "./render/virtual.js";
import { mountCellEdit } from "./render/edit.js";
import { mountCellSelection } from "./render/cell-select.js";
import { saveState, restoreState, clearState, flushSaveState } from "./state.js";

/** Normalize a tree id-or-parent-id (mirrors `normalizeId` in tree.ts so
 *  the reparent path matches what the tree builder produces). */
function normalizeTreeId(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return t;
  }
  return null;
}

/**
 * Boostgrid v2 — vanilla, BS5-native data grid.
 *
 * Performance notes:
 *  - Single delegated click listener (data-bg-action) replaces v1's per-row bindings.
 *  - Derived view (filtered + sorted + paged) memoized via dirty flags so paging
 *    doesn't re-run sort, sorting doesn't re-run filter, etc.
 *  - Selection lookups use a Map<id, Row> keyed by the identifier column for O(1) hits.
 *  - Search input is debounced (default 200ms).
 *  - Body renders via DocumentFragment + cloneNode of a row template.
 */
export class Boostgrid<TRow extends Row = Row> {
  readonly element: HTMLTableElement;
  readonly options: BoostgridOptions<TRow>;
  columns: Column<TRow>[] = [];
  identifier: string | null = null;

  private rows: TRow[] = [];
  private rowIndex: Map<unknown, TRow> = new Map();
  private selected: Set<unknown> = new Set();

  current = 1;
  private rowsPerPage: number;
  searchPhrase = "";
  /** Cached compiled regex for `searchPhrase`. Invalidated whenever
   *  `executeSearch` mutates the phrase. Avoids re-compiling per row
   *  inside `applyFilter`. */
  private searchRegex: RegExp | null = null;
  sortDictionary: SortDictionary = {};
  /** Cached comparator built from `sortDictionary`. Cleared by `sort()` /
   *  the action handler whenever the dictionary mutates. Avoids paying
   *  `Object.entries` + closure allocation per `applySort` call. */
  private sortComparator: ((a: TRow, b: TRow) => number) | null = null;

  /** Filtered (pre-sort, pre-page) view. Public so render/virtual.ts can
   *  read its `.length` without paying for a `.slice()` allocation per
   *  scroll event via the public getter. Treat as read-only. */
  filtered: TRow[] = [];
  private sorted: TRow[] = [];
  /** rows on the current page after filter+sort */
  currentRows: TRow[] = [];
  total = 0;
  totalPages = 0;
  /**
   * Active virtual-scroll window. `null` when virtualScroll is off.
   * Exposed publicly so `render/virtual.ts` can mutate it without
   * a circular import.
   */
  virtualWindow: VirtualWindow | null = null;
  /**
   * Snapshot of the window the previous virtual-scroll renderBody pass
   * actually painted. Public so `render/body.ts` can compare and short-
   * circuit a full rebuild when only the pad heights changed. Cleared
   * by `destroy()` and on virtual-scroll teardown.
   */
  lastRenderedVirtualWindow: VirtualWindow | null = null;
  /** Hook the virtual-scroll module sets to lazy-bind its scroll listener
   *  to <tbody> after renderBody creates it. Null when virtualScroll is off. */
  ensureVirtualBinding: (() => void) | null = null;
  /** Collapsed group paths. Path strings are joined with `//`
   *  (see `groupPathToString` in render/group.ts) so multi-level
   *  collapse targets one branch precisely. Public so `render/group.ts`
   *  can read it during the walk without a back-reference. */
  collapsedGroupPaths: Set<string> = new Set();
  /** Tree expand state — set of row ids the user has explicitly expanded
   *  (when `treeExpanded: "none"`) or NOT collapsed (when `"all"`).
   *  Public so `render/tree.ts` can read it. */
  expandedTreeNodes: Set<string | number> = new Set();
  /** Row-detail expand state — set of row ids whose detail panel should
   *  render. Tracking mode mirrors the tree-expanded model: `"expanded"`
   *  means the set lists rows that ARE expanded (default `"none"`);
   *  `"collapsed"` means it lists rows that are collapsed despite the
   *  default `"all"`. */
  expandedRowDetails: Set<string | number> = new Set();
  rowDetailTracking: "expanded" | "collapsed" = "expanded";
  /** When true, `expandedTreeNodes` records which roots/branches are
   *  expanded; when false (the default for `treeExpanded: "all"`), it
   *  records which are *collapsed*. Computed once at construction. */
  treeExpandTracking: "expanded" | "collapsed" = "collapsed";

  /** Transient: the id of the column currently being drag-reordered. Reset
   *  to null on drop / dragend / window blur. */
  private dragColumnId: string | null = null;

  /** Snapshot of authored column order/visibility/width, captured at attach
   *  time. Powers `resetColumnState()`. */
  private columnsBaseline: Array<{ id: string; visible: boolean; width: string | null }> = [];

  private dirtyFilter = true;
  private dirtySort = true;

  private listeners: Map<EventName, Set<Listener>> = new Map();
  private cleanupFns: Array<() => void> = [];
  private rootContainer: HTMLDivElement;
  private toolbarTop: HTMLDivElement | null = null;
  private toolbarBottom: HTMLDivElement | null = null;
  private bulkBar: HTMLDivElement | null = null;
  /** Public so `attach()` can detect a stale registry entry and replace it. */
  destroyed = false;
  private debouncedSearch: (phrase: string) => void;

  /** Monotonic counter so an out-of-order ajax response (later request,
   *  earlier landing) cannot overwrite a fresher one. Each `fetchAjax`
   *  bumps this and bails if its captured value no longer matches. */
  private ajaxRequestId = 0;
  /** AbortController for the in-flight ajax request; lets us cancel the
   *  network slot when a newer call starts. Null when no fetch is pending. */
  private ajaxAbort: AbortController | null = null;

  constructor(table: HTMLTableElement, options?: Partial<BoostgridOptions<TRow>>) {
    this.element = table;
    const fromTable = readData(table) as Partial<BoostgridOptions<TRow>>;
    this.options = mergeOptions<TRow>(options, fromTable);

    const rc = this.options.rowCount;
    // Virtual scroll manages the slice itself, so force "All" on the page-size
    // axis. The row-count dropdown is suppressed in this mode (see toolbar).
    this.rowsPerPage = this.options.virtualScroll
      ? -1
      : Array.isArray(rc) ? Number(rc[0]) : Number(rc);

    this.columns = parseColumns<TRow>(table, this.options);
    // Snapshot the columns as authored so "Reset to defaults" can revert
    // user reorder + visibility + width changes back to the markup state.
    this.columnsBaseline = this.columns.map((c) => ({
      id: c.id,
      visible: c.visible,
      width: c.width,
    }));
    const idCol = this.columns.find((c) => c.identifier);
    this.identifier = idCol ? idCol.id : null;

    this.columns.forEach((c) => {
      if (c.order) this.sortDictionary[c.id] = c.order;
    });

    // Seed collapsed groups from options.groupExpanded. "all" → none collapsed,
    // "none" → seeded lazily on first walk, Record<path,bool> → falsy paths.
    const ge = this.options.groupExpanded;
    if (ge && typeof ge === "object") {
      for (const [k, v] of Object.entries(ge)) {
        if (!v) this.collapsedGroupPaths.add(k);
      }
    }
    // Seed tree-expand state. "all" tracks collapses (default open),
    // "none" tracks expansions (default closed), Record bootstraps either.
    const te = this.options.treeExpanded;
    this.treeExpandTracking = te === "none" ? "expanded" : "collapsed";
    if (te && typeof te === "object") {
      for (const [k, v] of Object.entries(te)) {
        // If tracking expansions, store keys that are TRUE; if collapses, FALSE.
        const wantStored = this.treeExpandTracking === "expanded" ? !!v : !v;
        if (wantStored) this.expandedTreeNodes.add(k);
      }
    }
    // Same model for row-detail expand state. Default "none" → closed.
    const rde = this.options.rowDetailExpanded;
    this.rowDetailTracking = rde === "all" ? "collapsed" : "expanded";
    if (rde && typeof rde === "object") {
      for (const [k, v] of Object.entries(rde)) {
        const wantStored = this.rowDetailTracking === "expanded" ? !!v : !v;
        if (wantStored) this.expandedRowDetails.add(k);
      }
    }
    // Mutual exclusivity: tree mode wins if both are set.
    if (this.options.treeMode && this.options.groupBy) {
      // eslint-disable-next-line no-console
      console.warn(
        "Boostgrid: treeMode and groupBy cannot both be active; treeMode wins.",
      );
    }

    // wrap the table inside a container we own (toolbars/pagination live here)
    this.rootContainer = el("div", { class: "boostgrid" });
    table.parentNode?.insertBefore(this.rootContainer, table);
    this.rootContainer.appendChild(table);
    table.classList.add("boostgrid-table");
    if (!table.classList.contains("table")) table.classList.add("table");
    if (this.options.stickyHeader) {
      this.rootContainer.classList.add("boostgrid--sticky-head");
    }

    this.rows = parseRowsFromTable<TRow>(table, this.columns);
    this.reindex();

    this.debouncedSearch = debounce((phrase: string) => {
      this.executeSearch(phrase);
    }, this.options.searchSettings.delay);

    this.mountChrome();
    this.bindDelegatedEvents();
    // Restore persisted view state BEFORE the first render so the initial
    // paint is already in the saved page/sort/search/visibility state.
    restoreState(this);
    this.invalidate("filter");
    // Virtual scroll listener must mount AFTER the table is in the DOM but
    // BEFORE the first loadData, so its initial window is in place when
    // renderBody runs.
    if (this.options.virtualScroll) {
      this.cleanupFns.push(mountVirtualScroll(this));
    }
    // Cell-edit listener: only attaches if any column is editable.
    this.cleanupFns.push(mountCellEdit(this));
    // Cell-selection listener: spreadsheet-style range select + Ctrl+C copy.
    if (this.options.cellSelection) {
      this.cleanupFns.push(mountCellSelection(this));
    }
    // Frozen-columns shadow: track horizontal scroll on the .table-responsive
    // ancestor (if any) so the rightmost frozen cell can show a drop-shadow
    // only while content is scrolled. No-op when no .table-responsive parent
    // exists — the frozen columns still work, just without the shadow affordance.
    this.cleanupFns.push(mountScrollShadow(this));
    this.loadData();
    this.emit("initialized");
  }

  /** Public hook used by the virtual-scroll module to repaint the body
   *  without re-running filter/sort. */
  rerenderBody(): void {
    renderBody(this);
  }

  // Hooks used by state.ts to apply restored values without exposing
  // private fields. Kept public for the helpers but not part of the
  // documented user-facing API.
  applyRestoredRowsPerPage(n: number): void {
    if (!Number.isFinite(n)) return;
    this.rowsPerPage = n;
  }
  applyRestoredSelection(ids: unknown[]): void {
    if (!this.options.keepSelection || !this.identifier) return;
    this.selected.clear();
    for (const id of ids) this.selected.add(id);
  }

  // -------- public API --------

  append(rows: TRow[]): this {
    if (this.options.ajax) return this;
    rows.forEach((r) => {
      this.rows.push(r);
      if (this.identifier) this.rowIndex.set(r[this.identifier], r);
    });
    this.invalidate("filter");
    this.loadData();
    this.emit("appended", rows);
    return this;
  }

  clear(): this {
    if (this.options.ajax) return this;
    const removed = this.rows.slice();
    this.rows = [];
    this.rowIndex.clear();
    this.selected.clear();
    this.current = 1;
    this.invalidate("filter");
    this.loadData();
    this.emit("cleared", removed);
    return this;
  }

  remove(rowIds?: unknown[]): this {
    if (!this.identifier) return this;
    const ids = rowIds ?? Array.from(this.selected);
    const removed: TRow[] = [];
    for (const id of ids) {
      const row = this.rowIndex.get(id);
      if (!row) continue;
      this.rows.splice(this.rows.indexOf(row), 1);
      this.rowIndex.delete(id);
      this.selected.delete(id);
      removed.push(row);
    }
    this.current = 1;
    this.invalidate("filter");
    this.loadData();
    this.emit("removed", removed);
    return this;
  }

  search(phrase?: string): this {
    this.executeSearch(phrase ?? "");
    return this;
  }

  sort(dictionary?: SortDictionary): this {
    this.sortDictionary = dictionary ? { ...dictionary } : {};
    this.sortComparator = null;
    this.invalidate("sort");
    this.renderHeader();
    this.loadData();
    this.emit("sorted", this.sortDictionary);
    return this;
  }

  select(rowIds?: unknown[]): this {
    if (!this.options.selection || !this.identifier) return this;
    // Distinguish "select all visible rows" (caller passed nothing) from
    // "select these specific rows" — the former gets the full-table
    // refresh; the latter takes the fast diffed path that only touches
    // the changed rows' <tr>s.
    const fullRefresh = rowIds == null;
    const ids = rowIds ?? this.currentRows.map((r) => r[this.identifier!]);
    const newly: TRow[] = [];
    const changedIds: unknown[] = [];
    for (const id of ids) {
      if (this.selected.has(id)) continue;
      if (!this.options.multiSelect && this.selected.size >= 1) break;
      const row = this.rowIndex.get(id);
      if (row) {
        this.selected.add(id);
        newly.push(row);
        changedIds.push(id);
      }
    }
    if (newly.length) {
      if (fullRefresh) this.refreshSelectionVisuals();
      else this.refreshSelectionForIds(changedIds);
      saveState(this);
      this.emit("selected", newly);
    }
    return this;
  }

  deselect(rowIds?: unknown[]): this {
    if (!this.options.selection || !this.identifier) return this;
    const fullRefresh = rowIds == null;
    const ids = rowIds ?? Array.from(this.selected);
    const removed: TRow[] = [];
    const changedIds: unknown[] = [];
    for (const id of ids) {
      if (!this.selected.delete(id)) continue;
      const row = this.rowIndex.get(id);
      if (row) {
        removed.push(row);
        changedIds.push(id);
      }
    }
    if (removed.length) {
      if (fullRefresh) this.refreshSelectionVisuals();
      else this.refreshSelectionForIds(changedIds);
      saveState(this);
      this.emit("deselected", removed);
    }
    return this;
  }

  reload(): this {
    this.current = 1;
    this.invalidate("filter");
    this.loadData();
    return this;
  }

  destroy(): this {
    if (this.destroyed) return this;
    this.destroyed = true;
    // Flush any pending debounced state save BEFORE we tear DOM down —
    // a user's last interaction in the debounce window must still land
    // in localStorage.
    flushSaveState(this);
    // Bump the request id so any in-flight ajax response is silently
    // dropped instead of trying to render into a torn-down DOM. Abort
    // the actual fetch too, when supported.
    this.ajaxRequestId++;
    if (this.ajaxAbort) { this.ajaxAbort.abort(); this.ajaxAbort = null; }
    this.lastRenderedVirtualWindow = null;
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.toolbarTop?.remove();
    this.toolbarBottom?.remove();
    this.bulkBar?.remove();
    // Strip the auto-created <tfoot>. User-authored markup (no marker) stays.
    const tfoot = this.element.querySelector<HTMLTableSectionElement>(":scope > tfoot");
    if (tfoot && tfoot.dataset.boostgridAuto === "true") tfoot.remove();
    // Unwrap: move the table back to where the wrapper currently sits, then
    // drop the wrapper. Guarded so a partially-detached tree (e.g. when
    // React's reconciler is mid-unmount) doesn't throw.
    const parent = this.rootContainer.parentNode;
    if (parent && this.element.parentNode === this.rootContainer) {
      parent.insertBefore(this.element, this.rootContainer);
    }
    this.rootContainer.remove();
    // Clear the convenience handle. `attach()`'s WeakMap entry is still
    // there but the `existing.destroyed` guard makes it safe to ignore.
    delete (this.element as HTMLTableElement & { boostgridInstance?: unknown }).boostgridInstance;
    return this;
  }

  // -------- getters --------

  getColumnSettings(): Column<TRow>[] { return this.columns.slice(); }
  getCurrentPage(): number { return this.current; }
  getCurrentRows(): TRow[] { return this.currentRows.slice(); }
  getRowCount(): number { return this.rowsPerPage; }
  getSearchPhrase(): string { return this.searchPhrase; }
  getSelectedRows(): unknown[] { return Array.from(this.selected); }
  getSortDictionary(): SortDictionary { return { ...this.sortDictionary }; }
  getTotalPageCount(): number { return this.totalPages; }
  getTotalRowCount(): number { return this.total; }
  /** Rows after search/filter (across all pages). Snapshot copy. */
  getFilteredRows(): TRow[] { return this.filtered.slice(); }
  /** Unfiltered dataset. Snapshot copy. */
  getAllRows(): TRow[] { return this.rows.slice(); }
  /**
   * Returns the footer cell for the given column id, or null if no footer
   * is rendered or the column id doesn't match. Analog of DataTables'
   * `column().footer()`.
   */
  /**
   * Wipe persisted state for this table (no-op if `stateSave` is off or
   * `localStorage` isn't available). Doesn't reset the live grid — call
   * `reload()` afterwards if you want the in-memory state to roll back too.
   */
  clearSavedState(): this {
    clearState(this);
    return this;
  }

  /**
   * Synchronously flush any pending debounced state save. State writes
   * are debounced (~200ms) so a burst of mutations during a column
   * resize drag doesn't pay 60Hz of `JSON.stringify`. Call this from a
   * `beforeunload` handler, before reading `localStorage` in a test, or
   * any other moment you need the latest state on disk *now*.
   * `destroy()` flushes automatically, so this is only needed when the
   * grid stays alive.
   */
  flushState(): this {
    flushSaveState(this);
    return this;
  }

  getFooterCell(columnId: string): HTMLTableCellElement | null {
    const tfoot = this.element.querySelector(":scope > tfoot");
    if (!tfoot) return null;
    return tfoot.querySelector<HTMLTableCellElement>(
      `[data-column-id="${cssEscape(columnId)}"]`,
    );
  }

  // -------- events --------

  on(name: EventName, fn: Listener): this {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
    return this;
  }
  off(name: EventName, fn: Listener): this {
    this.listeners.get(name)?.delete(fn);
    return this;
  }
  private emit(name: EventName, ...args: unknown[]): void {
    this.listeners.get(name)?.forEach((fn) => fn(...args));
    this.element.dispatchEvent(new CustomEvent(`boostgrid:${name}`, { detail: args, bubbles: true }));
  }

  // -------- internal --------

  setRowsPerPage(n: number): void {
    this.rowsPerPage = n;
    this.current = 1;
    this.invalidate("page");
    this.loadData();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.current = page;
    this.invalidate("page");
    this.loadData();
  }

  toggleSelectRow(id: unknown): void {
    if (this.selected.has(id)) this.deselect([id]);
    else this.select([id]);
  }

  /**
   * True if the given group is currently rendered expanded. `pathOrKey` is
   * either a single key (single-level grouping, back-compat) or a `//`-joined
   * path string (multi-level — e.g. `"active//us"`). Honors
   * `options.groupExpanded` for groups never toggled by the user.
   */
  isGroupExpanded(pathOrKey: unknown): boolean {
    const k = String(pathOrKey == null ? "" : pathOrKey);
    if (this.collapsedGroupPaths.has(k)) return false;
    const ge = this.options.groupExpanded;
    if (ge === "none") return false;
    return true;
  }

  /** Flip the expand state for a group path and re-render the body. */
  toggleGroup(pathOrKey: unknown): void {
    const k = String(pathOrKey == null ? "" : pathOrKey);
    if (this.collapsedGroupPaths.has(k)) this.collapsedGroupPaths.delete(k);
    else this.collapsedGroupPaths.add(k);
    saveState(this);
    renderBody(this);
  }

  // -------- tree-mode public API --------

  /** True if the given tree node is currently rendered expanded. */
  isTreeExpanded(id: string | number): boolean {
    if (this.treeExpandTracking === "expanded") {
      return this.expandedTreeNodes.has(id);
    }
    return !this.expandedTreeNodes.has(id);
  }

  /** Flip the expand state for a tree node and re-render the body. */
  toggleTreeNode(id: string | number): void {
    if (this.treeExpandTracking === "expanded") {
      if (this.expandedTreeNodes.has(id)) this.expandedTreeNodes.delete(id);
      else this.expandedTreeNodes.add(id);
    } else {
      if (this.expandedTreeNodes.has(id)) this.expandedTreeNodes.delete(id);
      else this.expandedTreeNodes.add(id);
    }
    saveState(this);
    renderBody(this);
  }

  /** Expand every tree node. */
  expandAllTree(): void {
    this.expandedTreeNodes.clear();
    this.treeExpandTracking = "collapsed";
    saveState(this);
    renderBody(this);
  }

  /**
   * The id of the column that carries the tree caret (and ought to receive
   * indentation in a tree-aware export). Returns `null` when not in tree
   * mode. Same priority order as the renderer: explicit option →
   * `treeColumn: true` flag → first non-frozen visible → first visible.
   */
  getTreeColumnId(): string | null {
    if (!this.options.treeMode) return null;
    return resolveTreeColumnId(this);
  }

  /**
   * Walk the parent chain of a tree row and return its ancestors in
   * root-first order (ie. `[root, …, parent]`, **excluding the row itself**).
   * Returns `null` outside tree mode and an empty array for unknown ids.
   */
  getTreeAncestors(id: string | number): TRow[] | null {
    if (!this.options.treeMode || !this.identifier) return null;
    const idField = this.options.treeIdField ?? this.identifier;
    const parentField = this.options.treeParentField;
    const startRow = this.findTreeRowById(id, idField);
    if (!startRow) return [];
    const chain: TRow[] = [];
    const seen = new Set<string | number>();
    let cur: string | number | null = normalizeTreeId(
      (startRow as Record<string, unknown>)[parentField],
    );
    while (cur != null) {
      if (seen.has(cur)) break; // cycle guard
      seen.add(cur);
      const row = this.findTreeRowById(cur, idField);
      if (!row) break;
      chain.unshift(row);
      cur = normalizeTreeId((row as Record<string, unknown>)[parentField]);
    }
    return chain;
  }

  /**
   * Resolve a tree row's depth (0 for roots) by walking ancestors via
   * `treeParentField`. Returns `null` when the id is unknown or when
   * `treeMode` is off. Useful for export plugins that want to indent or
   * path-annotate rows.
   */
  getTreeDepth(id: string | number): number | null {
    if (!this.options.treeMode || !this.identifier) return null;
    const idField = this.options.treeIdField ?? this.identifier;
    const parentField = this.options.treeParentField;
    if (!this.findTreeRowById(id, idField)) return null;
    let depth = 0;
    const seen = new Set<string | number>();
    let cur: string | number | null = id;
    while (cur != null) {
      if (seen.has(cur)) return depth; // cycle guard
      seen.add(cur);
      const row = this.findTreeRowById(cur, idField);
      if (!row) return depth;
      const parent = normalizeTreeId((row as Record<string, unknown>)[parentField]);
      if (parent == null) return depth;
      depth++;
      cur = parent;
    }
    return depth;
  }

  /** Collapse every tree node. */
  collapseAllTree(): void {
    this.expandedTreeNodes.clear();
    this.treeExpandTracking = "expanded";
    saveState(this);
    renderBody(this);
  }

  // -------- row detail public API --------

  /** True if the given row's detail panel is currently rendered. */
  isRowDetailExpanded(id: string | number): boolean {
    if (this.rowDetailTracking === "expanded") {
      return this.expandedRowDetails.has(id);
    }
    return !this.expandedRowDetails.has(id);
  }

  /** Flip a row's detail-panel state and re-render the body. */
  toggleRowDetail(id: string | number): void {
    if (this.expandedRowDetails.has(id)) this.expandedRowDetails.delete(id);
    else this.expandedRowDetails.add(id);
    renderBody(this);
  }

  /** Open every row's detail panel. */
  expandAllRowDetails(): void {
    this.expandedRowDetails.clear();
    this.rowDetailTracking = "collapsed";
    renderBody(this);
  }

  /** Close every row's detail panel. */
  collapseAllRowDetails(): void {
    this.expandedRowDetails.clear();
    this.rowDetailTracking = "expanded";
    renderBody(this);
  }

  /**
   * Reparent a tree row programmatically. Returns `true` on a real move,
   * `false` on no-op or guard-rejected (cycle, missing row, etc.). Mutates
   * `child[treeParentField]` in place and re-renders. Use `null` for
   * `newParentId` to make the row a root.
   */
  reparentTreeNode(childId: string | number, newParentId: string | number | null): boolean {
    if (!this.options.treeMode || !this.identifier) return false;
    const idField = this.options.treeIdField ?? this.identifier;
    const parentField = this.options.treeParentField;
    const childRow = this.findTreeRowById(childId, idField);
    if (!childRow) return false;
    const oldParentId = normalizeTreeId(
      (childRow as Record<string, unknown>)[parentField],
    );
    const targetParentId = newParentId == null ? null : normalizeTreeId(newParentId);
    if (oldParentId === targetParentId) return false;
    if (childId === targetParentId) return false; // self-parent
    if (targetParentId != null && this.wouldCreateTreeCycle(childId, targetParentId, idField, parentField)) {
      return false;
    }
    const oldParentRow = oldParentId == null ? null : this.findTreeRowById(oldParentId, idField);
    const newParentRow = targetParentId == null ? null : this.findTreeRowById(targetParentId, idField);
    if (targetParentId != null && newParentRow == null) return false; // unknown target
    (childRow as Record<string, unknown>)[parentField] = targetParentId;
    // Auto-expand the new parent so the moved subtree is visible.
    if (targetParentId != null) {
      if (this.treeExpandTracking === "expanded") {
        this.expandedTreeNodes.add(targetParentId);
      } else {
        this.expandedTreeNodes.delete(targetParentId);
      }
    }
    this.invalidate("filter");
    this.loadData();
    saveState(this);
    void Promise.resolve(
      this.options.onReparent?.(childRow, newParentRow, oldParentRow),
    );
    return true;
  }

  private findTreeRowById(id: string | number, idField: string): TRow | null {
    for (const r of this.rows) {
      const rid = normalizeTreeId((r as Record<string, unknown>)[idField]);
      if (rid === id) return r;
    }
    return null;
  }

  /** True if making `parentId` the parent of `childId` would create a
   *  cycle — i.e. `parentId` is `childId` itself or a descendant. */
  private wouldCreateTreeCycle(
    childId: string | number,
    parentId: string | number,
    idField: string,
    parentField: string,
  ): boolean {
    const seen = new Set<string | number>();
    let cursor: string | number | null = parentId;
    while (cursor != null) {
      if (cursor === childId) return true;
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      const row = this.findTreeRowById(cursor, idField);
      if (!row) return false;
      cursor = normalizeTreeId((row as Record<string, unknown>)[parentField]);
    }
    return false;
  }

  private reindex(): void {
    this.rowIndex.clear();
    if (!this.identifier) return;
    for (const r of this.rows) this.rowIndex.set(r[this.identifier], r);
  }

  private invalidate(level: "filter" | "sort" | "page"): void {
    if (level === "filter") this.dirtyFilter = this.dirtySort = true;
    else if (level === "sort") this.dirtySort = true;
    // "page" is recomputed every loadData() — no flag needed
  }

  private executeSearch(phrase: string): void {
    if (phrase === this.searchPhrase) return;
    this.searchPhrase = phrase;
    this.searchRegex = null;
    this.current = 1;
    this.invalidate("filter");
    const input = this.searchInput();
    if (input && input.value !== phrase) input.value = phrase;
    this.loadData();
    this.emit("searched", phrase);
  }

  private loadData(): void {
    if (this.options.ajax) {
      this.fetchAjax();
      return;
    }
    if (this.dirtyFilter) {
      this.filtered = this.applyFilter(this.rows);
      this.dirtyFilter = false;
    }
    if (this.dirtySort) {
      this.sorted = this.applySort(this.filtered);
      this.dirtySort = false;
    }
    this.total = this.sorted.length;
    if (this.rowsPerPage === -1) {
      this.totalPages = 1;
      this.current = 1;
      this.currentRows = this.sorted;
    } else {
      this.totalPages = Math.max(1, Math.ceil(this.total / this.rowsPerPage));
      if (this.current > this.totalPages) this.current = this.totalPages;
      const start = (this.current - 1) * this.rowsPerPage;
      this.currentRows = this.sorted.slice(start, start + this.rowsPerPage);
    }
    if (!this.options.keepSelection) this.selected.clear();

    // Virtual scroll: refresh the window from the latest dataset slice
    // BEFORE renderBody reads it. Then ensure the scroll listener is bound
    // to the (possibly fresh) <tbody> AFTER the first paint.
    if (this.options.virtualScroll) refreshVirtualWindow(this);
    this.renderBody();
    if (this.ensureVirtualBinding) this.ensureVirtualBinding();
    this.renderFooter();
    this.renderInfo();
    this.renderPagination();
    this.refreshSelectionVisuals();
    saveState(this);
    this.emit("loaded");
  }

  private async fetchAjax(): Promise<void> {
    const url = typeof this.options.url === "function" ? this.options.url() : this.options.url;
    if (!url) throw new Error("Boostgrid: ajax mode requires a non-empty url.");
    const reqBody: AjaxRequest = {
      current: this.current,
      rowCount: this.rowsPerPage,
      sort: this.sortDictionary,
      searchPhrase: this.searchPhrase,
    };
    // Surface grouping + tree state so server adapters can return the
    // matching slice / shape. Only include the fields when their feature
    // is on, so existing endpoints see the same payload as before.
    const gb = this.options.groupBy;
    if (gb != null) {
      const ids = typeof gb === "string" ? [gb] : Array.from(gb);
      if (ids.length > 0) {
        reqBody.groupBy = ids;
        if (this.collapsedGroupPaths.size > 0) {
          reqBody.collapsedGroups = Array.from(this.collapsedGroupPaths);
        }
      }
    }
    if (this.options.treeMode) {
      reqBody.treeMode = true;
      if (this.expandedTreeNodes.size > 0) {
        reqBody.expandedTreeNodes = Array.from(this.expandedTreeNodes);
      }
    }
    const transformed = this.options.requestHandler(reqBody);
    this.emit("load");
    // Skeleton rows: animated placeholders fill the tbody until the fetch
    // resolves and the real rows replace them.
    const sk = this.options.loadingSkeleton;
    if (sk !== false) {
      const count = typeof sk === "number" ? Math.max(1, sk) :
        this.rowsPerPage > 0 ? Math.min(this.rowsPerPage, 10) : 5;
      renderSkeleton(this, count);
    }
    // Race-condition guard: bump the request id, abort any pending older
    // request, and capture the new id locally so we can detect being
    // superseded after the await.
    const myId = ++this.ajaxRequestId;
    if (this.ajaxAbort) this.ajaxAbort.abort();
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    this.ajaxAbort = ctrl;
    let res: Response;
    try {
      res = await fetch(url, {
        method: this.options.ajaxSettings.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transformed),
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (err) {
      // A newer call aborted us — silently drop. Anything else rethrows so
      // callers / global handlers see real network failures.
      if (myId !== this.ajaxRequestId) return;
      throw err;
    }
    if (myId !== this.ajaxRequestId) return;
    const json = (await res.json()) as AjaxResponse;
    if (myId !== this.ajaxRequestId) return;
    if (this.ajaxAbort === ctrl) this.ajaxAbort = null;
    const final = this.options.responseHandler(json);
    this.rows = final.rows as TRow[];
    this.reindex();
    this.total = final.total;
    this.totalPages = Math.max(1, Math.ceil(final.total / Math.max(1, this.rowsPerPage)));
    this.currentRows = final.rows as TRow[];
    // In ajax mode the server returns one page at a time, so filtered/all
    // collapse to the same view as currentRows. Footer formatters that
    // need true cross-page totals must compute server-side and inject via
    // a custom column or footerCallback.
    this.filtered = final.rows as TRow[];
    this.sorted = final.rows as TRow[];
    this.renderBody();
    this.renderFooter();
    this.renderInfo();
    this.renderPagination();
    saveState(this);
    this.emit("loaded");
  }

  private applyFilter(rows: TRow[]): TRow[] {
    // Tree mode keeps every row through filtering so buildTree() can
    // include ancestors of matched leaves. The actual match-vs-prune
    // happens inside render/tree.ts's walkTree().
    if (this.options.treeMode) return rows.slice();
    if (!this.searchPhrase) return rows.slice();
    // Compile the search regex once per phrase, reuse across rows + columns.
    let re = this.searchRegex;
    if (!re) {
      const flags = this.options.caseSensitive ? "" : "i";
      re = new RegExp(escapeRegExp(this.searchPhrase), flags);
      this.searchRegex = re;
    }
    const cols = this.columns.filter((c) => c.searchable && c.visible);
    return rows.filter((row) => {
      for (const col of cols) {
        if (re!.test(col.converter.to(row[col.id]))) return true;
      }
      return false;
    });
  }

  private applySort(rows: TRow[]): TRow[] {
    let cmp = this.sortComparator;
    if (!cmp) {
      const entries = Object.entries(this.sortDictionary);
      if (entries.length === 0) return rows.slice();
      // Pre-compile the comparator once. Each subsequent applySort with
      // the same sortDictionary reuses this closure rather than rebuilding
      // `entries` and the multi-key fallback chain.
      cmp = (a: TRow, b: TRow) => {
        for (let i = 0; i < entries.length; i++) {
          const [col, dir] = entries[i];
          const c = compare(a[col], b[col]);
          if (c !== 0) return dir === "asc" ? c : -c;
        }
        return 0;
      };
      this.sortComparator = cmp;
    }
    return rows.slice().sort(cmp);
  }

  // -------- rendering glue --------

  private mountChrome(): void {
    this.mountToolbars();
    this.renderHeader();
  }

  /** Mount toolbars + bulk bar around the table. Called once at construction
   *  and again from {@link redrawChrome} when callers swap labels at runtime. */
  private mountToolbars(): void {
    const top = !!(this.options.navigation & 1);
    const bottom = !!(this.options.navigation & 2);
    if (top) {
      this.toolbarTop = renderToolbar(this, "top");
      this.rootContainer.insertBefore(this.toolbarTop, this.element);
    }
    if (this.options.bulkActions) {
      this.bulkBar = el("div", {
        class: "boostgrid-bulkbar",
        style: "display: none;",
        role: "toolbar",
        "aria-label": this.options.labels.bulkActions,
      });
      this.rootContainer.insertBefore(this.bulkBar, this.element);
    }
    if (bottom) {
      this.toolbarBottom = renderToolbar(this, "bottom");
      this.rootContainer.appendChild(this.toolbarBottom);
    }
  }

  /**
   * Re-render the toolbars + bulk bar after mutating `options.labels`,
   * `options.locale`, or `options.bulkActions` at runtime. Skips the
   * `<thead>` so per-column markup metadata (data-identifier, data-tree-column,
   * etc.) is preserved across the call. Delegated listeners on the wrapper
   * survive the swap automatically.
   */
  redrawChrome(): void {
    this.toolbarTop?.remove();
    this.toolbarBottom?.remove();
    this.bulkBar?.remove();
    this.toolbarTop = null;
    this.toolbarBottom = null;
    this.bulkBar = null;
    this.mountToolbars();
    this.renderInfo();
    this.renderPagination();
    this.renderBulkBar();
  }

  /** Refresh the sticky bulk-action bar based on current selection. Idempotent
   *  — called from selection mutators. No-ops when `bulkActions` is null. */
  private renderBulkBar(): void {
    if (!this.bulkBar || !this.options.bulkActions) return;
    const selectedIds = Array.from(this.selected);
    if (selectedIds.length === 0) {
      this.bulkBar.style.display = "none";
      this.bulkBar.replaceChildren();
      return;
    }
    const rows = this.getSelectedRowObjects();
    const userContent = this.options.bulkActions(rows);
    this.bulkBar.replaceChildren();
    this.bulkBar.style.display = "";
    const counter = el("span", { class: "boostgrid-bulkbar-count" });
    counter.textContent = this.options.labels.bulkSelected.replace(
      "{n}",
      String(selectedIds.length),
    );
    this.bulkBar.appendChild(counter);
    const slot = el("div", { class: "boostgrid-bulkbar-slot" });
    if (typeof userContent === "string") slot.innerHTML = userContent;
    else slot.appendChild(userContent);
    this.bulkBar.appendChild(slot);
    const clear = el("button", {
      type: "button",
      class: "btn btn-sm btn-link ms-auto",
      "data-bg-action": "bulk-clear",
    });
    clear.textContent = this.options.labels.bulkClear;
    this.bulkBar.appendChild(clear);
  }

  /** Resolve currently-selected ids to row objects via the row index. */
  private getSelectedRowObjects(): TRow[] {
    const out: TRow[] = [];
    for (const id of this.selected) {
      const r = this.rowIndex.get(id);
      if (r) out.push(r);
    }
    return out;
  }

  private renderHeader(): void { this.mark("header", () => renderHeader(this)); }
  private renderBody(): void   { this.mark("body",   () => renderBody(this)); }
  private renderFooter(): void { this.mark("footer", () => renderFooter(this)); }

  /**
   * Wrap a render phase with `performance.mark()` + `performance.measure()`
   * entries when `performanceMarks` is on. The measure name is namespaced
   * by table id so multiple grids on the same page surface as distinct
   * Timings entries in DevTools. No-ops (zero overhead) by default.
   */
  private mark<T>(phase: string, fn: () => T): T {
    if (!this.options.performanceMarks || typeof performance === "undefined" || !performance.mark) {
      return fn();
    }
    const id = this.element.id || "boostgrid";
    const start = `boostgrid:${id}:${phase}:start`;
    const end = `boostgrid:${id}:${phase}:end`;
    performance.mark(start);
    try { return fn(); }
    finally {
      performance.mark(end);
      try { performance.measure(`boostgrid:${id}:${phase}`, start, end); }
      catch { /* mark cleared between calls — silent */ }
    }
  }
  private renderInfo(): void {
    [this.toolbarTop, this.toolbarBottom].forEach((bar) => {
      if (bar) renderInfos(bar, this);
    });
  }
  private renderPagination(): void {
    [this.toolbarTop, this.toolbarBottom].forEach((bar) => {
      if (bar) renderPagination(bar, this);
    });
  }

  private searchInput(): HTMLInputElement | null {
    return $<HTMLInputElement>(".bg-search input", this.rootContainer);
  }

  private refreshSelectionVisuals(): void {
    // Bulk-action bar reflects selection regardless of `options.selection`,
    // so refresh it before the early return below.
    this.renderBulkBar();
    if (!this.identifier || !this.options.selection) return;
    const idCol = this.identifier;
    const rows = $$("tbody > tr", this.element);
    rows.forEach((tr) => {
      const id = (tr as HTMLElement).dataset.rowId;
      if (id == null) return;
      // O(1) lookup via the row index instead of a per-row .find() walk
      // over currentRows. Identifier values may be numeric, so coerce
      // both sides to string for the keyed lookup.
      let match = this.rowIndex.get(id) as TRow | undefined;
      if (!match && /^-?\d+(\.\d+)?$/.test(id)) match = this.rowIndex.get(Number(id));
      if (!match) return;
      const isSelected = this.selected.has(match[idCol]);
      tr.classList.toggle("table-active", isSelected);
      const cb = $<HTMLInputElement>("input.bg-select-row", tr);
      if (cb) cb.checked = isSelected;
    });
    const head = $<HTMLInputElement>("thead input.bg-select-all", this.element);
    if (head) {
      const all = this.currentRows.length > 0
        && this.currentRows.every((r) => this.selected.has(r[idCol]));
      head.checked = all;
    }
  }

  /**
   * Fast path: only touch the rows whose selection state actually changed.
   * Avoids walking every visible <tr> for single-row toggle events. The
   * caller passes the ids it just added to / removed from `this.selected`.
   * The header select-all checkbox is cheap (an `every()` over currentRows)
   * and is re-evaluated on every call so it stays in sync.
   */
  private refreshSelectionForIds(changedIds: unknown[]): void {
    this.renderBulkBar();
    if (!this.identifier || !this.options.selection) return;
    const idCol = this.identifier;
    const tbody = this.element.querySelector<HTMLTableSectionElement>(":scope > tbody");
    if (tbody) {
      for (const id of changedIds) {
        const sel = `tr[data-row-id="${cssEscape(String(id))}"]`;
        const tr = tbody.querySelector<HTMLTableRowElement>(sel);
        if (!tr) continue;
        const isSelected = this.selected.has(id);
        tr.classList.toggle("table-active", isSelected);
        const cb = tr.querySelector<HTMLInputElement>("input.bg-select-row");
        if (cb) cb.checked = isSelected;
      }
    }
    const head = $<HTMLInputElement>("thead input.bg-select-all", this.element);
    if (head) {
      const all = this.currentRows.length > 0
        && this.currentRows.every((r) => this.selected.has(r[idCol]));
      head.checked = all;
    }
  }

  private bindDelegatedEvents(): void {
    // Single delegated click listener handles every action chip in the grid.
    this.cleanupFns.push(delegate(this.rootContainer, "click", "[data-bg-action]", (e, t) => {
      const action = t.dataset.bgAction;
      const value = t.dataset.bgValue;
      switch (action) {
        case "page": {
          const p = Number(value);
          if (!Number.isNaN(p)) this.goToPage(p);
          break;
        }
        case "rows-per-page": {
          this.setRowsPerPage(Number(value));
          break;
        }
        case "sort": {
          if (!value) return;
          const col = this.columns.find((c) => c.id === value);
          if (!col?.sortable) return;
          const cur = this.sortDictionary[value];
          const next: SortDictionary = this.options.multiSort ? { ...this.sortDictionary } : {};
          next[value] = cur === "asc" ? "desc" : "asc";
          if (cur === "desc") delete next[value];
          this.sort(next);
          break;
        }
        case "toggle-column": {
          const col = this.columns.find((c) => c.id === value);
          if (col) {
            col.visible = !col.visible;
            // Diffed fast path for non-frozen columns: flip `hidden` on
            // every existing cell in this column. The header / body /
            // footer DOM stays put; only one boolean attribute moves.
            // Frozen columns can't take this path because hiding one
            // shifts the sticky offsets of its siblings — the offset
            // cache needs the full re-render to recompute.
            //
            // Caveat: rows whose colspan reads visible-column count
            // (group headers, "no results", master/detail panels) keep
            // their old colspan until the next full render. The visual
            // overshoot is one column wide and harmless; loadData() and
            // any user action that triggers a re-render restores it.
            if (col.frozen) {
              this.renderHeader();
              this.renderBody();
              this.renderFooter();
            } else {
              const sel = `[data-column-id="${cssEscape(value!)}"]`;
              const cells = this.element.querySelectorAll<HTMLElement>(sel);
              const hide = !col.visible;
              for (const cell of cells) cell.hidden = hide;
            }
            saveState(this);
          }
          break;
        }
        case "reset-columns": {
          this.resetColumnState();
          break;
        }
        case "refresh": {
          this.reload();
          break;
        }
        case "toggle-group": {
          if (value != null) this.toggleGroup(value);
          break;
        }
        case "toggle-tree": {
          if (value != null) {
            // Coerce numeric ids back to numbers — readData stores them as strings.
            const id = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
            this.toggleTreeNode(id);
          }
          break;
        }
        case "toggle-detail": {
          if (value != null) {
            const id = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
            this.toggleRowDetail(id);
          }
          break;
        }
        case "bulk-clear": {
          this.deselect();
          break;
        }
      }
      e.preventDefault();
    }));

    // Selection: row checkbox + row click (if rowSelect)
    this.cleanupFns.push(delegate(this.rootContainer, "click", "input.bg-select-row", (_, t) => {
      const tr = t.closest("tr");
      const id = tr?.getAttribute("data-row-id");
      if (id == null) return;
      this.toggleSelectRowByDatasetId(id);
    }));
    this.cleanupFns.push(delegate(this.rootContainer, "click", "input.bg-select-all", (_, t) => {
      const checked = (t as HTMLInputElement).checked;
      if (checked) this.select();
      else this.deselect();
    }));
    this.cleanupFns.push(delegate(this.rootContainer, "click", "tbody > tr", (e, tr) => {
      if (!this.options.rowSelect) return;
      const target = e.target as Element;
      if (target.closest("input,a,button,label")) return;
      const id = tr.getAttribute("data-row-id");
      if (id == null) return;
      this.toggleSelectRowByDatasetId(id);
    }));

    // Search input
    this.cleanupFns.push(delegate(this.rootContainer, "input", ".bg-search input", (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (v.length === 0 || v.length >= this.options.searchSettings.characters) {
        this.debouncedSearch(v);
      }
    }));

    // Truncated-text tooltips: lazily attach a `title` attribute when the
    // user hovers a body cell whose content overflows. Skips cells that
    // already carry a title (formatter authors win) and cells with an
    // explicit `data-bg-no-tooltip`.
    if (this.options.truncatedTooltips) {
      this.cleanupFns.push(
        delegate(this.rootContainer, "mouseover", "tbody > tr > td", (_e, td) => {
          if (td.hasAttribute("title")) return;
          if (td.hasAttribute("data-bg-no-tooltip")) return;
          // scrollWidth > clientWidth → content is being clipped.
          if (td.scrollWidth - td.clientWidth <= 1) return;
          // Use textContent so we mirror what the user actually sees,
          // not the formatter's HTML.
          const text = (td.textContent ?? "").trim();
          if (text) td.setAttribute("title", text);
        }),
      );
    }

    // Column-visibility panel: filter-columns input filters the items
    // locally, no re-render needed. We toggle a `d-none` class per item.
    this.cleanupFns.push(
      delegate(this.rootContainer, "input", "[data-bg-action=\"filter-columns\"]", (e, t) => {
        const q = (t as HTMLInputElement).value.trim().toLowerCase();
        const list = t.closest(".boostgrid-columns-menu")?.querySelector(".boostgrid-columns-list");
        if (!list) return;
        // Build the id->column map once instead of doing .find() per item.
        const byId = new Map<string, Column<TRow>>();
        for (const c of this.columns) byId.set(c.id, c);
        list.querySelectorAll<HTMLElement>(".boostgrid-columns-item").forEach((item) => {
          const id = item.getAttribute("data-column-id") ?? "";
          const col = byId.get(id);
          const text = (col?.text ?? id).toLowerCase();
          const match = !q || text.includes(q) || id.toLowerCase().includes(q);
          item.classList.toggle("d-none", !match);
        });
        e.preventDefault();
      }),
    );

    // Tree drag-to-reparent: opt-in (treeReparent: true). Uses the same
    // delegated DnD pattern as column reorder, but on body <tr>'s carrying
    // data-row-id. Cycle/self guards live in reparentTreeNode().
    if (this.options.treeReparent) {
      let dragRowId: string | null = null;
      const clearMarks = () => {
        this.element.querySelectorAll<HTMLElement>("tbody > tr[data-drop-target]").forEach((tr) => {
          tr.removeAttribute("data-drop-target");
        });
      };
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragstart", "tbody > tr[data-row-id][draggable=\"true\"]", (e, t) => {
          const id = t.getAttribute("data-row-id");
          if (!id) return;
          dragRowId = id;
          const dt = (e as DragEvent).dataTransfer;
          if (dt) {
            dt.effectAllowed = "move";
            try { dt.setData("text/plain", id); } catch { /* jsdom no-op */ }
          }
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragover", "tbody > tr[data-row-id]", (e, t) => {
          if (!dragRowId) return;
          const targetId = t.getAttribute("data-row-id");
          if (!targetId || targetId === dragRowId) return;
          clearMarks();
          t.setAttribute("data-drop-target", "true");
          e.preventDefault();
          const dt = (e as DragEvent).dataTransfer;
          if (dt) dt.dropEffect = "move";
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragleave", "tbody > tr[data-row-id]", (_, t) => {
          t.removeAttribute("data-drop-target");
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "drop", "tbody > tr[data-row-id]", (e, t) => {
          const dragId = dragRowId;
          dragRowId = null;
          clearMarks();
          if (!dragId) return;
          const targetId = t.getAttribute("data-row-id");
          if (!targetId || targetId === dragId) return;
          // Coerce numeric ids back so they match the row's typed id.
          const childKey = /^-?\d+(\.\d+)?$/.test(dragId) ? Number(dragId) : dragId;
          const parentKey = /^-?\d+(\.\d+)?$/.test(targetId) ? Number(targetId) : targetId;
          if (this.reparentTreeNode(childKey, parentKey)) {
            e.preventDefault();
          }
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragend", "tbody > tr[data-row-id]", () => {
          dragRowId = null;
          clearMarks();
        }),
      );
    }

    // Column-visibility panel: drag a row's grip handle to reorder.
    // Reuses the same reorderColumn() method as the header drag, so the
    // frozen-group constraint is honored.
    if (this.options.columnReorder) {
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragstart", ".boostgrid-columns-item[draggable=\"true\"]", (e, t) => {
          const id = t.getAttribute("data-column-id");
          if (!id) return;
          this.dragColumnId = id;
          t.setAttribute("data-dragging", "true");
          const dt = (e as DragEvent).dataTransfer;
          if (dt) {
            dt.effectAllowed = "move";
            try { dt.setData("text/plain", id); } catch { /* jsdom no-op */ }
          }
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragover", ".boostgrid-columns-item", (e, t) => {
          if (!this.dragColumnId) return;
          const targetId = t.getAttribute("data-column-id");
          if (!targetId || targetId === this.dragColumnId) return;
          const rect = t.getBoundingClientRect();
          const before = (e as DragEvent).clientY < rect.top + rect.height / 2;
          t.setAttribute("data-drop-side", before ? "before" : "after");
          e.preventDefault();
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragleave", ".boostgrid-columns-item", (_, t) => {
          t.removeAttribute("data-drop-side");
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "drop", ".boostgrid-columns-item", (e, t) => {
          const dragId = this.dragColumnId;
          this.dragColumnId = null;
          this.element.querySelectorAll<HTMLElement>(".boostgrid-columns-item[data-drop-side]").forEach((it) => {
            it.removeAttribute("data-drop-side");
          });
          if (!dragId) return;
          const targetId = t.getAttribute("data-column-id");
          if (!targetId || targetId === dragId) return;
          const rect = t.getBoundingClientRect();
          const before = (e as DragEvent).clientY < rect.top + rect.height / 2;
          if (this.reorderColumn(dragId, targetId, before ? "before" : "after")) {
            e.preventDefault();
          }
        }),
      );
    }

    // Column reorder: HTML5 DnD on header cells. Single delegated listener
    // for each phase mirrors the click-action pattern. Drop is constrained
    // within each frozen group (left / unfrozen / right) so sticky stacking
    // stays sensible.
    if (this.options.columnReorder) {
      const clearDropMarks = () => {
        this.element.querySelectorAll<HTMLElement>("thead th[data-drop-side]").forEach((th) => {
          th.removeAttribute("data-drop-side");
        });
      };
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragstart", "thead > tr > th[draggable=\"true\"]", (e, t) => {
          // Ignore drags that began on the resize grip — that's a separate gesture.
          const tgt = e.target as HTMLElement;
          if (tgt.classList.contains("boostgrid-resize-grip")) {
            e.preventDefault();
            return;
          }
          const id = t.getAttribute("data-column-id");
          if (!id) return;
          this.dragColumnId = id;
          t.setAttribute("data-dragging", "true");
          const dt = (e as DragEvent).dataTransfer;
          if (dt) {
            dt.effectAllowed = "move";
            // Some browsers (Firefox) need a payload to start a drag at all.
            try { dt.setData("text/plain", id); } catch { /* jsdom no-op */ }
          }
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragover", "thead > tr > th", (e, t) => {
          if (!this.dragColumnId) return;
          const targetId = t.getAttribute("data-column-id");
          if (!targetId || targetId === this.dragColumnId) return;
          const dragCol = this.columns.find((c) => c.id === this.dragColumnId);
          const targetCol = this.columns.find((c) => c.id === targetId);
          if (!dragCol || !targetCol) return;
          // Frozen-group constraint — if sides differ, cap at the appropriate
          // side's edge. We still allow the dragover so the cursor doesn't
          // turn into "no entry"; we just bias the side marker.
          const rect = t.getBoundingClientRect();
          const x = (e as DragEvent).clientX;
          const before = x < rect.left + rect.width / 2;
          clearDropMarks();
          t.setAttribute("data-drop-side", before ? "before" : "after");
          e.preventDefault();
          const dt = (e as DragEvent).dataTransfer;
          if (dt) dt.dropEffect = "move";
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragleave", "thead > tr > th", (_, t) => {
          t.removeAttribute("data-drop-side");
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "drop", "thead > tr > th", (e, t) => {
          const dragId = this.dragColumnId;
          this.dragColumnId = null;
          clearDropMarks();
          this.element.querySelectorAll<HTMLElement>("thead th[data-dragging]").forEach((th) => {
            th.removeAttribute("data-dragging");
          });
          if (!dragId) return;
          const targetId = t.getAttribute("data-column-id");
          if (!targetId || targetId === dragId) return;
          const rect = t.getBoundingClientRect();
          const before = (e as DragEvent).clientX < rect.left + rect.width / 2;
          if (this.reorderColumn(dragId, targetId, before ? "before" : "after")) {
            e.preventDefault();
          }
        }),
      );
      this.cleanupFns.push(
        delegate(this.rootContainer, "dragend", "thead > tr > th", () => {
          this.dragColumnId = null;
          clearDropMarks();
          this.element.querySelectorAll<HTMLElement>("thead th[data-dragging]").forEach((th) => {
            th.removeAttribute("data-dragging");
          });
        }),
      );
    }

    // Column resize: delegated mousedown on the grip starts a drag tracked
    // on the document until mouseup. Live updates skip a full re-render —
    // we only mutate the column's <th> + matching <td> widths.
    if (this.options.columnResize) {
      this.cleanupFns.push(
        delegate(this.rootContainer, "mousedown", ".boostgrid-resize-grip", (e, t) => {
          const id = t.getAttribute("data-bg-grip");
          if (!id) return;
          const col = this.columns.find((c) => c.id === id);
          if (!col || !col.resizable) return;
          this.beginResize(col, t as HTMLElement, e as MouseEvent);
          e.preventDefault();
        }),
      );
    }
  }

  /**
   * Restore column order, visibility, and widths to the values captured
   * at attach time (the "as authored" baseline). Persists the reset.
   */
  resetColumnState(): void {
    const byId = new Map(this.columns.map((c) => [c.id, c]));
    const restored: Column<TRow>[] = [];
    for (const snap of this.columnsBaseline) {
      const c = byId.get(snap.id);
      if (!c) continue;
      c.visible = snap.visible;
      c.width = snap.width;
      restored.push(c);
    }
    // Preserve any columns that weren't in the baseline (defensive — should
    // never happen in normal use).
    for (const c of this.columns) {
      if (!restored.includes(c)) restored.push(c);
    }
    this.columns = restored;
    this.renderHeader();
    renderBody(this);
    this.renderFooter();
    saveState(this);
  }

  /**
   * Splice `dragId` into a new position relative to `targetId`. Returns
   * `true` when the order changed. Frozen-group constrained: a left-frozen
   * column dropped onto a non-frozen target snaps to the end of the
   * left-frozen run; same idea for the right-frozen group. Identifier
   * columns reorder freely (the user can opt out per-column via
   * `reorderable: false`).
   */
  reorderColumn(dragId: string, targetId: string, side: "before" | "after"): boolean {
    if (dragId === targetId) return false;
    const dragIdx = this.columns.findIndex((c) => c.id === dragId);
    if (dragIdx === -1) return false;
    const dragCol = this.columns[dragIdx];
    if (!dragCol.reorderable) return false;
    // Snap-to-edge: if the target sits in a different frozen group, snap to
    // the boundary of the dragged column's own group instead of jumping
    // across. Index of last left-frozen + count of right-frozen are the
    // anchor points.
    const next = [...this.columns];
    next.splice(dragIdx, 1);
    let insertAt: number;
    const targetIdx = next.findIndex((c) => c.id === targetId);
    if (targetIdx === -1) return false;
    const targetCol = next[targetIdx];
    if (dragCol.frozen === targetCol.frozen) {
      insertAt = side === "before" ? targetIdx : targetIdx + 1;
    } else {
      // Snap to end of the dragged column's frozen group.
      if (dragCol.frozen === "left") {
        insertAt = next.findIndex((c) => c.frozen !== "left");
        if (insertAt === -1) insertAt = next.length;
      } else if (dragCol.frozen === "right") {
        insertAt = next.findIndex((c) => c.frozen === "right");
        if (insertAt === -1) insertAt = next.length;
      } else {
        // Non-frozen dragged onto a frozen target: settle just outside the
        // frozen group on whichever side the target lives.
        if (targetCol.frozen === "left") {
          insertAt = next.findIndex((c) => c.frozen !== "left");
          if (insertAt === -1) insertAt = next.length;
        } else {
          insertAt = next.findIndex((c) => c.frozen === "right");
          if (insertAt === -1) insertAt = next.length;
        }
      }
    }
    next.splice(insertAt, 0, dragCol);
    if (next.every((c, i) => c === this.columns[i])) return false;
    this.columns = next;
    this.renderHeader();
    renderBody(this);
    this.renderFooter();
    saveState(this);
    this.options.onColumnReorder?.(this.columns.map((c) => c.id));
    return true;
  }

  /** Start a drag-resize on the given column. Tracked on the document so
   *  the user can drag past the grid bounds. Cleans up its own listeners
   *  on mouseup; does not push to the persistent cleanupFns list. */
  private beginResize(
    col: Column<TRow>,
    grip: HTMLElement,
    ev: MouseEvent,
  ): void {
    const th = grip.closest<HTMLTableCellElement>("th");
    if (!th) return;
    const rect = th.getBoundingClientRect();
    const startX = ev.clientX;
    const startWidth = rect.width;
    grip.setAttribute("data-active", "true");
    th.setAttribute("data-resizing", "true");
    document.body.style.cursor = "col-resize";

    // Pre-resolve matching <td>s once at drag start. Rows can't change
    // while the drag is in flight (no other inputs are processing), so
    // re-querying every mousemove was pure waste. Walk manually rather
    // than using a CSS selector because column ids may contain characters
    // that need escaping.
    const matchingTds: HTMLTableCellElement[] = [];
    const allTds = this.element.querySelectorAll<HTMLTableCellElement>("tbody > tr > td");
    for (const td of allTds) {
      if (td.getAttribute("data-column-id") === col.id) matchingTds.push(td);
    }

    const apply = (px: number): number => {
      const clamped = Math.max(col.minWidth, Math.min(col.maxWidth, px));
      const wpx = `${clamped}px`;
      th.style.width = wpx;
      for (const td of matchingTds) td.style.width = wpx;
      return clamped;
    };

    let last = startWidth;
    // rAF-throttle the move handler — high-frame-rate pointers fire
    // mousemove 120-240 Hz, but we only need one width write per
    // animation frame. Coalesce: the latest cursor X wins.
    let pendingX: number | null = null;
    let frame = 0;
    const flushMove = () => {
      frame = 0;
      if (pendingX == null) return;
      last = apply(startWidth + (pendingX - startX));
      pendingX = null;
    };
    const onMove = (e: MouseEvent) => {
      pendingX = e.clientX;
      if (!frame) frame = requestAnimationFrame(flushMove);
    };
    const onUp = () => {
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      // Apply any pending coalesced move synchronously so `last` reflects
      // the final cursor position, not the previous frame's.
      if (pendingX != null) last = apply(startWidth + (pendingX - startX));
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      grip.removeAttribute("data-active");
      th.removeAttribute("data-resizing");
      document.body.style.cursor = "";
      const finalPx = Math.round(last);
      col.width = `${finalPx}px`;
      // Single re-render so frozen offsets / footer cells catch up.
      this.renderHeader();
      renderBody(this);
      this.renderFooter();
      saveState(this);
      this.options.onColumnResize?.(col.id, finalPx);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  private toggleSelectRowByDatasetId(datasetId: string): void {
    if (!this.identifier) return;
    const idCol = this.identifier;
    const row = this.currentRows.find((r) => String(r[idCol]) === datasetId);
    if (!row) return;
    this.toggleSelectRow(row[idCol]);
  }
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Track horizontal scroll on the nearest `.table-responsive` ancestor so the
 * grid wrapper gets a `boostgrid--scrolled-x` class when scrolled past the
 * leading edge. The class drives the rightmost-frozen-cell drop-shadow CSS.
 * Returns a no-op cleanup if no scroll parent or no frozen column exists.
 */
function mountScrollShadow<TRow extends Row>(grid: Boostgrid<TRow>): () => void {
  if (!grid.columns.some((c) => c.frozen === "left")) return () => undefined;
  const wrapper = grid.element.parentElement; // .boostgrid
  const scrollParent = wrapper?.closest<HTMLElement>(".table-responsive");
  if (!wrapper || !scrollParent) return () => undefined;

  const update = () => {
    if (scrollParent.scrollLeft > 0) wrapper.classList.add("boostgrid--scrolled-x");
    else wrapper.classList.remove("boostgrid--scrolled-x");
  };
  update();
  scrollParent.addEventListener("scroll", update, { passive: true });
  return () => {
    scrollParent.removeEventListener("scroll", update);
    wrapper.classList.remove("boostgrid--scrolled-x");
  };
}

/** Minimal attribute-selector escape for column ids. CSS.escape is widely
 *  available but tsdom-friendly fallback covers the characters that actually
 *  appear in identifier-style column ids. */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
  return s.replace(/["\\]/g, "\\$&");
}

import type {
  AjaxRequest, AjaxResponse, BoostgridOptions, Column, EventName, Listener, Row, SortDictionary,
} from "./types.js";
import { mergeOptions, parseColumns, parseRowsFromTable } from "./options.js";
import { $, $$, debounce, delegate, el, readData } from "./dom.js";
import { renderHeader } from "./render/header.js";
import { renderBody } from "./render/body.js";
import { renderToolbar } from "./render/toolbar.js";
import { renderPagination, renderInfos } from "./render/pagination.js";

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
export class Boostgrid {
  readonly element: HTMLTableElement;
  readonly options: BoostgridOptions;
  columns: Column[] = [];
  identifier: string | null = null;

  private rows: Row[] = [];
  private rowIndex: Map<unknown, Row> = new Map();
  private selected: Set<unknown> = new Set();

  current = 1;
  private rowsPerPage: number;
  searchPhrase = "";
  sortDictionary: SortDictionary = {};

  private filtered: Row[] = [];
  private sorted: Row[] = [];
  /** rows on the current page after filter+sort */
  currentRows: Row[] = [];
  total = 0;
  totalPages = 0;

  private dirtyFilter = true;
  private dirtySort = true;

  private listeners: Map<EventName, Set<Listener>> = new Map();
  private cleanupFns: Array<() => void> = [];
  private rootContainer: HTMLDivElement;
  private toolbarTop: HTMLDivElement | null = null;
  private toolbarBottom: HTMLDivElement | null = null;
  private destroyed = false;
  private debouncedSearch: (phrase: string) => void;

  constructor(table: HTMLTableElement, options?: Partial<BoostgridOptions>) {
    this.element = table;
    const fromTable = readData(table) as Partial<BoostgridOptions>;
    this.options = mergeOptions(options, fromTable);

    const rc = this.options.rowCount;
    this.rowsPerPage = Array.isArray(rc) ? Number(rc[0]) : Number(rc);

    this.columns = parseColumns(table, this.options);
    const idCol = this.columns.find((c) => c.identifier);
    this.identifier = idCol ? idCol.id : null;

    this.columns.forEach((c) => {
      if (c.order) this.sortDictionary[c.id] = c.order;
    });

    // wrap the table inside a container we own (toolbars/pagination live here)
    this.rootContainer = el("div", { class: "boostgrid" });
    table.parentNode?.insertBefore(this.rootContainer, table);
    this.rootContainer.appendChild(table);
    table.classList.add("boostgrid-table");
    if (!table.classList.contains("table")) table.classList.add("table");

    this.rows = parseRowsFromTable(table, this.columns);
    this.reindex();

    this.debouncedSearch = debounce((phrase: string) => {
      this.executeSearch(phrase);
    }, this.options.searchSettings.delay);

    this.mountChrome();
    this.bindDelegatedEvents();
    this.invalidate("filter");
    this.loadData();
    this.emit("initialized");
  }

  // -------- public API --------

  append(rows: Row[]): this {
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
    const removed: Row[] = [];
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
    this.invalidate("sort");
    this.renderHeader();
    this.loadData();
    this.emit("sorted", this.sortDictionary);
    return this;
  }

  select(rowIds?: unknown[]): this {
    if (!this.options.selection || !this.identifier) return this;
    const ids = rowIds ?? this.currentRows.map((r) => r[this.identifier!]);
    const newly: Row[] = [];
    for (const id of ids) {
      if (this.selected.has(id)) continue;
      if (!this.options.multiSelect && this.selected.size >= 1) break;
      const row = this.rowIndex.get(id);
      if (row) {
        this.selected.add(id);
        newly.push(row);
      }
    }
    if (newly.length) {
      this.refreshSelectionVisuals();
      this.emit("selected", newly);
    }
    return this;
  }

  deselect(rowIds?: unknown[]): this {
    if (!this.options.selection || !this.identifier) return this;
    const ids = rowIds ?? Array.from(this.selected);
    const removed: Row[] = [];
    for (const id of ids) {
      if (!this.selected.delete(id)) continue;
      const row = this.rowIndex.get(id);
      if (row) removed.push(row);
    }
    if (removed.length) {
      this.refreshSelectionVisuals();
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
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.toolbarTop?.remove();
    this.toolbarBottom?.remove();
    // Unwrap: move the table back to where the wrapper currently sits, then
    // drop the wrapper. Guarded so a partially-detached tree (e.g. when
    // React's reconciler is mid-unmount) doesn't throw.
    const parent = this.rootContainer.parentNode;
    if (parent && this.element.parentNode === this.rootContainer) {
      parent.insertBefore(this.element, this.rootContainer);
    }
    this.rootContainer.remove();
    return this;
  }

  // -------- getters --------

  getColumnSettings(): Column[] { return this.columns.slice(); }
  getCurrentPage(): number { return this.current; }
  getCurrentRows(): Row[] { return this.currentRows.slice(); }
  getRowCount(): number { return this.rowsPerPage; }
  getSearchPhrase(): string { return this.searchPhrase; }
  getSelectedRows(): unknown[] { return Array.from(this.selected); }
  getSortDictionary(): SortDictionary { return { ...this.sortDictionary }; }
  getTotalPageCount(): number { return this.totalPages; }
  getTotalRowCount(): number { return this.total; }

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

    this.renderBody();
    this.renderInfo();
    this.renderPagination();
    this.refreshSelectionVisuals();
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
    const transformed = this.options.requestHandler(reqBody);
    this.emit("load");
    const res = await fetch(url, {
      method: this.options.ajaxSettings.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transformed),
    });
    const json = (await res.json()) as AjaxResponse;
    const final = this.options.responseHandler(json);
    this.rows = final.rows;
    this.reindex();
    this.total = final.total;
    this.totalPages = Math.max(1, Math.ceil(final.total / Math.max(1, this.rowsPerPage)));
    this.currentRows = final.rows;
    this.renderBody();
    this.renderInfo();
    this.renderPagination();
    this.emit("loaded");
  }

  private applyFilter(rows: Row[]): Row[] {
    if (!this.searchPhrase) return rows.slice();
    const flags = this.options.caseSensitive ? "" : "i";
    const re = new RegExp(escapeRegExp(this.searchPhrase), flags);
    const cols = this.columns.filter((c) => c.searchable && c.visible);
    return rows.filter((row) => {
      for (const col of cols) {
        if (re.test(col.converter.to(row[col.id]))) return true;
      }
      return false;
    });
  }

  private applySort(rows: Row[]): Row[] {
    const entries = Object.entries(this.sortDictionary);
    if (entries.length === 0) return rows.slice();
    return rows.slice().sort((a, b) => {
      for (const [col, dir] of entries) {
        const av = a[col];
        const bv = b[col];
        const cmp = compare(av, bv);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }

  // -------- rendering glue --------

  private mountChrome(): void {
    const top = !!(this.options.navigation & 1);
    const bottom = !!(this.options.navigation & 2);
    if (top) {
      this.toolbarTop = renderToolbar(this, "top");
      this.rootContainer.insertBefore(this.toolbarTop, this.element);
    }
    this.renderHeader();
    if (bottom) {
      this.toolbarBottom = renderToolbar(this, "bottom");
      this.rootContainer.appendChild(this.toolbarBottom);
    }
  }

  private renderHeader(): void {
    renderHeader(this);
  }
  private renderBody(): void {
    renderBody(this);
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
    if (!this.identifier || !this.options.selection) return;
    const idCol = this.identifier;
    const rows = $$("tbody > tr", this.element);
    rows.forEach((tr) => {
      const id = (tr as HTMLElement).dataset.rowId;
      // dataset is always string; compare via column converter "to"
      const match = this.currentRows.find((r) => String(r[idCol]) === id);
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
            this.renderHeader();
            this.renderBody();
          }
          break;
        }
        case "refresh": {
          this.reload();
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

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactElement,
  type Ref,
} from "react";
import {
  Boostgrid,
  type BoostgridOptions,
  type Column,
  type Row,
  type SortDictionary,
} from "boostgrid";

export type ColumnDef = Pick<Column, "id" | "text"> & Partial<Column>;

export interface ReactBoostgridProps {
  /** Rows to render. When this array reference changes, the grid is rebuilt via clear+append. */
  data: Row[];
  /** Column declarations rendered as <th data-column-id="…"> elements at mount. */
  columns: ColumnDef[];
  /** Forwarded to the core Boostgrid constructor. */
  options?: Partial<BoostgridOptions>;
  /** Class applied to the host div wrapper. */
  className?: string;
  /** Class applied to the underlying <table>. Defaults to "table table-hover". */
  tableClassName?: string;

  /* event callbacks — map 1:1 to grid.on(...) emitters */
  onLoaded?: (rows: Row[]) => void;
  onSelected?: (rows: Row[]) => void;
  onDeselected?: (rows: Row[]) => void;
  onSorted?: (dict: SortDictionary) => void;
  onSearched?: (phrase: string) => void;
}

/** Imperative handle exposed via `ref`. */
export interface ReactBoostgridHandle {
  readonly grid: Boostgrid | null;
  search: (phrase?: string) => void;
  sort: (dict?: SortDictionary) => void;
  reload: () => void;
  getSelectedRows: () => unknown[];
}

/**
 * Thin React wrapper around the vanilla Boostgrid core.
 *
 * Implementation note: React does not own the table DOM.
 * The component renders only an empty host <div>; the <table> is built
 * imperatively from the `columns` prop on mount. This avoids the classic
 * "third-party library rewrites my DOM" reconciliation conflict — React's
 * reconciler never sees the table cells boostgrid generates.
 *
 * To swap columns or options, change the component's `key` prop and let the
 * whole subtree remount cleanly.
 */
export const ReactBoostgrid = forwardRef<ReactBoostgridHandle, ReactBoostgridProps>(
  function ReactBoostgrid(props, ref): ReactElement {
    const {
      data, columns, options, className, tableClassName,
      onLoaded, onSelected, onDeselected, onSorted, onSearched,
    } = props;

    const hostRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<Boostgrid | null>(null);

    // Mount + teardown
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const table = buildTable(columns, tableClassName);
      host.appendChild(table);

      const grid = new Boostgrid(table, options);
      gridRef.current = grid;
      grid.append(data);

      if (onLoaded) grid.on("loaded", () => onLoaded(grid.getCurrentRows()));
      if (onSelected) grid.on("selected", (rows) => onSelected(rows as Row[]));
      if (onDeselected) grid.on("deselected", (rows) => onDeselected(rows as Row[]));
      if (onSorted) grid.on("sorted", (dict) => onSorted(dict as SortDictionary));
      if (onSearched) grid.on("searched", (p) => onSearched(p as string));

      return () => {
        grid.destroy();
        gridRef.current = null;
        // Boostgrid's destroy() puts the table back where the wrapper was.
        // Strip it from the host so a remount starts clean.
        while (host.firstChild) host.removeChild(host.firstChild);
      };
      // Mount-once: option / column / handler changes are intentionally ignored.
      // Bump the component's `key` prop to force a remount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync data updates after mount
    useEffect(() => {
      const grid = gridRef.current;
      if (!grid) return;
      grid.clear();
      grid.append(data);
    }, [data]);

    useImperativeHandle(ref, (): ReactBoostgridHandle => ({
      get grid() { return gridRef.current; },
      search:          (p) => gridRef.current?.search(p),
      sort:            (d) => gridRef.current?.sort(d),
      reload:          ()  => gridRef.current?.reload(),
      getSelectedRows: ()  => gridRef.current?.getSelectedRows() ?? [],
    }), []);

    return <div ref={hostRef} className={className} />;
  },
);

ReactBoostgrid.displayName = "ReactBoostgrid";

export default ReactBoostgrid;

/* ─────────── helpers ─────────── */

function buildTable(columns: ColumnDef[], tableClassName: string | undefined): HTMLTableElement {
  const table = document.createElement("table");
  table.className = tableClassName ?? "table table-hover";
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  for (const c of columns) {
    const th = document.createElement("th");
    th.textContent = c.text;
    th.setAttribute("data-column-id", c.id);
    if (c.identifier) th.setAttribute("data-identifier", "true");
    if (c.type) th.setAttribute("data-type", c.type);
    if (c.align) th.setAttribute("data-align", c.align);
    if (c.headerAlign) th.setAttribute("data-header-align", c.headerAlign);
    if (c.order) th.setAttribute("data-order", c.order);
    if (c.formatter && typeof c.formatter !== "function") {
      th.setAttribute("data-formatter", String(c.formatter));
    }
    if (c.sortable === false) th.setAttribute("data-sortable", "false");
    if (c.searchable === false) th.setAttribute("data-searchable", "false");
    if (c.visible === false) th.setAttribute("data-visible", "false");
    if (c.width != null) th.setAttribute("data-width", String(c.width));
    if (c.cssClass) th.setAttribute("data-css-class", c.cssClass);
    if (c.headerCssClass) th.setAttribute("data-header-css-class", c.headerCssClass);
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  table.appendChild(document.createElement("tbody"));
  return table;
}

// re-export core types so consumers can import from one place
export type { BoostgridOptions, Column, Row, SortDictionary, Ref };

import type { Boostgrid } from "../core.js";
import type { FooterContext, Row } from "../types.js";
import { $, clearChildren, el } from "../dom.js";
import { computeFrozenOffsets } from "./header.js";

const ALIGN: Record<string, string> = {
  left: "text-start",
  center: "text-center",
  right: "text-end",
};

/**
 * Renders <tfoot>. Three opt-in signals:
 *   1. options.footer === true            (explicit)
 *   2. options.footerCallback is set       (user wants a draw hook)
 *   3. any column has footerFormatter set  (declarative per-column totals)
 *   4. <tfoot> already exists in markup    (user authored static footer cells)
 *
 * If none of the above are true the existing <tfoot> (if any) is left
 * untouched — a defensive default that lets users keep static footer
 * markup without paying for a re-render every draw.
 *
 * Order of operations per draw:
 *   a. Locate or create <tfoot>.
 *   b. Build a fresh <tr> with one cell per visible column (+ leading
 *      empty cell when selection is on, mirroring renderHeader).
 *   c. For columns with a footerFormatter, set the cell's innerHTML.
 *   d. Replace the previous <tr> in <tfoot> with the new one.
 *   e. Run footerCallback last so it can override anything formatters wrote.
 */
export function renderFooter<TRow extends Row = Row>(grid: Boostgrid<TRow>): void {
  const opts = grid.options;
  const hasFormatters = grid.columns.some((c) => c.footerFormatter);
  const hasMarkup = !!grid.element.querySelector(":scope > tfoot");
  const enabled = opts.footer || !!opts.footerCallback || hasFormatters || hasMarkup;
  if (!enabled) return;

  let tfoot = $<HTMLTableSectionElement>(":scope > tfoot", grid.element);
  let auto = false;
  if (!tfoot) {
    tfoot = grid.element.appendChild(document.createElement("tfoot"));
    auto = true;
  }
  if (auto) tfoot.dataset.boostgridAuto = "true";

  const visibleCols = grid.columns.filter((c) => c.visible);
  const offsets = computeFrozenOffsets(grid, visibleCols);
  const tr = el("tr");

  if (opts.selection) {
    const hasFrozen = visibleCols.some((c) => c.frozen === "left");
    const cls = hasFrozen ? "bg-select-cell boostgrid-frozen" : "bg-select-cell";
    tr.appendChild(el("th", { class: cls, style: hasFrozen ? "left: 0;" : null }));
  }

  let visibleIndex = 0;
  for (const col of visibleCols) {
    const classes = [
      "boostgrid-tf",
      ALIGN[col.align] ?? "",
      col.cssClass,
      col.frozen === "left" ? "boostgrid-frozen" : "",
    ].filter(Boolean).join(" ");
    const styleParts: string[] = [];
    if (col.width) styleParts.push(`width: ${col.width};`);
    if (col.frozen === "left") {
      styleParts.push(`left: ${offsets.left[visibleIndex]}px;`);
    }
    const th = el("th", {
      class: classes,
      "data-column-id": col.id,
      style: styleParts.length ? styleParts.join(" ") : null,
    });
    visibleIndex++;
    if (col.footerFormatter) {
      th.innerHTML = col.footerFormatter(col, buildContext(grid));
    }
    tr.appendChild(th);
  }

  clearChildren(tfoot);
  tfoot.appendChild(tr);

  if (opts.footerCallback) {
    opts.footerCallback(tr as HTMLTableRowElement, buildContext(grid));
  }
}

/**
 * Snapshot the grid's view state for footer formatters and the table-level
 * callback. Arrays are *copies* — formatters that mutate them won't poison
 * the grid's internal state.
 */
export function buildContext<TRow extends Row = Row>(grid: Boostgrid<TRow>): FooterContext<TRow> {
  const rowsPerPage = grid.getRowCount();
  const currentRows = grid.currentRows.slice();
  const start = currentRows.length === 0 ? 0 : (grid.current - 1) * (rowsPerPage === -1 ? 0 : rowsPerPage) + 1;
  const end = currentRows.length === 0 ? 0 : start + currentRows.length - 1;
  const idCol = grid.identifier;
  const selectedIds = new Set(grid.getSelectedRows());
  const filteredRows = grid.getFilteredRows();
  const allRows = grid.getAllRows();
  const selectedRows = idCol
    ? allRows.filter((r) => selectedIds.has(r[idCol]))
    : [];
  return {
    currentRows,
    filteredRows,
    allRows,
    selectedRows,
    start,
    end,
    pageIndex: grid.current,
    totalPages: grid.totalPages || 1,
  };
}

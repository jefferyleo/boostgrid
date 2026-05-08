import type { Boostgrid } from "../core.js";
import type { Row } from "../types.js";

/**
 * Inclusive rectangle of (rowIndex, colIndex) pairs into `currentRows` and
 * the visible-columns list. Both axes are normalized so `start <= end`.
 */
export interface CellRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

/** Per-grid live state for cell selection. */
export interface CellSelectState {
  range: CellRange | null;
  anchorRow: number;
  anchorCol: number;
  isDragging: boolean;
}

const SELECTED_CLASS = "boostgrid-cell-selected";

/**
 * Mount the cell-selection listeners. Returns a cleanup fn that the
 * caller pushes into `grid.cleanupFns`.
 *
 * The listeners run on the wrapper container so they survive body
 * re-renders without needing to re-bind.
 */
export function mountCellSelection<TRow extends Row = Row>(grid: Boostgrid<TRow>): () => void {
  const root = grid.element.parentElement; // .boostgrid wrapper
  if (!root) return () => { /* nothing mounted */ };

  const state: CellSelectState = {
    range: null,
    anchorRow: 0,
    anchorCol: 0,
    isDragging: false,
  };
  // Attach state to the grid so renderBody (or any caller) can re-paint
  // the highlight after a render replaces the DOM nodes.
  (grid as unknown as { cellSelectState?: CellSelectState }).cellSelectState = state;

  const findCellCoords = (target: EventTarget | null): { row: number; col: number } | null => {
    const td = (target as Element | null)?.closest?.("td") as HTMLTableCellElement | null;
    if (!td) return null;
    const tr = td.parentElement as HTMLTableRowElement | null;
    if (!tr || !tr.parentElement) return null;
    if (tr.classList.contains("boostgrid-skeleton-row")) return null;
    if (tr.classList.contains("boostgrid-detail-row")) return null;
    if (tr.classList.contains("boostgrid-group-row")) return null;
    if (tr.classList.contains("boostgrid-group-footer")) return null;
    const tbody = tr.parentElement;
    // Row index = position among non-pseudo rows in the tbody.
    let row = -1;
    let i = 0;
    for (const child of Array.from(tbody.children)) {
      if (
        child.classList.contains("boostgrid-skeleton-row") ||
        child.classList.contains("boostgrid-detail-row") ||
        child.classList.contains("boostgrid-group-row") ||
        child.classList.contains("boostgrid-group-footer") ||
        child.classList.contains("boostgrid-pad")
      ) continue;
      if (child === tr) { row = i; break; }
      i++;
    }
    if (row === -1) return null;
    // Col index: count <td>'s with data-column-id up to this cell.
    let col = -1;
    let j = 0;
    for (const cell of Array.from(tr.children)) {
      if (!(cell as HTMLElement).hasAttribute("data-column-id")) continue;
      if (cell === td) { col = j; break; }
      j++;
    }
    if (col === -1) return null;
    return { row, col };
  };

  const onMouseDown = (ev: MouseEvent) => {
    if (ev.button !== 0) return; // only left-click
    const coords = findCellCoords(ev.target);
    if (!coords) return;
    state.anchorRow = coords.row;
    state.anchorCol = coords.col;
    state.range = {
      startRow: coords.row, endRow: coords.row,
      startCol: coords.col, endCol: coords.col,
    };
    state.isDragging = true;
    paint(grid, state.range);
    // Without preventDefault here, the browser's native text-selection
    // would fight the drag. preventDefault keeps the user inside our
    // rectangle gesture.
    ev.preventDefault();
  };

  const onMouseMove = (ev: MouseEvent) => {
    if (!state.isDragging) return;
    const coords = findCellCoords(ev.target);
    if (!coords) return;
    state.range = normalize(state.anchorRow, state.anchorCol, coords.row, coords.col);
    paint(grid, state.range);
  };

  const onMouseUp = () => {
    state.isDragging = false;
  };

  // Shift-click extends the existing range without tearing down the anchor.
  const onClick = (ev: MouseEvent) => {
    if (!ev.shiftKey || !state.range) return;
    const coords = findCellCoords(ev.target);
    if (!coords) return;
    state.range = normalize(state.anchorRow, state.anchorCol, coords.row, coords.col);
    paint(grid, state.range);
  };

  // Document-level copy + escape so the user doesn't have to focus a cell first.
  const onCopy = (ev: ClipboardEvent) => {
    if (!state.range) return;
    if (!root.contains(document.activeElement) && document.activeElement !== document.body) {
      // Only steal copy when the grid has focus context (user is inside it).
      return;
    }
    const tsv = rangeToTsv(grid, state.range);
    if (ev.clipboardData) {
      ev.clipboardData.setData("text/plain", tsv);
      ev.preventDefault();
    }
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    if (!state.range) return;
    state.range = null;
    paint(grid, null);
  };

  root.addEventListener("mousedown", onMouseDown);
  root.addEventListener("mousemove", onMouseMove);
  root.addEventListener("click", onClick);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("copy", onCopy);
  document.addEventListener("keydown", onKeyDown);

  return () => {
    root.removeEventListener("mousedown", onMouseDown);
    root.removeEventListener("mousemove", onMouseMove);
    root.removeEventListener("click", onClick);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("copy", onCopy);
    document.removeEventListener("keydown", onKeyDown);
    paint(grid, null);
    delete (grid as unknown as { cellSelectState?: CellSelectState }).cellSelectState;
  };
}

function normalize(ar: number, ac: number, fr: number, fc: number): CellRange {
  return {
    startRow: Math.min(ar, fr),
    endRow:   Math.max(ar, fr),
    startCol: Math.min(ac, fc),
    endCol:   Math.max(ac, fc),
  };
}

/** Walk the tbody and toggle the selected class on cells in the rectangle. */
export function paint<TRow extends Row>(grid: Boostgrid<TRow>, range: CellRange | null): void {
  const tbody = grid.element.querySelector("tbody");
  if (!tbody) return;
  // Clear previous painting first (cheap — class set is small).
  tbody.querySelectorAll(`.${SELECTED_CLASS}`).forEach((el) => el.classList.remove(SELECTED_CLASS));
  if (!range) return;
  // Real data rows are everything that ISN'T a pseudo-row. We can't
  // gate on `data-row-id` because tables without an identifier column
  // (cell-selection demos, anonymous tabular data) won't carry one.
  const dataRows = Array.from(tbody.children).filter((tr) => {
    return !tr.classList.contains("boostgrid-detail-row")
      && !tr.classList.contains("boostgrid-group-row")
      && !tr.classList.contains("boostgrid-group-footer")
      && !tr.classList.contains("boostgrid-skeleton-row")
      && !tr.classList.contains("boostgrid-pad");
  });
  for (let r = range.startRow; r <= range.endRow; r++) {
    const tr = dataRows[r];
    if (!tr) continue;
    const cells = Array.from(tr.children).filter((c) => (c as HTMLElement).hasAttribute("data-column-id"));
    for (let c = range.startCol; c <= range.endCol; c++) {
      const td = cells[c];
      if (td) td.classList.add(SELECTED_CLASS);
    }
  }
}

/** Build a tab-separated string for the rectangle. Uses the column's
 *  converter (no formatter HTML) — same convention as CSV export. */
export function rangeToTsv<TRow extends Row>(
  grid: Boostgrid<TRow>,
  range: CellRange,
): string {
  const visible = grid.columns.filter((c) => c.visible);
  const rows = grid.currentRows.slice(range.startRow, range.endRow + 1);
  const lines: string[] = [];
  for (const row of rows) {
    const cells: string[] = [];
    for (let c = range.startCol; c <= range.endCol; c++) {
      const col = visible[c];
      if (!col) continue;
      const v = (row as Record<string, unknown>)[col.id];
      // Strip tabs/newlines so the TSV stays one-row-per-line.
      const s = col.converter.to(v).replace(/[\t\r\n]+/g, " ");
      cells.push(s);
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

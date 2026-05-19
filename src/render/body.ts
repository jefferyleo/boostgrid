import type { Boostgrid } from "../core.js";
import type { Column, Row } from "../types.js";
import { $, clearChildren, el } from "../dom.js";
import { walkGroups, renderGroupHeader, renderGroupFooter } from "./group.js";
import { computeFrozenOffsets, type FrozenOffsets } from "./header.js";
import { buildTree, walkTree, resolveTreeColumnId, type TreeNode } from "./tree.js";
import { paint as paintCellSelection, type CellSelectState } from "./cell-select.js";

/** Per-row hierarchy hint passed from the tree walker to buildRow. */
interface TreeRowMeta<TRow extends Row> {
  node: TreeNode<TRow>;
  treeColumnId: string;
  indentPx: number;
  isExpanded: boolean;
}

/**
 * Cell-paint closure resolved once per column at the top of `renderBody`,
 * then invoked per-cell with no further branching. Replaces the inner
 * `col.formatter ? td.innerHTML = … : td.textContent = …` branch that
 * previously fired N rows × M cols times per render.
 *
 * Note: tree-mode caret cells have their own composition path inside
 * `buildRow` and don't go through this array.
 */
type CellPaint<TRow extends Row> = (td: HTMLTableCellElement, row: TRow) => void;

function makeCellPaint<TRow extends Row>(visibleCols: Column<TRow>[]): CellPaint<TRow>[] {
  return visibleCols.map((col) =>
    col.formatter
      ? (td: HTMLTableCellElement, row: TRow) => { td.innerHTML = col.formatter!(col, row); }
      : (td: HTMLTableCellElement, row: TRow) => { td.textContent = col.converter.to(row[col.id]); },
  );
}

const ALIGN: Record<string, string> = {
  left: "text-start",
  center: "text-center",
  right: "text-end",
};

/**
 * Renders the current page of rows. Uses a DocumentFragment so the
 * <tbody> sees a single mutation per render — much cheaper than per-row
 * appendChild and avoids parsing HTML strings.
 */
export function renderBody<TRow extends Row = Row>(grid: Boostgrid<TRow>): void {
  const tbody = $("tbody", grid.element) ?? grid.element.appendChild(document.createElement("tbody"));

  // Virtual scroll pad-only fast path: when the visible slice is unchanged
  // but the pad heights moved (e.g. ajax delivered more rows while the
  // user was scrolled at the top), mutate the pad <tr>s in place instead
  // of rebuilding the entire body. This MUST run before clearChildren so
  // the pad rows still exist in the DOM. Cell-selection range stays valid
  // because the data <tr>s keep their identity.
  if (grid.options.virtualScroll && grid.virtualWindow) {
    const win = grid.virtualWindow;
    const prev = grid.lastRenderedVirtualWindow;
    if (
      prev
      && prev.start === win.start
      && prev.end === win.end
      && (prev.padTop !== win.padTop || prev.padBottom !== win.padBottom)
      && tbody.children.length > 0
    ) {
      const first = tbody.firstElementChild as HTMLElement | null;
      const last = tbody.lastElementChild as HTMLElement | null;
      if (first?.classList.contains("boostgrid-pad")) first.style.height = `${win.padTop}px`;
      if (last && last !== first && last.classList.contains("boostgrid-pad")) {
        last.style.height = `${win.padBottom}px`;
      }
      grid.lastRenderedVirtualWindow = { ...win };
      return;
    }
  }
  const visibleCols = grid.columns.filter((c) => c.visible);
  const leadingCells = (grid.options.selection ? 1 : 0) + (grid.options.rowDetail ? 1 : 0);
  const colSpan = visibleCols.length + leadingCells;
  // Precompute frozen-side offsets once per render. Without this, every
  // cell in every row would re-walk the visible-columns array via
  // frozenLeftPx / frozenRightPx — quadratic in column count.
  const offsets = computeFrozenOffsets(grid, visibleCols);
  // Resolve the cell-paint closure once per column. The inner per-cell
  // loop in `buildRow` then calls paint[i](td, row) with zero branching.
  const paint = makeCellPaint(visibleCols);

  // Virtual scroll element pool — reuse <tr>s in place when the windowed
  // slice changes. Avoids the create+append+GC cost of rebuilding the
  // visible slice on every scroll tick. Only the flat windowed-list shape
  // goes through here; tree mode and groupBy take precedence as before
  // and continue to render via the fragment path below.
  if (
    grid.options.virtualScroll
    && grid.virtualWindow
    && grid.currentRows.length > 0
    && !grid.options.treeMode
    && !grid.options.groupBy
  ) {
    grid.commitActiveEdit?.();
    const win = grid.virtualWindow;
    const { topPad, bottomPad } = ensurePadRows(tbody, colSpan);
    // Collect existing pool rows; discard any tbody child that isn't a
    // pad and isn't a pool row (raw HTML rows on first mount, leftovers
    // from a prior tree/group render, "no results" row).
    const pool: HTMLTableRowElement[] = [];
    for (const child of Array.from(tbody.children)) {
      if (child === topPad || child === bottomPad) continue;
      if (child.classList.contains("boostgrid-pool-row")) {
        pool.push(child as HTMLTableRowElement);
      } else {
        child.remove();
      }
    }
    const needed = win.end - win.start;
    while (pool.length < needed) {
      const tr = bareRow(grid, visibleCols, offsets);
      tbody.insertBefore(tr, bottomPad);
      pool.push(tr);
    }
    while (pool.length > needed) {
      pool.pop()!.remove();
    }
    for (let i = 0; i < needed; i++) {
      rebindRow(grid, pool[i], grid.currentRows[win.start + i], visibleCols, paint);
    }
    topPad.style.height = `${win.padTop}px`;
    bottomPad.style.height = `${win.padBottom}px`;
    grid.lastRenderedVirtualWindow = { ...win };
    grid.rerenderSelectionState();
    const css = (grid as unknown as { cellSelectState?: CellSelectState }).cellSelectState;
    if (css?.range) paintCellSelection(grid, css.range);
    return;
  }

  clearChildren(tbody);

  if (grid.currentRows.length === 0) {
    const tr = el("tr");
    const td = el("td", { class: "boostgrid-no-results text-center text-muted py-4", colspan: String(colSpan) });
    td.textContent = grid.options.labels.noResults;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  // Tree mode: build the tree from the current slice (already filtered+sorted),
  // then DFS-render visible nodes with depth-driven indent + caret.
  if (grid.options.treeMode) {
    const treeColumnId = resolveTreeColumnId(grid);
    if (treeColumnId && grid.identifier) {
      const idField = grid.options.treeIdField ?? grid.identifier;
      const parentField = grid.options.treeParentField;
      const search = grid.getSearchPhrase();
      const re = search
        ? new RegExp(escapeRegExp(search), grid.options.caseSensitive ? "" : "i")
        : null;
      const matchFn = re
        ? (row: TRow) => {
            for (const col of visibleCols) {
              if (!col.searchable) continue;
              if (re.test(col.converter.to(row[col.id]))) return true;
            }
            return false;
          }
        : undefined;
      const tree = buildTree<TRow>({
        rows: grid.currentRows,
        idField,
        parentField,
        matchFn,
      });
      const flat = walkTree(grid, tree);
      const indent = grid.options.treeIndentPx;
      const frag = document.createDocumentFragment();
      for (const { node } of flat) {
        const meta: TreeRowMeta<TRow> = {
          node,
          treeColumnId,
          indentPx: indent,
          isExpanded: grid.isTreeExpanded(node.id),
        };
        frag.appendChild(buildRow(grid, node.row, visibleCols, offsets, paint, meta));
      }
      tbody.appendChild(frag);
      return;
    }
  }

  // Row grouping: bucket the slice by groupBy column(s), emitting nested
  // headers and optional aggregator footers per level. Collapsed branches
  // skip both their member rows AND their footers.
  if (grid.options.groupBy && !grid.options.treeMode) {
    const directives = walkGroups(grid, grid.currentRows);
    if (directives.length > 0) {
      const frag = document.createDocumentFragment();
      for (const d of directives) {
        if (d.type === "header") {
          frag.appendChild(renderGroupHeader(grid, d.ctx, colSpan, d.expanded));
        } else if (d.type === "row") {
          frag.appendChild(buildRow(grid, d.row, visibleCols, offsets, paint));
        } else {
          const footer = renderGroupFooter(grid, d.ctx, visibleCols);
          if (footer) frag.appendChild(footer);
        }
      }
      tbody.appendChild(frag);
      return;
    }
  }

  const frag = document.createDocumentFragment();
  for (const row of grid.currentRows) {
    frag.appendChild(buildRow(grid, row, visibleCols, offsets, paint));
    const detail = buildDetailRow(grid, row, visibleCols, colSpan);
    if (detail) frag.appendChild(detail);
  }
  tbody.appendChild(frag);
  // Re-apply any active cell-selection rectangle — the render replaced
  // every <td>, so the highlight class was wiped.
  const css = (grid as unknown as { cellSelectState?: CellSelectState }).cellSelectState;
  if (css?.range) paintCellSelection(grid, css.range);
}

/**
 * Build the detail-panel `<tr>` for a row when `rowDetail` is set and the
 * row is currently expanded. Returns `null` when the panel should not
 * render. The panel cell is colspan'd across all visible columns + the
 * leading affordance cells.
 */
function buildDetailRow<TRow extends Row>(
  grid: Boostgrid<TRow>,
  row: TRow,
  _visibleCols: Column<TRow>[],
  colSpan: number,
): HTMLTableRowElement | null {
  if (!grid.options.rowDetail || !grid.identifier) return null;
  const id = row[grid.identifier] as string | number;
  if (id == null) return null;
  if (!grid.isRowDetailExpanded(id)) return null;
  const content = grid.options.rowDetail(row);
  if (content == null) return null;
  const tr = el("tr", {
    class: "boostgrid-detail-row",
    "data-row-id": String(id),
  });
  const td = el("td", { colspan: String(colSpan), class: "boostgrid-detail-cell" });
  if (typeof content === "string") {
    td.innerHTML = content;
  } else {
    td.appendChild(content);
  }
  tr.appendChild(td);
  return tr;
}

function padRow(colSpan: number, height: number): HTMLTableRowElement {
  const tr = el("tr", { class: "boostgrid-pad", "aria-hidden": "true", style: `height: ${height}px;` });
  // Single colspan'd <td> so the row has no visible cells.
  tr.appendChild(el("td", { colspan: String(colSpan), style: "padding: 0; border: 0;" }));
  return tr;
}

/**
 * Render `count` shimmer-style placeholder rows into the grid's tbody —
 * one cell per visible column plus the leading affordance cells. Used
 * during ajax fetches so the user sees structure (not just a blank
 * "Loading...") while bytes are in flight. Cleared on the next
 * `renderBody()` call.
 */
export function renderSkeleton<TRow extends Row = Row>(
  grid: Boostgrid<TRow>,
  count: number,
): void {
  const tbody = $("tbody", grid.element) ?? grid.element.appendChild(document.createElement("tbody"));
  clearChildren(tbody);
  const visibleCols = grid.columns.filter((c) => c.visible);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const tr = el("tr", { class: "boostgrid-skeleton-row", "aria-hidden": "true" });
    if (grid.options.selection) tr.appendChild(el("td", { class: "bg-select-cell" }));
    if (grid.options.rowDetail) tr.appendChild(el("td", { class: "bg-detail-cell" }));
    for (const col of visibleCols) {
      const td = el("td", { "data-column-id": col.id });
      td.appendChild(el("span", { class: "boostgrid-skeleton-bar", "aria-hidden": "true" }));
      tr.appendChild(td);
    }
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

function buildRow<TRow extends Row>(
  grid: Boostgrid<TRow>,
  row: TRow,
  visibleCols: Column<TRow>[],
  offsets: FrozenOffsets,
  paint: CellPaint<TRow>[],
  treeMeta?: TreeRowMeta<TRow>,
): HTMLTableRowElement {
  const idCol = grid.identifier;
  const rowId = idCol ? String(row[idCol] ?? "") : "";
  const trAttrs: Record<string, string | null> = { "data-row-id": rowId || null };
  if (treeMeta) {
    trAttrs.class = `boostgrid-tree-row${treeMeta.isExpanded ? " boostgrid-tree-row--expanded" : ""}`;
    trAttrs["data-tree-depth"] = String(treeMeta.node.depth);
    if (grid.options.treeReparent && rowId) {
      trAttrs.draggable = "true";
    }
  }
  const tr = el("tr", trAttrs);

  const hasFrozen = visibleCols.some((c) => c.frozen === "left");
  if (grid.options.selection) {
    const cls = hasFrozen ? "bg-select-cell boostgrid-frozen" : "bg-select-cell";
    const td = el("td", { class: cls, style: hasFrozen ? "left: 0;" : null });
    const cb = el("input", {
      type: grid.options.multiSelect ? "checkbox" : "radio",
      class: "form-check-input bg-select-row",
      name: "bg-select",
    });
    td.appendChild(cb);
    tr.appendChild(td);
  }
  if (grid.options.rowDetail) {
    const cls = hasFrozen
      ? "bg-detail-cell boostgrid-frozen"
      : "bg-detail-cell";
    const left = grid.options.selection ? 40 : 0;
    const td = el("td", {
      class: cls,
      style: hasFrozen ? `left: ${left}px;` : null,
    });
    if (rowId) {
      const expanded = grid.isRowDetailExpanded(
        /^-?\d+(\.\d+)?$/.test(rowId) ? Number(rowId) : rowId,
      );
      const caret = el("span", {
        class: `boostgrid-detail-caret${expanded ? " boostgrid-detail-caret--open" : ""}`,
        "data-bg-action": "toggle-detail",
        "data-bg-value": rowId,
        role: "button",
        "aria-label": expanded ? grid.options.labels.hideDetails : grid.options.labels.showDetails,
      });
      const icon = el("i", {
        class: expanded ? "bi bi-chevron-down" : "bi bi-chevron-right",
        "aria-hidden": "true",
      });
      caret.appendChild(icon);
      td.appendChild(caret);
    }
    tr.appendChild(td);
  }

  let visibleIndex = 0;
  for (const col of visibleCols) {
    const classes = [
      ALIGN[col.align] ?? "",
      col.cssClass,
      col.frozen ? "boostgrid-frozen" : "",
    ].filter(Boolean).join(" ");
    const styleParts: string[] = [];
    if (col.frozen === "left") {
      styleParts.push(`left: ${offsets.left[visibleIndex]}px;`);
    } else if (col.frozen === "right") {
      styleParts.push(`right: ${offsets.right[visibleIndex]}px;`);
    }
    const isTreeCell = treeMeta && col.id === treeMeta.treeColumnId;
    if (isTreeCell) {
      const indent = treeMeta!.node.depth * treeMeta!.indentPx;
      // Use padding-left so the caret + content stay inside the cell box.
      styleParts.push(`padding-left: ${indent + 8}px;`);
    }
    const td = el("td", {
      class: classes,
      "data-column-id": col.id,
      "data-editable": col.editable ? "true" : null,
      "data-frozen-side": col.frozen ?? null,
      style: styleParts.length ? styleParts.join(" ") : null,
    });
    visibleIndex++;
    if (isTreeCell) {
      // Caret cell: clickable when the node has children, inert spacer otherwise.
      const node = treeMeta!.node;
      if (node.children.length > 0) {
        const caret = el("span", {
          class: `boostgrid-tree-caret${treeMeta!.isExpanded ? " boostgrid-tree-caret--open" : ""}`,
          "data-bg-action": "toggle-tree",
          "data-bg-value": String(node.id),
          role: "button",
          "aria-label": treeMeta!.isExpanded ? grid.options.labels.treeCollapse : grid.options.labels.treeExpand,
        });
        const icon = el("i", {
          class: treeMeta!.isExpanded ? "bi bi-caret-down-fill" : "bi bi-caret-right-fill",
          "aria-hidden": "true",
        });
        caret.appendChild(icon);
        td.appendChild(caret);
      } else {
        td.appendChild(el("span", { class: "boostgrid-tree-leaf", "aria-hidden": "true" }));
      }
      const content = el("span", { class: "boostgrid-tree-label" });
      if (col.formatter) content.innerHTML = col.formatter(col, row);
      else content.textContent = col.converter.to(row[col.id]);
      td.appendChild(content);
    } else {
      // Pre-resolved paint closure — no per-cell branching. visibleIndex
      // was incremented above; the array is 0-indexed so we use -1.
      paint[visibleIndex - 1](td, row);
    }
    tr.appendChild(td);
  }
  return tr;
}

/**
 * Build an empty <tr> with all structural cells in place but no row data
 * bound — used by the virtual-scroll pool path. Leading select / detail
 * cells are added when those features are on; cells start in default
 * (unselected / collapsed) state and get rebound per row by `rebindRow`.
 * Frozen offsets and column-derived classes/attributes are written once
 * here and never touched again — they're row-invariant.
 */
function bareRow<TRow extends Row>(
  grid: Boostgrid<TRow>,
  visibleCols: Column<TRow>[],
  offsets: FrozenOffsets,
): HTMLTableRowElement {
  // Marker class — pool-path-only. Lets the pool tell apart its own
  // recyclable <tr>s from any pre-existing rows in <tbody> (raw HTML,
  // "no results" row, leftovers from a prior tree/group render).
  const tr = el("tr", { class: "boostgrid-pool-row" });
  const hasFrozen = visibleCols.some((c) => c.frozen === "left");
  if (grid.options.selection) {
    const cls = hasFrozen ? "bg-select-cell boostgrid-frozen" : "bg-select-cell";
    const td = el("td", { class: cls, style: hasFrozen ? "left: 0;" : null });
    const cb = el("input", {
      type: grid.options.multiSelect ? "checkbox" : "radio",
      class: "form-check-input bg-select-row",
      name: "bg-select",
    });
    td.appendChild(cb);
    tr.appendChild(td);
  }
  if (grid.options.rowDetail) {
    const cls = hasFrozen ? "bg-detail-cell boostgrid-frozen" : "bg-detail-cell";
    const left = grid.options.selection ? 40 : 0;
    const td = el("td", {
      class: cls,
      style: hasFrozen ? `left: ${left}px;` : null,
    });
    const caret = el("span", {
      class: "boostgrid-detail-caret",
      "data-bg-action": "toggle-detail",
      role: "button",
    });
    const icon = el("i", { class: "bi bi-chevron-right", "aria-hidden": "true" });
    caret.appendChild(icon);
    td.appendChild(caret);
    tr.appendChild(td);
  }
  let visibleIndex = 0;
  for (const col of visibleCols) {
    const classes = [
      ALIGN[col.align] ?? "",
      col.cssClass,
      col.frozen ? "boostgrid-frozen" : "",
    ].filter(Boolean).join(" ");
    const styleParts: string[] = [];
    if (col.frozen === "left") styleParts.push(`left: ${offsets.left[visibleIndex]}px;`);
    else if (col.frozen === "right") styleParts.push(`right: ${offsets.right[visibleIndex]}px;`);
    const td = el("td", {
      class: classes,
      "data-column-id": col.id,
      "data-editable": col.editable ? "true" : null,
      "data-frozen-side": col.frozen ?? null,
      style: styleParts.length ? styleParts.join(" ") : null,
    });
    tr.appendChild(td);
    visibleIndex++;
  }
  return tr;
}

/**
 * Rebind a pooled <tr> to a new row payload. Updates data-row-id, the
 * leading detail-caret expanded state (selection checkbox state is
 * applied later by `refreshSelectionVisuals`), and writes new content
 * into each data cell via the pre-resolved paint closures.
 */
function rebindRow<TRow extends Row>(
  grid: Boostgrid<TRow>,
  tr: HTMLTableRowElement,
  row: TRow,
  visibleCols: Column<TRow>[],
  paint: CellPaint<TRow>[],
): void {
  const idCol = grid.identifier;
  const rowId = idCol ? String(row[idCol] ?? "") : "";
  if (rowId) tr.dataset.rowId = rowId;
  else delete tr.dataset.rowId;
  let cellOffset = 0;
  if (grid.options.selection) cellOffset++;
  if (grid.options.rowDetail) {
    const caret = tr.children[cellOffset]?.querySelector<HTMLElement>(".boostgrid-detail-caret");
    if (caret) {
      const idValue = /^-?\d+(\.\d+)?$/.test(rowId) ? Number(rowId) : rowId;
      const expanded = !!rowId && grid.isRowDetailExpanded(idValue);
      caret.className = `boostgrid-detail-caret${expanded ? " boostgrid-detail-caret--open" : ""}`;
      if (rowId) caret.setAttribute("data-bg-value", rowId);
      else caret.removeAttribute("data-bg-value");
      caret.setAttribute(
        "aria-label",
        expanded ? grid.options.labels.hideDetails : grid.options.labels.showDetails,
      );
      const icon = caret.querySelector("i");
      if (icon) icon.className = expanded ? "bi bi-chevron-down" : "bi bi-chevron-right";
    }
    cellOffset++;
  }
  for (let i = 0; i < visibleCols.length; i++) {
    const td = tr.children[cellOffset + i] as HTMLTableCellElement | undefined;
    if (td) paint[i](td, row);
  }
}

/**
 * Ensure the tbody has a top and bottom pad row, creating either if
 * missing. Used by the virtual-scroll pool path so recycled data <tr>s
 * can be inserted between them without worrying about first-render
 * state.
 */
function ensurePadRows(tbody: HTMLElement, colSpan: number): {
  topPad: HTMLTableRowElement;
  bottomPad: HTMLTableRowElement;
} {
  let topPad = tbody.firstElementChild as HTMLTableRowElement | null;
  if (!topPad || !topPad.classList.contains("boostgrid-pad")) {
    topPad = padRow(colSpan, 0);
    tbody.insertBefore(topPad, tbody.firstChild);
  }
  let bottomPad = tbody.lastElementChild as HTMLTableRowElement | null;
  if (!bottomPad || !bottomPad.classList.contains("boostgrid-pad") || bottomPad === topPad) {
    bottomPad = padRow(colSpan, 0);
    tbody.appendChild(bottomPad);
  }
  return { topPad, bottomPad };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

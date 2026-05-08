import type { Boostgrid } from "../core.js";
import type { Row } from "../types.js";
import { $, clearChildren, el } from "../dom.js";

const ALIGN: Record<string, string> = {
  left: "text-start",
  center: "text-center",
  right: "text-end",
};

/** px width assumed when a frozen column has no explicit `width`. */
const DEFAULT_FROZEN_WIDTH_PX = 120;

/** Width of the selection cell in px (matches `width: 2.5rem;` at the BS5 16px root). */
const SELECTION_WIDTH_PX = 40;

/** Width of the row-detail chevron cell in px (matches `width: 2.5rem;`). */
const DETAIL_WIDTH_PX = 40;

/**
 * Try to interpret a column's `width` as a pixel value for sticky-left math.
 * Accepts "120", "120px", or null/falsy. Anything else (em/%, rem, etc.)
 * is reported as null so callers can fall back to a default.
 */
export function widthAsPx(width: string | null): number | null {
  if (!width) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(width);
  return m ? Number(m[1]) : null;
}

/**
 * Cumulative left offset (px) for sticky positioning of the *next* frozen
 * column. Walks visible columns in order, summing widths for each
 * frozen-prefix column up to but not including the target index. Adds the
 * leading selection cell's width when selection is on.
 */
export function frozenLeftPx<TRow extends Row>(grid: Boostgrid<TRow>, targetIndex: number): number {
  let sum = grid.options.selection ? SELECTION_WIDTH_PX : 0;
  if (grid.options.rowDetail) sum += DETAIL_WIDTH_PX;
  let i = 0;
  for (const col of grid.columns) {
    if (!col.visible) continue;
    if (i >= targetIndex) break;
    if (col.frozen === "left") {
      sum += widthAsPx(col.width) ?? DEFAULT_FROZEN_WIDTH_PX;
    }
    i++;
  }
  return sum;
}

/**
 * Cumulative right offset (px) for sticky positioning. Mirrors
 * {@link frozenLeftPx} but walks visible columns from the right, summing
 * widths of right-frozen columns trailing the target. The target itself
 * contributes 0; only columns *after* it (closer to the right edge) count.
 */
export function frozenRightPx<TRow extends Row>(grid: Boostgrid<TRow>, targetIndex: number): number {
  let sum = 0;
  const visible = grid.columns.filter((c) => c.visible);
  for (let i = visible.length - 1; i > targetIndex; i--) {
    const col = visible[i];
    if (col.frozen === "right") {
      sum += widthAsPx(col.width) ?? DEFAULT_FROZEN_WIDTH_PX;
    }
  }
  return sum;
}

export function renderHeader<TRow extends Row = Row>(grid: Boostgrid<TRow>): void {
  const thead = $("thead", grid.element) ?? grid.element.appendChild(document.createElement("thead"));
  clearChildren(thead);
  const tr = el("tr");

  const hasFrozen = grid.columns.some((c) => c.visible && c.frozen === "left");
  if (grid.options.selection) {
    const selectCellClasses = ["bg-select-cell"];
    if (hasFrozen) selectCellClasses.push("boostgrid-frozen");
    const th = el("th", { class: selectCellClasses.join(" "), style: "width: 2.5rem; left: 0;" });
    if (grid.options.multiSelect) {
      const cb = el("input", { type: "checkbox", class: "form-check-input bg-select-all" });
      th.appendChild(cb);
    }
    tr.appendChild(th);
  }
  if (grid.options.rowDetail) {
    const detailClasses = ["bg-detail-cell"];
    if (hasFrozen) detailClasses.push("boostgrid-frozen");
    const left = grid.options.selection ? SELECTION_WIDTH_PX : 0;
    const th = el("th", {
      class: detailClasses.join(" "),
      style: `width: 2.5rem;${hasFrozen ? ` left: ${left}px;` : ""}`,
      "aria-label": grid.options.labels.rowDetailsHeader,
    });
    tr.appendChild(th);
  }

  let visibleIndex = 0;
  for (const col of grid.columns) {
    if (!col.visible) continue;
    const classes = [
      "boostgrid-th",
      ALIGN[col.headerAlign] ?? "",
      col.headerCssClass,
      col.frozen ? "boostgrid-frozen" : "",
    ].filter(Boolean).join(" ");
    const styleParts: string[] = [];
    if (col.width) styleParts.push(`width: ${col.width};`);
    if (col.frozen === "left") {
      styleParts.push(`left: ${frozenLeftPx(grid, visibleIndex)}px;`);
    } else if (col.frozen === "right") {
      styleParts.push(`right: ${frozenRightPx(grid, visibleIndex)}px;`);
    }
    const th = el("th", {
      class: classes,
      "data-column-id": col.id,
      "data-frozen-side": col.frozen ?? null,
      style: styleParts.length ? styleParts.join(" ") : null,
    });
    visibleIndex++;
    if (col.sortable) {
      const link = el("a", {
        href: "javascript:void(0);",
        class: "boostgrid-sort",
        "data-bg-action": "sort",
        "data-bg-value": col.id,
      });
      link.appendChild(document.createTextNode(col.text));
      const order = grid.sortDictionary[col.id];
      const iconCls =
        order === "asc" ? grid.options.icons.sortAsc :
        order === "desc" ? grid.options.icons.sortDesc :
        grid.options.icons.sortNone;
      const icon = el("i", { class: `${iconCls} ms-1`, "aria-hidden": "true" });
      link.appendChild(icon);
      th.appendChild(link);
    } else {
      th.appendChild(document.createTextNode(col.text));
    }
    if (grid.options.columnReorder && col.reorderable) {
      th.setAttribute("draggable", "true");
      th.classList.add("boostgrid-th--draggable");
    }
    if (grid.options.columnResize && col.resizable) {
      const grip = el("span", {
        class: "boostgrid-resize-grip",
        "data-bg-grip": col.id,
        role: "separator",
        "aria-orientation": "vertical",
        "aria-label": grid.options.labels.resizeColumn.replace("{column}", col.text || col.id),
      });
      th.appendChild(grip);
    }
    tr.appendChild(th);
  }
  thead.appendChild(tr);
}

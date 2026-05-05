import type { Boostgrid } from "../core.js";
import type { Column, Row } from "../types.js";
import { $, clearChildren, el } from "../dom.js";

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
export function renderBody(grid: Boostgrid): void {
  const tbody = $("tbody", grid.element) ?? grid.element.appendChild(document.createElement("tbody"));
  clearChildren(tbody);

  const visibleCols = grid.columns.filter((c) => c.visible);
  const colSpan = visibleCols.length + (grid.options.selection ? 1 : 0);

  if (grid.currentRows.length === 0) {
    const tr = el("tr");
    const td = el("td", { class: "boostgrid-no-results text-center text-muted py-4", colspan: String(colSpan) });
    td.textContent = grid.options.labels.noResults;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const row of grid.currentRows) {
    frag.appendChild(buildRow(grid, row, visibleCols));
  }
  tbody.appendChild(frag);
}

function buildRow(grid: Boostgrid, row: Row, visibleCols: Column[]): HTMLTableRowElement {
  const idCol = grid.identifier;
  const rowId = idCol ? String(row[idCol] ?? "") : "";
  const tr = el("tr", { "data-row-id": rowId || null });

  if (grid.options.selection) {
    const td = el("td", { class: "bg-select-cell" });
    const cb = el("input", {
      type: grid.options.multiSelect ? "checkbox" : "radio",
      class: "form-check-input bg-select-row",
      name: "bg-select",
    });
    td.appendChild(cb);
    tr.appendChild(td);
  }

  for (const col of visibleCols) {
    const classes = [ALIGN[col.align] ?? "", col.cssClass].filter(Boolean).join(" ");
    const td = el("td", { class: classes });
    if (col.formatter) {
      // formatter returns HTML — trust the developer-provided fn
      td.innerHTML = col.formatter(col, row);
    } else {
      td.textContent = col.converter.to(row[col.id]);
    }
    tr.appendChild(td);
  }
  return tr;
}

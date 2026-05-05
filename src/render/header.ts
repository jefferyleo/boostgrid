import type { Boostgrid } from "../core.js";
import { $, clearChildren, el } from "../dom.js";

const ALIGN: Record<string, string> = {
  left: "text-start",
  center: "text-center",
  right: "text-end",
};

export function renderHeader(grid: Boostgrid): void {
  const thead = $("thead", grid.element) ?? grid.element.appendChild(document.createElement("thead"));
  clearChildren(thead);
  const tr = el("tr");

  if (grid.options.selection) {
    const th = el("th", { class: "bg-select-cell", style: "width: 2.5rem;" });
    if (grid.options.multiSelect) {
      const cb = el("input", { type: "checkbox", class: "form-check-input bg-select-all" });
      th.appendChild(cb);
    }
    tr.appendChild(th);
  }

  for (const col of grid.columns) {
    if (!col.visible) continue;
    const classes = [
      "boostgrid-th",
      ALIGN[col.headerAlign] ?? "",
      col.headerCssClass,
    ].filter(Boolean).join(" ");
    const th = el("th", {
      class: classes,
      "data-column-id": col.id,
      style: col.width ? `width: ${col.width};` : null,
    });
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
    tr.appendChild(th);
  }
  thead.appendChild(tr);
}

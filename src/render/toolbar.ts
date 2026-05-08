import type { Boostgrid } from "../core.js";
import type { Row } from "../types.js";
import { el } from "../dom.js";

/**
 * Toolbar shell: search input, row-count dropdown, column-toggle dropdown,
 * pagination + info row. Mounted above and/or below the table according
 * to options.navigation.
 */
export function renderToolbar<TRow extends Row = Row>(grid: Boostgrid<TRow>, position: "top" | "bottom"): HTMLDivElement {
  const bar = el("div", { class: `boostgrid-toolbar boostgrid-toolbar-${position} d-flex flex-wrap align-items-center gap-2 my-2` });

  // top toolbar gets controls; bottom only gets pagination + info
  if (position === "top") {
    bar.appendChild(buildSearch(grid));
    bar.appendChild(buildRowCountDropdown(grid));
    if (grid.options.columnSelection) bar.appendChild(buildColumnDropdown(grid));
    bar.appendChild(el("button", {
      type: "button",
      class: "btn btn-outline-secondary btn-sm",
      "data-bg-action": "refresh",
      title: grid.options.labels.refresh,
    }, iconEl(grid.options.icons.refresh)));
  }

  // info + pagination shared
  const tail = el("div", { class: "ms-auto d-flex align-items-center gap-3" });
  tail.appendChild(el("div", { class: "bg-infos small text-muted" }));
  tail.appendChild(el("nav", { class: "bg-pagination", "aria-label": "pagination" }));
  bar.appendChild(tail);

  return bar;
}

function buildSearch<TRow extends Row>(grid: Boostgrid<TRow>): HTMLElement {
  const wrap = el("div", { class: "bg-search input-group input-group-sm", style: "width: 16rem;" });
  wrap.appendChild(el("span", { class: "input-group-text" }, iconEl(grid.options.icons.search)));
  wrap.appendChild(el("input", {
    type: "search",
    class: "form-control",
    placeholder: grid.options.labels.search,
    "aria-label": grid.options.labels.search,
  }));
  return wrap;
}

function buildRowCountDropdown<TRow extends Row>(grid: Boostgrid<TRow>): HTMLElement {
  const counts = Array.isArray(grid.options.rowCount) ? grid.options.rowCount : [grid.options.rowCount];
  const wrap = el("div", { class: "dropdown" });
  const btn = el("button", {
    class: "btn btn-outline-secondary btn-sm dropdown-toggle",
    type: "button",
    "data-bs-toggle": "dropdown",
    "aria-expanded": "false",
  });
  btn.textContent = String(grid.getRowCount() === -1 ? grid.options.labels.all : grid.getRowCount());
  wrap.appendChild(btn);
  const ul = el("ul", { class: "dropdown-menu" });
  for (const c of counts) {
    const li = el("li");
    const a = el("a", {
      class: "dropdown-item",
      href: "javascript:void(0);",
      "data-bg-action": "rows-per-page",
      "data-bg-value": String(c),
    });
    a.textContent = c === -1 ? grid.options.labels.all : String(c);
    li.appendChild(a);
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  return wrap;
}

function buildColumnDropdown<TRow extends Row>(grid: Boostgrid<TRow>): HTMLElement {
  const wrap = el("div", { class: "dropdown boostgrid-columns-panel" });
  const btn = el("button", {
    class: "btn btn-outline-secondary btn-sm dropdown-toggle",
    type: "button",
    "data-bs-toggle": "dropdown",
    "data-bs-auto-close": "outside",
    "aria-expanded": "false",
    title: grid.options.labels.columns,
  }, iconEl(grid.options.icons.columns));
  wrap.appendChild(btn);
  const menu = el("div", {
    class: "dropdown-menu dropdown-menu-end p-2 boostgrid-columns-menu",
    style: "min-width: 16rem;",
  });

  // Search input — filters the list locally via a delegated input handler
  // (data-bg-action="filter-columns") that toggles a hidden class per item.
  const search = el("input", {
    type: "search",
    class: "form-control form-control-sm mb-2",
    placeholder: grid.options.labels.searchColumns,
    "data-bg-action": "filter-columns",
    "aria-label": grid.options.labels.searchColumns,
  });
  menu.appendChild(search);

  const list = el("div", { class: "boostgrid-columns-list" });
  for (const col of grid.columns) {
    const item = el("div", {
      class: "boostgrid-columns-item d-flex align-items-center gap-2 px-1 py-1",
      "data-column-id": col.id,
      draggable: grid.options.columnReorder && col.reorderable ? "true" : null,
    });
    if (grid.options.columnReorder && col.reorderable) {
      const handle = el("span", {
        class: "boostgrid-columns-handle text-muted",
        "aria-hidden": "true",
        title: grid.options.labels.dragToReorder,
      });
      handle.appendChild(el("i", { class: "bi bi-grip-vertical" }));
      item.appendChild(handle);
    }
    const cb = el("input", {
      type: "checkbox",
      class: "form-check-input m-0",
      "data-bg-action": "toggle-column",
      "data-bg-value": col.id,
      id: `bg-col-${col.id}`,
    });
    if (col.visible) cb.setAttribute("checked", "");
    item.appendChild(cb);
    const label = el("label", {
      class: "form-check-label flex-grow-1",
      for: `bg-col-${col.id}`,
    });
    label.textContent = col.text || col.id;
    item.appendChild(label);
    list.appendChild(item);
  }
  menu.appendChild(list);

  menu.appendChild(el("div", { class: "dropdown-divider" }));
  const reset = el("button", {
    type: "button",
    class: "btn btn-link btn-sm p-0 px-1",
    "data-bg-action": "reset-columns",
  });
  reset.textContent = grid.options.labels.resetColumns;
  menu.appendChild(reset);

  wrap.appendChild(menu);
  return wrap;
}

function iconEl(cls: string): HTMLElement {
  return el("i", { class: cls, "aria-hidden": "true" });
}

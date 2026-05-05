import type { Boostgrid } from "../core.js";
import { el } from "../dom.js";

/**
 * Toolbar shell: search input, row-count dropdown, column-toggle dropdown,
 * pagination + info row. Mounted above and/or below the table according
 * to options.navigation.
 */
export function renderToolbar(grid: Boostgrid, position: "top" | "bottom"): HTMLDivElement {
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

function buildSearch(grid: Boostgrid): HTMLElement {
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

function buildRowCountDropdown(grid: Boostgrid): HTMLElement {
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

function buildColumnDropdown(grid: Boostgrid): HTMLElement {
  const wrap = el("div", { class: "dropdown" });
  const btn = el("button", {
    class: "btn btn-outline-secondary btn-sm dropdown-toggle",
    type: "button",
    "data-bs-toggle": "dropdown",
    "aria-expanded": "false",
  }, iconEl(grid.options.icons.columns));
  wrap.appendChild(btn);
  const ul = el("ul", { class: "dropdown-menu dropdown-menu-end" });
  for (const col of grid.columns) {
    const li = el("li");
    const label = el("label", { class: "dropdown-item d-flex align-items-center gap-2" });
    const cb = el("input", {
      type: "checkbox",
      class: "form-check-input m-0",
      "data-bg-action": "toggle-column",
      "data-bg-value": col.id,
    });
    if (col.visible) cb.setAttribute("checked", "");
    label.appendChild(cb);
    label.appendChild(document.createTextNode(col.text));
    li.appendChild(label);
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  return wrap;
}

function iconEl(cls: string): HTMLElement {
  return el("i", { class: cls, "aria-hidden": "true" });
}

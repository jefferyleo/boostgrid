import type { Boostgrid } from "../core.js";
import type { Row } from "../types.js";
import { $, clearChildren, el } from "../dom.js";

export function renderPagination<TRow extends Row = Row>(bar: HTMLElement, grid: Boostgrid<TRow>): void {
  const slot = $(".bg-pagination", bar);
  if (!slot) return;
  clearChildren(slot);
  if (grid.totalPages <= 1) return;

  const ul = el("ul", { class: "pagination pagination-sm m-0" });
  ul.appendChild(pageItem("«", grid.current === 1, grid.current === 1, "1"));
  ul.appendChild(pageItem("‹", grid.current === 1, grid.current === 1, String(grid.current - 1)));

  const padding = grid.options.padding;
  const start = Math.max(1, grid.current - padding);
  const end = Math.min(grid.totalPages, grid.current + padding);
  for (let i = start; i <= end; i++) {
    ul.appendChild(pageItem(String(i), false, i === grid.current, String(i)));
  }
  ul.appendChild(pageItem("›", grid.current === grid.totalPages, grid.current === grid.totalPages, String(grid.current + 1)));
  ul.appendChild(pageItem("»", grid.current === grid.totalPages, grid.current === grid.totalPages, String(grid.totalPages)));
  slot.appendChild(ul);
}

function pageItem(label: string, disabled: boolean, active: boolean, value: string): HTMLLIElement {
  const li = el("li", { class: `page-item ${disabled ? "disabled" : ""} ${active ? "active" : ""}` });
  const a = el("a", {
    class: "page-link",
    href: "javascript:void(0);",
    "data-bg-action": "page",
    "data-bg-value": value,
  });
  a.textContent = label;
  li.appendChild(a);
  return li;
}

export function renderInfos<TRow extends Row = Row>(bar: HTMLElement, grid: Boostgrid<TRow>): void {
  const slot = $(".bg-infos", bar);
  if (!slot) return;
  const start = grid.total === 0 ? 0 : (grid.current - 1) * Math.max(0, grid.getRowCount()) + 1;
  const end = grid.getRowCount() === -1 ? grid.total : Math.min(grid.total, start + grid.getRowCount() - 1);
  // Locale-aware digit grouping: `Intl.NumberFormat` gives us thousands
  // separators (or whatever the locale uses) for free.
  const fmt = numberFormatter(grid.options.locale);
  slot.textContent = grid.options.labels.infos
    .replace("{start}", fmt.format(start))
    .replace("{end}", fmt.format(end))
    .replace("{total}", fmt.format(grid.total));
}

/** Cached `Intl.NumberFormat` keyed by locale — building one is hundreds of
 *  microseconds, so we don't want a fresh instance on every render. */
const numberFormatterCache = new Map<string, Intl.NumberFormat>();
function numberFormatter(locale: string | null): Intl.NumberFormat {
  const key = locale ?? "";
  let f = numberFormatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale ?? undefined);
    numberFormatterCache.set(key, f);
  }
  return f;
}

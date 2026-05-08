import type { Boostgrid } from "../core.js";
import type { Row } from "../types.js";

/**
 * Virtual scroll — windows the visible row slice based on scroll position.
 *
 * Strategy: classic windowing with two pad <tr>s above and below the rendered
 * slice. The <tbody> becomes the y-scroll viewport; on every scroll we
 * recompute `[firstVisible, lastVisible]` from `scrollTop / rowHeight`,
 * widen by `overscan` on each side, and re-call renderBody. A
 * `requestAnimationFrame` coalescer prevents thrash during fast scrolls.
 *
 * Lifecycle hooks live on the grid via private-but-public fields
 * (`virtualWindow` and the slice helpers below) so renderBody can read the
 * current window without circular-imports.
 */

export interface VirtualWindow {
  /** Row index of the first rendered row (inclusive). */
  start: number;
  /** Row index of the last rendered row (exclusive). */
  end: number;
  /** Pre-pad height in px (start * rowHeight). */
  padTop: number;
  /** Post-pad height in px ((total - end) * rowHeight). */
  padBottom: number;
}

export function mountVirtualScroll<TRow extends Row = Row>(grid: Boostgrid<TRow>): () => void {
  const opts = grid.options;
  if (!opts.virtualScroll) return () => { /* noop */ };

  // The wrapper gets the marker class so SCSS can apply tbody { display: block; height: ... }
  const wrapper = grid.element.parentElement;
  wrapper?.classList.add("boostgrid--virtual");

  let frame = 0;

  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refreshVirtualWindow(grid);
      grid.rerenderBody();
    });
  };

  // The scroll listener attaches to <tbody> if it exists yet; otherwise it
  // re-binds in refreshVirtualWindow once renderBody has created one. We
  // track the bound element so we can unbind cleanly on destroy.
  let boundTo: HTMLElement | null = null;
  const ensureBound = () => {
    const t = grid.element.querySelector<HTMLTableSectionElement>(":scope > tbody");
    if (t && t !== boundTo) {
      if (boundTo) boundTo.removeEventListener("scroll", onScroll);
      boundTo = t;
      t.addEventListener("scroll", onScroll, { passive: true });
    }
  };
  // Cache the binder so refreshVirtualWindow can call it lazily.
  grid.ensureVirtualBinding = ensureBound;
  ensureBound();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    if (boundTo) boundTo.removeEventListener("scroll", onScroll);
    wrapper?.classList.remove("boostgrid--virtual");
    grid.virtualWindow = null;
    grid.ensureVirtualBinding = null;
  };
}

/**
 * Recompute the window from the current tbody scrollTop. Safe to call any
 * time the underlying dataset (filtered) changes — e.g. after sort/search.
 * Falls back to a sensible default viewport when the tbody hasn't been
 * laid out yet (initial mount, jsdom, hidden parents).
 */
export function refreshVirtualWindow<TRow extends Row = Row>(grid: Boostgrid<TRow>): void {
  const opts = grid.options;
  if (!opts.virtualScroll) return;
  const tbody = grid.element.querySelector<HTMLTableSectionElement>(":scope > tbody");
  const defaultViewport = 480;
  const scrollTop = tbody?.scrollTop ?? 0;
  const viewportH = tbody?.clientHeight || defaultViewport;
  const visible = Math.max(1, Math.ceil(viewportH / opts.rowHeight));
  const firstVisible = Math.floor(scrollTop / opts.rowHeight);
  recomputeWindow(grid, firstVisible, visible);
}

/**
 * Compute the windowed slice for the given first-visible-row index. Mutates
 * `grid.virtualWindow` so the next renderBody pass picks it up. The window
 * always covers the visible viewport plus `overscan` on each side, clamped
 * to the dataset.
 */
export function recomputeWindow<TRow extends Row = Row>(
  grid: Boostgrid<TRow>,
  firstVisible: number,
  visibleCount: number,
): void {
  const opts = grid.options;
  const total = grid.getFilteredRows().length || grid.getCurrentRows().length;
  const overscan = Math.max(0, opts.overscan);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(total, firstVisible + visibleCount + overscan);
  const rowHeight = opts.rowHeight;
  grid.virtualWindow = {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: Math.max(0, (total - end) * rowHeight),
  };
}

import type { Boostgrid } from "../core.js";
import type { Column, GroupBy, GroupContext, Row } from "../types.js";
import { el } from "../dom.js";

const ALIGN: Record<string, string> = {
  left: "text-start",
  center: "text-center",
  right: "text-end",
};

/** Path separator used to flatten group paths into stable Set keys. */
export const GROUP_PATH_SEP = "//";

/** Stringify a single group key consistently — primitives compare by string. */
export function groupKeyToken(key: unknown): string {
  return String(key == null ? "" : key);
}

/** Convert a path of raw keys to its canonical string form. */
export function groupPathToString(path: readonly unknown[]): string {
  return path.map(groupKeyToken).join(GROUP_PATH_SEP);
}

/** Normalize the `groupBy` option to a deduped, non-empty string array.
 *  Returns `null` when grouping is disabled. */
export function normalizeGroupBy(g: GroupBy): readonly string[] | null {
  if (g == null) return null;
  const arr = typeof g === "string" ? [g] : g;
  if (arr.length === 0) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of arr) {
    if (!seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out;
}

/** Aggregator key resolution. `colId@N` wins over the bare `colId` at depth N. */
export function resolveAggregator<TRow extends Row>(
  map: Record<string, (col: Column<TRow>, ctx: GroupContext<TRow>) => string>,
  colId: string,
  depth: number,
): ((col: Column<TRow>, ctx: GroupContext<TRow>) => string) | undefined {
  return map[`${colId}@${depth}`] ?? map[colId];
}

/**
 * Render directive emitted by {@link walkGroups}. body.ts iterates the
 * flat list and emits matching `<tr>`s. Keeping this flat (instead of a
 * nested tree) makes the body renderer a simple loop and lets us emit
 * footer rows AFTER child rows without re-walking.
 */
export type GroupDirective<TRow extends Row = Row> =
  | { type: "header"; ctx: GroupContext<TRow>; expanded: boolean }
  | { type: "row"; row: TRow }
  | { type: "footer"; ctx: GroupContext<TRow> };

interface WalkOpts {
  groupBy: readonly string[];
  isCollapsed: (path: readonly unknown[]) => boolean;
}

/**
 * Walk the slice and produce a flat list of render directives. Sorting is
 * upstream (see `applySort` in core), so adjacency-based bucketing produces
 * correct groups in O(n) per level. Total work is O(n × levels).
 *
 * The walker stops descending into a collapsed branch — its rows simply
 * don't appear in the output. The branch's footer row is also skipped so
 * collapsed groups read cleanly.
 */
export function walkGroups<TRow extends Row = Row>(
  grid: Boostgrid<TRow>,
  slice: TRow[],
): GroupDirective<TRow>[] {
  const groupBy = normalizeGroupBy(grid.options.groupBy);
  if (!groupBy) return [];
  const out: GroupDirective<TRow>[] = [];
  const opts: WalkOpts = {
    groupBy,
    // Delegate to grid.isGroupExpanded so `groupExpanded: "none"` and
    // per-path overrides in `groupExpanded: Record<…>` are honored without
    // re-encoding that logic here.
    isCollapsed: (path) => !grid.isGroupExpanded(groupPathToString(path)),
  };
  walkLevel(grid, slice, [], 0, opts, out);
  return out;
}

function walkLevel<TRow extends Row>(
  grid: Boostgrid<TRow>,
  rows: TRow[],
  parentPath: readonly unknown[],
  depth: number,
  opts: WalkOpts,
  out: GroupDirective<TRow>[],
): void {
  const colId = opts.groupBy[depth];
  const column = grid.columns.find((c) => c.id === colId);
  if (!column) {
    // Unknown column at this depth — emit raw rows so the slice is still rendered.
    for (const row of rows) out.push({ type: "row", row });
    return;
  }
  // Adjacency-based bucketing within this level (sort upstream).
  let bucketKey: unknown = Symbol("init");
  let bucket: TRow[] = [];
  let siblingIndex = 0;
  const flush = () => {
    if (bucket.length === 0) return;
    const path = [...parentPath, bucketKey];
    const ctx: GroupContext<TRow> = {
      groupKey: bucketKey,
      groupLabel: column.converter.to(bucketKey),
      groupPath: path,
      depth,
      rows: bucket,
      index: siblingIndex++,
    };
    const collapsed = opts.isCollapsed(path);
    out.push({ type: "header", ctx, expanded: !collapsed });
    if (!collapsed) {
      // When `groupSubtotalsOnTop` is on, the footer sits between the
      // header and the bucket's rows so the subtotal reads first. Default
      // remains "rows then footer" so existing layouts keep their feel.
      if (grid.options.groupSubtotalsOnTop) out.push({ type: "footer", ctx });
      const last = depth === opts.groupBy.length - 1;
      if (last) {
        for (const row of bucket) out.push({ type: "row", row });
      } else {
        walkLevel(grid, bucket, path, depth + 1, opts, out);
      }
      if (!grid.options.groupSubtotalsOnTop) out.push({ type: "footer", ctx });
    }
    bucket = [];
  };
  for (const row of rows) {
    const key = (row as Record<string, unknown>)[colId];
    if (bucket.length === 0) {
      bucketKey = key;
      bucket.push(row);
    } else if (sameKey(bucketKey, key)) {
      bucket.push(row);
    } else {
      flush();
      bucketKey = key;
      bucket.push(row);
    }
  }
  flush();
}

/**
 * Build the group header `<tr>` — a colspan'd cell with caret + label
 * + count. `depth` drives the inline indent style; CSS picks up
 * `data-depth` for background tinting.
 */
export function renderGroupHeader<TRow extends Row = Row>(
  _grid: Boostgrid<TRow>,
  ctx: GroupContext<TRow>,
  colSpan: number,
  expanded: boolean,
): HTMLTableRowElement {
  const path = groupPathToString(ctx.groupPath);
  const tr = el("tr", {
    class: `boostgrid-group-row${expanded ? "" : " boostgrid-group-row--collapsed"}`,
    "data-bg-action": "toggle-group",
    "data-bg-value": path,
    "data-depth": String(ctx.depth),
  });
  const td = el("td", {
    colspan: String(colSpan),
    class: "boostgrid-group-cell",
    style: `--bg-group-depth: ${ctx.depth};`,
  });
  const caret = el("i", {
    class: expanded ? "bi bi-caret-down-fill me-2" : "bi bi-caret-right-fill me-2",
    "aria-hidden": "true",
  });
  td.appendChild(caret);
  td.appendChild(document.createTextNode(`${ctx.groupLabel} (${ctx.rows.length})`));
  tr.appendChild(td);
  return tr;
}

/**
 * Build the optional group footer `<tr>` — one cell per visible column
 * (plus the leading selection cell if applicable), populated by
 * `groupAggregators`. Returns `null` when no aggregator produced a value.
 */
export function renderGroupFooter<TRow extends Row = Row>(
  grid: Boostgrid<TRow>,
  ctx: GroupContext<TRow>,
  visibleCols: Column<TRow>[],
): HTMLTableRowElement | null {
  const aggregators = grid.options.groupAggregators;
  let any = false;
  const tr = el("tr", {
    class: "boostgrid-group-footer",
    "data-depth": String(ctx.depth),
  });
  if (grid.options.selection) tr.appendChild(el("td", { class: "bg-select-cell" }));

  for (const col of visibleCols) {
    const aggr = resolveAggregator(aggregators, col.id, ctx.depth);
    const classes = [ALIGN[col.align] ?? "", col.cssClass, "boostgrid-group-aggregate"]
      .filter(Boolean).join(" ");
    const td = el("td", { class: classes, "data-column-id": col.id });
    if (aggr) {
      const out = aggr(col, ctx);
      if (out) {
        td.innerHTML = out;
        any = true;
      }
    }
    tr.appendChild(td);
  }
  return any ? tr : null;
}

function sameKey(a: unknown, b: unknown): boolean {
  return a === b || (a == null && b == null) || String(a) === String(b);
}

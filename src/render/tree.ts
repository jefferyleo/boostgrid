import type { Boostgrid } from "../core.js";
import type { Row } from "../types.js";

/**
 * Internal node shape. `id` is whatever the row holds in the
 * id field — typically string or number. Children are kept in
 * insertion order (sorted upstream by `applySort`).
 */
export interface TreeNode<TRow extends Row = Row> {
  id: string | number;
  row: TRow;
  parentId: string | number | null;
  depth: number;
  children: TreeNode<TRow>[];
}

export interface BuildTreeResult<TRow extends Row = Row> {
  /** Roots in original (sorted) order. */
  roots: TreeNode<TRow>[];
  /** Lookup table by id, including all descendants. */
  byId: Map<string | number, TreeNode<TRow>>;
  /** Set of row ids that the search predicate matched, when search is active. */
  matchedIds: Set<string | number>;
}

interface BuildOpts<TRow extends Row> {
  rows: TRow[];
  idField: string;
  parentField: string;
  /** Optional search predicate; when provided, ancestors of matches stay visible. */
  matchFn?: (row: TRow) => boolean;
}

/**
 * Normalize a raw id-or-parent-id value to a comparable token. Empty strings
 * are treated as "no value" (root marker); numeric strings are coerced to
 * numbers so a row with `id: 1` matches `parentId: "1"` (which is what the
 * default string converter yields for `<td>1</td>`). Returns `null` when
 * the value should be ignored (missing parent / no row id).
 */
function normalizeId(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return t;
  }
  return null;
}

/**
 * Build a tree from a flat (already filtered/sorted) row list using the
 * adjacency-list shape. Detects cycles defensively (warns and breaks the
 * cycle by treating the offending node as a root). Orphans (parent id
 * pointing nowhere) are also promoted to roots with a warning.
 *
 * Ids and parent ids are normalized through {@link normalizeId} so a row
 * with `id: 1` matches a child carrying `parentId: "1"` — the common case
 * when parents come back numeric and children round-tripped through string
 * cells.
 */
export function buildTree<TRow extends Row>(opts: BuildOpts<TRow>): BuildTreeResult<TRow> {
  const { rows, idField, parentField, matchFn } = opts;
  const byId = new Map<string | number, TreeNode<TRow>>();
  const matchedIds = new Set<string | number>();

  // First pass: create every node. Don't link parents yet — we need the full
  // map first so we can detect orphans deterministically.
  for (const row of rows) {
    const rawId = (row as Record<string, unknown>)[idField];
    const id = normalizeId(rawId);
    if (id == null) continue; // rows without id can't appear in a tree
    if (byId.has(id)) {
      // eslint-disable-next-line no-console
      console.warn(`Boostgrid: duplicate tree id ${String(id)} — last wins.`);
    }
    byId.set(id, { id, row, parentId: null, depth: 0, children: [] });
    if (matchFn && matchFn(row)) matchedIds.add(id);
  }

  const roots: TreeNode<TRow>[] = [];

  // Second pass: link children to parents. Maintain row-order.
  for (const row of rows) {
    const rawId = (row as Record<string, unknown>)[idField];
    const id = normalizeId(rawId);
    if (id == null) continue;
    const node = byId.get(id);
    if (!node) continue;
    const parentRaw = (row as Record<string, unknown>)[parentField];
    const parentId = normalizeId(parentRaw);
    if (parentId == null) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(parentId);
    if (!parent) {
      // Orphan — promote to root.
      // eslint-disable-next-line no-console
      console.warn(
        `Boostgrid: tree row ${String(id)} references unknown parent ${String(parentId)} — promoted to root.`,
      );
      roots.push(node);
      continue;
    }
    if (wouldCycle(parent, id, byId)) {
      // eslint-disable-next-line no-console
      console.warn(
        `Boostgrid: tree cycle detected at id ${String(id)} — promoted to root.`,
      );
      roots.push(node);
      continue;
    }
    node.parentId = parentId;
    parent.children.push(node);
  }

  // Third pass: assign depths via BFS from roots.
  for (const root of roots) {
    root.depth = 0;
    const queue: TreeNode<TRow>[] = [root];
    while (queue.length) {
      const n = queue.shift()!;
      for (const c of n.children) {
        c.depth = n.depth + 1;
        queue.push(c);
      }
    }
  }

  // If a search predicate was used, expand ancestor chain of every match.
  // We modify nothing here; ancestor inclusion happens during walkTree below.

  return { roots, byId, matchedIds };
}

/** True if linking `childId` under `parent` would create a cycle. Walks
 *  ancestors of `parent` looking for `childId`. */
function wouldCycle<TRow extends Row>(
  parent: TreeNode<TRow>,
  childId: string | number,
  byId: Map<string | number, TreeNode<TRow>>,
): boolean {
  const seen = new Set<string | number>();
  let cur: TreeNode<TRow> | undefined = parent;
  while (cur) {
    if (cur.id === childId) return true;
    if (seen.has(cur.id)) return true; // safety net for already-corrupt graphs
    seen.add(cur.id);
    if (cur.parentId == null) return false;
    cur = byId.get(cur.parentId);
  }
  return false;
}

/**
 * DFS-walk the tree and produce a flat list of (node, depth) tuples in
 * render order. Hidden subtrees are pruned. When `matchedIds` is non-empty
 * (search active), nodes are visible if (a) they match, or (b) any
 * descendant matches — and ALL ancestors of any match are auto-expanded
 * for this render pass without mutating user expand state.
 */
export function walkTree<TRow extends Row>(
  grid: Boostgrid<TRow>,
  result: BuildTreeResult<TRow>,
): { node: TreeNode<TRow>; visible: boolean }[] {
  const out: { node: TreeNode<TRow>; visible: boolean }[] = [];
  const searching = result.matchedIds.size > 0;

  // Pre-compute "subtree contains a match" for visibility filtering.
  const subtreeMatches = new Set<string | number>();
  if (searching) {
    const markUp = (id: string | number) => {
      let cur = result.byId.get(id);
      while (cur) {
        subtreeMatches.add(cur.id);
        if (cur.parentId == null) break;
        cur = result.byId.get(cur.parentId);
      }
    };
    for (const id of result.matchedIds) markUp(id);
  }

  const isExpanded = (id: string | number): boolean => {
    if (searching && subtreeMatches.has(id)) return true; // auto-expand ancestor chain
    return grid.isTreeExpanded(id);
  };

  const dfs = (node: TreeNode<TRow>) => {
    if (searching && !subtreeMatches.has(node.id)) return; // pruned
    out.push({ node, visible: true });
    if (!isExpanded(node.id)) return;
    for (const child of node.children) dfs(child);
  };

  for (const root of result.roots) dfs(root);
  return out;
}

/**
 * Resolve which column id should carry the caret. Priority order:
 *  1. `options.treeColumn` if set and the column exists+visible
 *  2. First column with `treeColumn: true` (and visible)
 *  3. First visible non-frozen column
 *  4. First visible column
 */
export function resolveTreeColumnId<TRow extends Row>(
  grid: Boostgrid<TRow>,
): string | null {
  const visible = grid.columns.filter((c) => c.visible);
  if (visible.length === 0) return null;
  const opt = grid.options.treeColumn;
  if (opt) {
    const found = visible.find((c) => c.id === opt);
    if (found) return found.id;
  }
  const flagged = visible.find((c) => c.treeColumn);
  if (flagged) return flagged.id;
  const nonFrozen = visible.find((c) => c.frozen !== "left");
  if (nonFrozen) return nonFrozen.id;
  return visible[0].id;
}

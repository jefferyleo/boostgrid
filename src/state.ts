import type { Boostgrid } from "./core.js";
import type { BoostgridState, Row } from "./types.js";

/**
 * Persistent view state, keyed by table id (or a hash of column ids when no
 * id is set). Defensive against environments without `localStorage` —
 * Safari private mode, SSR, sandboxed iframes — by silently no-opping.
 *
 * Schema is versioned (`v: 1`); a future breaking change should bump the
 * version and discard older payloads on read.
 */

const VERSION = 3 as const;

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    // Trigger an access to surface "access denied" early
    const k = "__boostgrid_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

export function defaultStateKey<TRow extends Row = Row>(grid: Boostgrid<TRow>): string {
  const id = grid.element.id;
  if (id) return `boostgrid:${id}`;
  // Fall back to a stable hash of the column id list
  const sig = grid.columns.map((c) => c.id).join("|");
  return `boostgrid:${djb2(sig)}`;
}

function resolveKey<TRow extends Row>(grid: Boostgrid<TRow>): string {
  return grid.options.stateKey ?? defaultStateKey(grid);
}

/** Trailing-edge debounce window (ms) for `saveState`. Picked to be long
 *  enough to coalesce the burst of state changes during column-resize
 *  drag (60Hz pointermove) and short enough to feel instant for a tab
 *  close after a discrete action like sort/page. */
const SAVE_DEBOUNCE_MS = 200;

/** One pending-save timer per grid. WeakMap so the entry is GC'd alongside
 *  the grid instance — no leak when grids are destroyed without an
 *  explicit flush. */
const saveTimers = new WeakMap<Boostgrid<Row>, ReturnType<typeof setTimeout>>();

/** Synchronous serializer — invoked by the debounced `saveState` and by
 *  `flushSaveState` on `destroy()`. */
function writeState<TRow extends Row = Row>(grid: Boostgrid<TRow>): void {
  if (!grid.options.stateSave) return;
  const store = safeStorage();
  if (!store) return;
  const state: BoostgridState = {
    v: VERSION,
    current: grid.getCurrentPage(),
    rowsPerPage: grid.getRowCount(),
    searchPhrase: grid.getSearchPhrase(),
    sortDictionary: grid.getSortDictionary(),
    columnVisibility: Object.fromEntries(
      grid.columns.map((c) => [c.id, c.visible]),
    ),
    selected: grid.options.keepSelection ? grid.getSelectedRows() : [],
    collapsedGroups: Array.from(grid.collapsedGroupPaths),
    expandedTreeNodes: Array.from(grid.expandedTreeNodes) as Array<string | number>,
    columnOrder: grid.columns.map((c) => c.id),
    columnWidths: Object.fromEntries(
      grid.columns
        .filter((c) => typeof c.width === "string" && /px$/.test(c.width))
        .map((c) => [c.id, c.width as string]),
    ),
  };
  try {
    store.setItem(resolveKey(grid), JSON.stringify(state));
  } catch {
    /* quota exceeded, etc. — silent */
  }
}

export function saveState<TRow extends Row = Row>(grid: Boostgrid<TRow>): void {
  if (!grid.options.stateSave) return;
  const key = grid as unknown as Boostgrid<Row>;
  const existing = saveTimers.get(key);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    key,
    setTimeout(() => {
      saveTimers.delete(key);
      writeState(grid);
    }, SAVE_DEBOUNCE_MS),
  );
}

/**
 * Synchronously flush any pending debounced save. Called from `destroy()`
 * so the user's last interaction (which may have happened mid-debounce)
 * still lands in localStorage instead of being silently dropped.
 */
export function flushSaveState<TRow extends Row = Row>(grid: Boostgrid<TRow>): void {
  const key = grid as unknown as Boostgrid<Row>;
  const t = saveTimers.get(key);
  if (t) {
    clearTimeout(t);
    saveTimers.delete(key);
    writeState(grid);
  }
}

/**
 * Read persisted state and apply it to the grid IN PLACE. Returns true if a
 * payload was found and applied (so the caller can skip its own initial
 * sort/page setup), or false otherwise.
 *
 * Invariants enforced:
 *  - Only restores columns that still exist on the table.
 *  - Discards payloads with a missing or wrong `v` field.
 *  - Sanity-checks `current` and `rowsPerPage` to numbers.
 */
export function restoreState<TRow extends Row = Row>(grid: Boostgrid<TRow>): boolean {
  if (!grid.options.stateSave) return false;
  const store = safeStorage();
  if (!store) return false;
  const raw = store.getItem(resolveKey(grid));
  if (!raw) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return false; }
  // Cast to a broader shape — older payloads carry `v: 1` which the
  // current `BoostgridState` literal type doesn't allow.
  const state = parsed as (Omit<Partial<BoostgridState>, "v"> & { v?: number }) | null;
  if (!state) return false;
  // Accept v:1 (pre-Round 4), v:2 (Round 4), and v:3 (Round 5) payloads.
  // Older versions simply lack newer fields; everything else applies cleanly.
  const v = state.v;
  if (v !== 1 && v !== 2 && v !== 3) return false;

  if (typeof state.rowsPerPage === "number") {
    grid.applyRestoredRowsPerPage(state.rowsPerPage);
  }
  if (typeof state.current === "number" && state.current >= 1) {
    grid.current = state.current;
  }
  if (typeof state.searchPhrase === "string") {
    grid.searchPhrase = state.searchPhrase;
  }
  if (state.sortDictionary && typeof state.sortDictionary === "object") {
    grid.sortDictionary = { ...state.sortDictionary };
  }
  if (state.columnVisibility && typeof state.columnVisibility === "object") {
    for (const col of grid.columns) {
      const cv = (state.columnVisibility as Record<string, unknown>)[col.id];
      if (typeof cv === "boolean") col.visible = cv;
    }
  }
  if (Array.isArray(state.selected) && grid.options.keepSelection) {
    grid.applyRestoredSelection(state.selected);
  }
  // v:2+ fields. Each is independently optional so partial payloads
  // (e.g. someone hand-edited localStorage) still apply non-broken parts.
  if (v === 2 || v === 3) {
    if (Array.isArray(state.collapsedGroups)) {
      grid.collapsedGroupPaths = new Set(
        state.collapsedGroups.filter((s): s is string => typeof s === "string"),
      );
    }
    if (Array.isArray(state.expandedTreeNodes)) {
      const ids = state.expandedTreeNodes.filter(
        (x): x is string | number => typeof x === "string" || typeof x === "number",
      );
      grid.expandedTreeNodes = new Set(ids);
    }
  }
  // v:3-only fields — column reorder + drag-resize persistence.
  if (v === 3) {
    if (Array.isArray(state.columnOrder)) {
      const stored = state.columnOrder.filter((s): s is string => typeof s === "string");
      const live = grid.columns.map((c) => c.id);
      // Apply only when id sets match exactly — silently fall back to
      // authored order if a column was added or removed in code.
      if (
        stored.length === live.length &&
        stored.every((id) => live.includes(id))
      ) {
        const byId = new Map(grid.columns.map((c) => [c.id, c]));
        grid.columns = stored.map((id) => byId.get(id)!);
      }
    }
    if (state.columnWidths && typeof state.columnWidths === "object") {
      const widths = state.columnWidths as Record<string, unknown>;
      for (const col of grid.columns) {
        const w = widths[col.id];
        if (typeof w === "string" && /^\d+(\.\d+)?px$/.test(w)) {
          col.width = w;
        }
      }
    }
  }
  return true;
}

export function clearState<TRow extends Row = Row>(grid: Boostgrid<TRow>): void {
  const store = safeStorage();
  if (!store) return;
  try { store.removeItem(resolveKey(grid)); } catch { /* silent */ }
}

/** Tiny string hash; collision risk is acceptable since the column-id
 *  signature is the only fallback when no table id exists. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

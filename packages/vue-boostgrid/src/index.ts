import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
} from "vue";
import {
  Boostgrid,
  type BoostgridOptions,
  type Column,
  type Row,
  type SortDictionary,
} from "boostgrid";

export type ColumnDef = Pick<Column, "id" | "text"> & Partial<Column>;

/**
 * Vue 3 wrapper for the vanilla Boostgrid core. Same host-div pattern as
 * the React wrapper: Vue owns only the wrapping `<div>`; the `<table>` is
 * built imperatively from `columns` on mount so Vue's reactivity layer
 * never collides with the grid's own DOM mutations.
 *
 * The component is implemented with `defineComponent` + a render function
 * to keep the build pipeline minimal — no `.vue` files, no vue-tsc shim
 * required.
 */
export const VueBoostgrid = defineComponent({
  name: "VueBoostgrid",
  props: {
    /** Rows to render. When the array reference changes, the grid is rebuilt via clear+append. */
    data: { type: Array as PropType<Row[]>, required: true },
    /** Column declarations rendered as <th data-column-id="…"> elements at mount. */
    columns: { type: Array as PropType<ColumnDef[]>, required: true },
    /** Forwarded to the core Boostgrid constructor. */
    options: { type: Object as PropType<Partial<BoostgridOptions>>, default: () => ({}) },
    /** Class applied to the host div wrapper. */
    className: { type: String, default: "" },
    /** Class applied to the underlying <table>. Defaults to "table table-hover". */
    tableClassName: { type: String, default: "table table-hover" },
  },
  emits: {
    loaded: (_rows: Row[]) => true,
    selected: (_rows: Row[]) => true,
    deselected: (_rows: Row[]) => true,
    sorted: (_dict: SortDictionary) => true,
    searched: (_phrase: string) => true,
  },
  setup(props, { emit, expose }) {
    const hostRef = ref<HTMLDivElement | null>(null);
    const gridRef = ref<Boostgrid | null>(null);

    onMounted(() => {
      const host = hostRef.value;
      if (!host) return;
      const table = buildTable(props.columns, props.tableClassName);
      host.appendChild(table);

      const grid = new Boostgrid(table, props.options);
      gridRef.value = grid;
      grid.append(props.data);

      grid.on("loaded", () => emit("loaded", grid.getCurrentRows()));
      grid.on("selected", (rows) => emit("selected", rows as Row[]));
      grid.on("deselected", (rows) => emit("deselected", rows as Row[]));
      grid.on("sorted", (dict) => emit("sorted", dict as SortDictionary));
      grid.on("searched", (p) => emit("searched", p as string));
    });

    // Sync data updates after mount. Vue's `watch` on an array reference
    // fires when the array identity changes; deep-watching is opt-in (and
    // would be expensive on large datasets).
    watch(
      () => props.data,
      (next) => {
        const grid = gridRef.value;
        if (!grid) return;
        grid.clear();
        grid.append(next);
      },
    );

    onBeforeUnmount(() => {
      const grid = gridRef.value;
      if (grid) grid.destroy();
      gridRef.value = null;
      const host = hostRef.value;
      if (host) {
        // After destroy() the table sits where the wrapper was — strip it.
        while (host.firstChild) host.removeChild(host.firstChild);
      }
    });

    /** Imperative handle parallel to the React wrapper's `ReactBoostgridHandle`. */
    expose({
      get grid() { return gridRef.value; },
      search:          (p?: string) => gridRef.value?.search(p),
      sort:            (d?: SortDictionary) => gridRef.value?.sort(d),
      reload:          ()  => gridRef.value?.reload(),
      getSelectedRows: ()  => gridRef.value?.getSelectedRows() ?? [],
    });

    return () => h("div", { ref: hostRef, class: props.className });
  },
});

export interface VueBoostgridHandle {
  readonly grid: Boostgrid | null;
  search: (phrase?: string) => void;
  sort: (dict?: SortDictionary) => void;
  reload: () => void;
  getSelectedRows: () => unknown[];
}

export default VueBoostgrid;

/* ─────────── helpers ─────────── */

function buildTable(columns: ColumnDef[], tableClassName: string): HTMLTableElement {
  const table = document.createElement("table");
  table.className = tableClassName;
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  for (const c of columns) {
    const th = document.createElement("th");
    th.textContent = c.text;
    th.setAttribute("data-column-id", c.id);
    if (c.identifier) th.setAttribute("data-identifier", "true");
    if (c.type) th.setAttribute("data-type", c.type);
    if (c.align) th.setAttribute("data-align", c.align);
    if (c.headerAlign) th.setAttribute("data-header-align", c.headerAlign);
    if (c.order) th.setAttribute("data-order", c.order);
    if (c.formatter && typeof c.formatter !== "function") {
      th.setAttribute("data-formatter", String(c.formatter));
    }
    if (c.sortable === false) th.setAttribute("data-sortable", "false");
    if (c.searchable === false) th.setAttribute("data-searchable", "false");
    if (c.visible === false) th.setAttribute("data-visible", "false");
    if (c.width != null) th.setAttribute("data-width", String(c.width));
    if (c.cssClass) th.setAttribute("data-css-class", c.cssClass);
    if (c.headerCssClass) th.setAttribute("data-header-css-class", c.headerCssClass);
    if (c.frozen === "left") th.setAttribute("data-frozen", "left");
    if (c.editable) th.setAttribute("data-editable", "true");
    if (c.editType) th.setAttribute("data-edit-type", String(c.editType));
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  table.appendChild(document.createElement("tbody"));
  return table;
}

// Re-export core types so consumers can import from one place
export type { BoostgridOptions, Column, Row, SortDictionary };

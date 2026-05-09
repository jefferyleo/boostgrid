import type {
  BoostgridOptions, Column, Converter, Row, Align, SortOrder, EditType, EditOption,
} from "./types.js";
import { bootstrapIcons } from "./icons.js";
import { readData } from "./dom.js";

const numericConverter: Converter = {
  from: (v) => Number(v),
  to: (v) => (v == null ? "" : String(v)),
};
const stringConverter: Converter = {
  from: (v) => v,
  to: (v) => (v == null ? "" : String(v)),
};

export const defaults: BoostgridOptions<Row> = {
  navigation: 3,
  padding: 2,
  columnSelection: true,
  rowCount: [10, 25, 50, -1],
  selection: false,
  multiSelect: false,
  rowSelect: false,
  keepSelection: false,
  highlightRows: false,
  sorting: true,
  multiSort: false,
  caseSensitive: false,
  searchSettings: { delay: 200, characters: 1 },
  virtualScroll: false,
  rowHeight: 38,
  overscan: 5,
  ajax: false,
  url: "",
  ajaxSettings: { method: "POST" },
  requestHandler: (r) => r,
  responseHandler: (r) => r,
  converters: {
    numeric: numericConverter,
    string: stringConverter,
  },
  formatters: {},
  footer: false,
  footerFormatters: {},
  footerCallback: null,
  editable: false,
  onCellEdit: null,
  groupBy: null,
  groupExpanded: "all",
  groupAggregators: {},
  groupSubtotalsOnTop: false,
  columnReorder: true,
  onColumnReorder: null,
  columnResize: true,
  onColumnResize: null,
  treeReparent: false,
  onReparent: null,
  treeMode: false,
  treeParentField: "parentId",
  treeIdField: null,
  treeIndentPx: 24,
  treeColumn: null,
  treeExpanded: "all",
  rowDetail: null,
  rowDetailExpanded: "none",
  bulkActions: null,
  loadingSkeleton: true,
  cellSelection: false,
  stickyHeader: false,
  truncatedTooltips: true,
  locale: null,
  performanceMarks: false,
  stateSave: false,
  stateKey: null,
  labels: {
    all: "All",
    infos: "Showing {start} to {end} of {total} entries",
    loading: "Loading…",
    noResults: "No results found.",
    refresh: "Refresh",
    search: "Search",
    columns: "Columns",
    resetColumns: "Reset to defaults",
    searchColumns: "Search columns",
    dragToReorder: "Drag to reorder",
    resizeColumn: "Resize {column}",
    rowDetailsHeader: "Row details",
    showDetails: "Show details",
    hideDetails: "Hide details",
    bulkActions: "Bulk actions",
    bulkSelected: "{n} selected",
    bulkClear: "Clear",
    treeExpand: "Expand",
    treeCollapse: "Collapse",
  },
  icons: bootstrapIcons,
  statusMapping: { 0: "table-success", 1: "table-info", 2: "table-warning", 3: "table-danger" },
};

export function mergeOptions<TRow extends Row = Row>(
  user: Partial<BoostgridOptions<TRow>> | undefined,
  fromTable: Partial<BoostgridOptions<TRow>>,
): BoostgridOptions<TRow> {
  // The narrow defaults are valid for any TRow because the only fields the
  // generic flows through are user-supplied dictionaries (`formatters`,
  // `footerFormatters`, `footerCallback`); their built-in defaults are
  // empty `{}` / `null` that satisfy the typed shape.
  const base = defaults as unknown as BoostgridOptions<TRow>;
  return {
    ...base,
    ...fromTable,
    ...(user ?? {}),
    searchSettings: { ...base.searchSettings, ...fromTable.searchSettings, ...user?.searchSettings },
    ajaxSettings: { ...base.ajaxSettings, ...fromTable.ajaxSettings, ...user?.ajaxSettings },
    converters: { ...base.converters, ...fromTable.converters, ...user?.converters },
    formatters: { ...base.formatters, ...fromTable.formatters, ...user?.formatters },
    footerFormatters: {
      ...base.footerFormatters,
      ...fromTable.footerFormatters,
      ...user?.footerFormatters,
    },
    groupAggregators: {
      ...base.groupAggregators,
      ...fromTable.groupAggregators,
      ...user?.groupAggregators,
    },
    labels: { ...base.labels, ...fromTable.labels, ...user?.labels },
    icons: { ...base.icons, ...fromTable.icons, ...user?.icons },
    statusMapping: { ...base.statusMapping, ...fromTable.statusMapping, ...user?.statusMapping },
  };
}

/**
 * Parse columns from the table's <thead><tr>. Mirrors v1's data-* contract:
 * data-column-id, data-identifier, data-type, data-align, data-header-align,
 * data-css-class, data-header-css-class, data-formatter, data-order (asc|desc),
 * data-searchable, data-sortable, data-visible, data-width.
 */
export function parseColumns<TRow extends Row = Row>(
  table: HTMLTableElement,
  options: BoostgridOptions<TRow>,
): Column<TRow>[] {
  const headRow = table.querySelector("thead > tr");
  if (!headRow) return [];
  const cols: Column<TRow>[] = [];
  let firstSortClaimed = false;
  let firstIdentifierClaimed = false;
  for (const th of Array.from(headRow.children)) {
    const d = readData(th);
    const id = String(d.columnId ?? "");
    if (!id) continue;
    const type = String(d.type ?? "string");
    const converter = options.converters[String(d.converter ?? type)] ?? options.converters.string;
    const formatterKey = d.formatter ? String(d.formatter) : null;
    const formatter = formatterKey ? options.formatters[formatterKey] ?? null : null;
    const footerFormatterKey = d.footerFormatter ? String(d.footerFormatter) : null;
    const footerFormatter = footerFormatterKey
      ? options.footerFormatters[footerFormatterKey] ?? null
      : null;
    const isIdentifier = !firstIdentifierClaimed && d.identifier === true;
    if (isIdentifier) firstIdentifierClaimed = true;
    let order: SortOrder | null = null;
    if (!firstSortClaimed && (d.order === "asc" || d.order === "desc")) {
      order = d.order;
      if (!options.multiSort) firstSortClaimed = true;
    }
    const widthRaw = d.width;
    const width =
      typeof widthRaw === "number" ? `${widthRaw}px` :
      typeof widthRaw === "string" ? widthRaw :
      null;
    // Identifier columns are NEVER editable, even if data-editable="true" was set.
    const editableFromData = d.editable === true || (d.editable !== false && options.editable);
    const editable = !isIdentifier && !!editableFromData;
    const editType: EditType =
      d.editType === "number" || d.editType === "select" || d.editType === "text"
        ? d.editType
        : (type === "numeric" ? "number" : "text");
    const editOptions = Array.isArray(d.editOptions) ? (d.editOptions as EditOption[]) : [];

    const frozen: "left" | "right" | null =
      d.frozen === "right" ? "right" :
      d.frozen === "left" || d.frozen === true ? "left" :
      null;
    const treeColumn = d.treeColumn === true;

    const reorderable = d.reorderable !== false;
    const resizable = d.resizable !== false;
    const minWidthRaw = d.minWidth;
    const maxWidthRaw = d.maxWidth;
    const minWidth = typeof minWidthRaw === "number"
      ? minWidthRaw
      : typeof minWidthRaw === "string" && /^\d+(\.\d+)?$/.test(minWidthRaw)
        ? Number(minWidthRaw)
        : 40;
    const maxWidth = typeof maxWidthRaw === "number"
      ? maxWidthRaw
      : typeof maxWidthRaw === "string" && /^\d+(\.\d+)?$/.test(maxWidthRaw)
        ? Number(maxWidthRaw)
        : Infinity;

    cols.push({
      id,
      text: (th.textContent ?? "").trim(),
      identifier: isIdentifier,
      type,
      converter,
      align: (d.align as Align) ?? "left",
      headerAlign: (d.headerAlign as Align) ?? "left",
      cssClass: String(d.cssClass ?? ""),
      headerCssClass: String(d.headerCssClass ?? ""),
      formatter,
      footerFormatter,
      editable,
      editType,
      editOptions,
      frozen,
      treeColumn,
      order,
      searchable: d.searchable !== false,
      sortable: d.sortable !== false && options.sorting,
      visible: d.visible !== false,
      width,
      reorderable,
      resizable,
      minWidth,
      maxWidth,
    });
  }
  return cols;
}

/**
 * Read the existing tbody rows into row objects keyed by column id.
 * Used when the user provides static markup rather than ajax/data.
 */
export function parseRowsFromTable<TRow extends Row = Row>(
  table: HTMLTableElement,
  columns: Column<TRow>[],
): TRow[] {
  const rows: Row[] = [];
  const trs = table.querySelectorAll("tbody > tr");
  trs.forEach((tr) => {
    const row: Row = {};
    Array.from(tr.children).forEach((td, i) => {
      const col = columns[i];
      if (!col) return;
      row[col.id] = col.converter.from((td.textContent ?? "").trim());
    });
    rows.push(row);
  });
  // Caller-supplied TRow constrains the row shape; we only know fields
  // declared as columns, so the remaining shape is the user's responsibility.
  return rows as TRow[];
}

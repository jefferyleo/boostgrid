import type { BoostgridOptions, Column, Converter, Row, Align, SortOrder } from "./types.js";
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

export const defaults: BoostgridOptions = {
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
  labels: {
    all: "All",
    infos: "Showing {start} to {end} of {total} entries",
    loading: "Loading…",
    noResults: "No results found.",
    refresh: "Refresh",
    search: "Search",
  },
  icons: bootstrapIcons,
  statusMapping: { 0: "table-success", 1: "table-info", 2: "table-warning", 3: "table-danger" },
};

export function mergeOptions(
  user: Partial<BoostgridOptions> | undefined,
  fromTable: Partial<BoostgridOptions>,
): BoostgridOptions {
  return {
    ...defaults,
    ...fromTable,
    ...(user ?? {}),
    searchSettings: { ...defaults.searchSettings, ...fromTable.searchSettings, ...user?.searchSettings },
    ajaxSettings: { ...defaults.ajaxSettings, ...fromTable.ajaxSettings, ...user?.ajaxSettings },
    converters: { ...defaults.converters, ...fromTable.converters, ...user?.converters },
    formatters: { ...defaults.formatters, ...fromTable.formatters, ...user?.formatters },
    labels: { ...defaults.labels, ...fromTable.labels, ...user?.labels },
    icons: { ...defaults.icons, ...fromTable.icons, ...user?.icons },
    statusMapping: { ...defaults.statusMapping, ...fromTable.statusMapping, ...user?.statusMapping },
  };
}

/**
 * Parse columns from the table's <thead><tr>. Mirrors v1's data-* contract:
 * data-column-id, data-identifier, data-type, data-align, data-header-align,
 * data-css-class, data-header-css-class, data-formatter, data-order (asc|desc),
 * data-searchable, data-sortable, data-visible, data-width.
 */
export function parseColumns(table: HTMLTableElement, options: BoostgridOptions): Column[] {
  const headRow = table.querySelector("thead > tr");
  if (!headRow) return [];
  const cols: Column[] = [];
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
      order,
      searchable: d.searchable !== false,
      sortable: d.sortable !== false && options.sorting,
      visible: d.visible !== false,
      width,
    });
  }
  return cols;
}

/**
 * Read the existing tbody rows into row objects keyed by column id.
 * Used when the user provides static markup rather than ajax/data.
 */
export function parseRowsFromTable(table: HTMLTableElement, columns: Column[]): Row[] {
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
  return rows;
}

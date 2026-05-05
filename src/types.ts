export type Row = Record<string, unknown>;
export type SortOrder = "asc" | "desc";
export type SortDictionary = Record<string, SortOrder>;
export type Align = "left" | "center" | "right";

export interface Converter {
  from: (value: string) => unknown;
  to: (value: unknown) => string;
}

export interface Column {
  id: string;
  text: string;
  identifier: boolean;
  type: string;
  converter: Converter;
  align: Align;
  headerAlign: Align;
  cssClass: string;
  headerCssClass: string;
  formatter: Formatter | null;
  order: SortOrder | null;
  searchable: boolean;
  sortable: boolean;
  visible: boolean;
  width: string | null;
}

export type Formatter = (column: Column, row: Row) => string;

export interface Labels {
  all: string;
  infos: string;
  loading: string;
  noResults: string;
  refresh: string;
  search: string;
}

export interface IconSet {
  /** sort-asc / sort-desc / sort-none / search / refresh / columns */
  sortAsc: string;
  sortDesc: string;
  sortNone: string;
  search: string;
  refresh: string;
  columns: string;
}

export interface SearchSettings {
  delay: number;
  characters: number;
}

export interface BoostgridOptions {
  /** 0 = none, 1 = top, 2 = bottom, 3 = both */
  navigation: 0 | 1 | 2 | 3;
  padding: number;
  columnSelection: boolean;
  rowCount: number | number[];
  selection: boolean;
  multiSelect: boolean;
  rowSelect: boolean;
  keepSelection: boolean;
  highlightRows: boolean;
  sorting: boolean;
  multiSort: boolean;
  caseSensitive: boolean;
  searchSettings: SearchSettings;
  /** virtual scroll for very large datasets */
  virtualScroll: boolean;
  /** estimated row height (px) used for virtual scroll math */
  rowHeight: number;
  /** number of rows to render outside the viewport on each side */
  overscan: number;
  ajax: boolean;
  url: string | (() => string);
  ajaxSettings: { method: string };
  requestHandler: (request: AjaxRequest) => unknown;
  responseHandler: (response: AjaxResponse) => AjaxResponse;
  converters: Record<string, Converter>;
  formatters: Record<string, Formatter>;
  labels: Labels;
  icons: IconSet;
  statusMapping: Record<number, string>;
}

export interface AjaxRequest {
  current: number;
  rowCount: number;
  sort: SortDictionary;
  searchPhrase: string;
}

export interface AjaxResponse {
  current: number;
  rowCount: number;
  rows: Row[];
  total: number;
}

export type EventName =
  | "initialized"
  | "load"
  | "loaded"
  | "appended"
  | "removed"
  | "cleared"
  | "selected"
  | "deselected"
  | "sorted"
  | "searched";

export type Listener = (...args: unknown[]) => void;

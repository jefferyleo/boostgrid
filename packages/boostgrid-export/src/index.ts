import type { Boostgrid, Row } from "boostgrid";
import { exportCsv, rowsToCsv, downloadCsv } from "./csv.js";
import { exportXlsx, rowsToAoa } from "./xlsx.js";
import { exportPrint } from "./print.js";

/**
 * Which slice of the grid's data the export should write out.
 *
 *  - `"current"`  → only the rows on the current page (matches what the user
 *    can see in the table).
 *  - `"filtered"` (default) → all rows after search/filter, across pages.
 *  - `"all"`      → every row in the dataset, ignoring search.
 */
export type ExportInclude = "current" | "filtered" | "all";

/**
 * How tree-mode rows are formatted in the export.
 *
 *  - `"indent"` (default when `treeMode`): prefix the tree-column cell with
 *    `treeIndentString` repeated `depth` times.
 *  - `"path-column"`: insert a leading "Path" column carrying the
 *    slash-joined ancestor labels (`"/folders/2024/reports"`).
 *  - `"flat"`: write rows in render order with no hierarchy hints.
 */
export type TreeExport = "indent" | "path-column" | "flat";

export interface ExportOptions {
  /** Filename without extension. Defaults to `"boostgrid"`. */
  filename?: string;
  /** Which row slice to export. Defaults to `"filtered"`. */
  include?: ExportInclude;
  /** CSV field separator. Defaults to `","`. */
  csvDelimiter?: string;
  /** Excel sheet name. Defaults to `"Sheet1"`. */
  xlsxSheetName?: string;
  /** Print window title. Defaults to `"Print"`. */
  printTitle?: string;
  /** Tree formatting mode. Defaults to `"indent"` when `grid.options.treeMode`. */
  treeExport?: TreeExport;
  /** String repeated per depth in `"indent"` mode. Defaults to two spaces. */
  treeIndentString?: string;
}

export interface ExportHandle {
  csv(): void;
  xlsx(): Promise<void>;
  print(): void;
  /** Detach the delegated `data-bg-export` click listener (if any). */
  destroy(): void;
}

/**
 * Attach an export controller to a Boostgrid instance. Returns
 * `{ csv, xlsx, print, destroy }` for imperative use, AND wires a delegated
 * click listener so any `<button data-bg-export="csv|xlsx|print">` in the
 * grid's wrapper triggers the matching export.
 */
export function attachExport<TRow extends Row = Row>(
  grid: Boostgrid<TRow>,
  opts: ExportOptions = {},
): ExportHandle {
  const filename = opts.filename ?? "boostgrid";
  const include = opts.include ?? "filtered";
  const csvDelimiter = opts.csvDelimiter ?? ",";
  const sheetName = opts.xlsxSheetName ?? "Sheet1";
  const printTitle = opts.printTitle ?? "Print";
  const treeExport: TreeExport = opts.treeExport ?? (grid.options.treeMode ? "indent" : "flat");
  const treeIndentString = opts.treeIndentString ?? "  ";

  const pickRows = (): TRow[] => {
    switch (include) {
      case "current":  return grid.getCurrentRows();
      case "all":      return grid.getAllRows();
      case "filtered":
      default:         return grid.getFilteredRows();
    }
  };

  const treeOpts = { treeExport, treeIndentString };
  const handle: ExportHandle = {
    csv:   () => exportCsv(grid, pickRows(), filename, csvDelimiter, treeOpts),
    xlsx:  () => exportXlsx(grid, pickRows(), filename, sheetName, treeOpts),
    print: () => exportPrint(grid, pickRows(), printTitle, treeOpts),
    destroy: () => {
      const wrapper = grid.element.parentElement;
      if (wrapper) wrapper.removeEventListener("click", onClick);
    },
  };

  // Delegated click listener: any element with `data-bg-export="csv|xlsx|print"`
  // inside the grid's wrapper triggers the matching action.
  const onClick = (e: Event) => {
    const t = (e.target as Element | null)?.closest("[data-bg-export]") as HTMLElement | null;
    if (!t) return;
    const action = t.dataset.bgExport;
    if (action === "csv") handle.csv();
    else if (action === "xlsx") void handle.xlsx();
    else if (action === "print") handle.print();
  };
  const wrapper = grid.element.parentElement;
  if (wrapper) wrapper.addEventListener("click", onClick);

  return handle;
}

export { rowsToCsv, downloadCsv, rowsToAoa };
export type { Boostgrid, Row };

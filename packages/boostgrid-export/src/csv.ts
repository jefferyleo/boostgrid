import type { Boostgrid, Column, Row } from "boostgrid";
import type { TreeExport } from "./index.js";

interface TreeOpts {
  treeExport: TreeExport;
  treeIndentString: string;
}

/**
 * RFC 4180-compliant CSV serializer. A field is wrapped in double-quotes
 * when it contains a comma, newline, carriage-return, or quote character;
 * embedded quotes are doubled.
 */
export function rowsToCsv<TRow extends Row>(
  cols: Column<TRow>[],
  rows: TRow[],
  delimiter = ",",
  grid?: Boostgrid<TRow>,
  treeOpts?: TreeOpts,
): string {
  const visible = cols.filter((c) => c.visible);
  const treeMode = !!grid?.options.treeMode;
  const mode = treeOpts?.treeExport ?? "flat";
  const indentStr = treeOpts?.treeIndentString ?? "  ";
  const treeColId = treeMode ? grid!.getTreeColumnId() : null;

  const headers: string[] = [];
  if (treeMode && mode === "path-column") headers.push("Path");
  for (const c of visible) headers.push(c.text);
  const header = headers.map((h) => escape(h, delimiter)).join(delimiter);

  const idField = grid?.identifier ?? null;

  const body = rows.map((r) => {
    const cells: string[] = [];
    if (treeMode && mode === "path-column") {
      cells.push(treePath(grid!, r, idField, treeColId));
    }
    for (const c of visible) {
      let v = stringify(c, r);
      if (treeMode && mode === "indent" && c.id === treeColId && idField) {
        const id = (r as Record<string, unknown>)[idField] as string | number;
        const depth = grid!.getTreeDepth(id) ?? 0;
        v = indentStr.repeat(depth) + v;
      }
      cells.push(v);
    }
    return cells.map((s) => escape(s, delimiter)).join(delimiter);
  });
  return [header, ...body].join("\r\n");
}

function treePath<TRow extends Row>(
  grid: Boostgrid<TRow>,
  row: TRow,
  idField: string | null,
  treeColId: string | null,
): string {
  if (!idField || !treeColId) return "";
  const id = (row as Record<string, unknown>)[idField] as string | number;
  const ancestors = grid.getTreeAncestors(id) ?? [];
  const treeCol = grid.columns.find((c) => c.id === treeColId);
  if (!treeCol) return "";
  const labels = ancestors.map((a) =>
    treeCol.converter.to((a as Record<string, unknown>)[treeColId]),
  );
  return "/" + labels.join("/");
}

function stringify<TRow extends Row>(col: Column<TRow>, row: TRow): string {
  // Use the column's converter so dates/numbers serialize the same way they
  // render in the grid. Formatters are skipped on purpose — their output is
  // HTML, not data.
  const v = (row as Record<string, unknown>)[col.id];
  return col.converter.to(v);
}

function escape(s: string, delimiter: string): string {
  const needsQuotes = s.includes(delimiter) || /[\n\r"]/.test(s);
  return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Trigger a browser download of `content` as `<filename>.csv`. Uses a
 * Blob URL; the temporary anchor is detached after click.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportCsv<TRow extends Row>(
  grid: Boostgrid<TRow>,
  rows: TRow[],
  filename: string,
  delimiter = ",",
  treeOpts?: TreeOpts,
): void {
  const csv = rowsToCsv(grid.columns, rows, delimiter, grid, treeOpts);
  downloadCsv(filename, csv);
}

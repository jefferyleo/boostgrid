import type { Boostgrid, Column, Row } from "boostgrid";
import type { TreeExport } from "./index.js";

interface TreeOpts {
  treeExport: TreeExport;
  treeIndentString: string;
}

/**
 * Minimal shape of `xlsx-js-style` we depend on. The full type is much
 * bigger; this slice keeps the optional-peer-dep wiring honest without
 * pulling the whole `@types/xlsx` surface into our build.
 */
interface XlsxLib {
  utils: {
    book_new(): unknown;
    aoa_to_sheet(rows: unknown[][]): unknown;
    book_append_sheet(wb: unknown, ws: unknown, name: string): void;
  };
  writeFile(wb: unknown, filename: string): void;
}

/**
 * Lazy-loads `xlsx-js-style` (an optional peer dep) and writes a workbook
 * to disk. Throws a descriptive error if the peer dep isn't installed —
 * we don't want to bundle ~600 KB of xlsx machinery into every consumer.
 */
export async function exportXlsx<TRow extends Row>(
  grid: Boostgrid<TRow>,
  rows: TRow[],
  filename: string,
  sheetName = "Sheet1",
  treeOpts?: TreeOpts,
): Promise<void> {
  let xlsx: XlsxLib;
  try {
    // Use Function-constructed dynamic import so neither vite nor rollup
    // sees the literal module specifier — they would otherwise try to
    // resolve it at build/test time, even with /* @vite-ignore */.
    const dynImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    xlsx = (await dynImport("xlsx-js-style")) as any;
  } catch {
    throw new Error(
      "boostgrid-export: xlsx() requires the optional peer dependency 'xlsx-js-style'. " +
      "Install it with `npm i xlsx-js-style`.",
    );
  }
  const data = rowsToAoa(grid.columns, rows, grid, treeOpts);
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(data);
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  xlsx.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * Convert columns + rows to an "array of arrays" (header row + data rows)
 * — the canonical xlsx-js-style ingestion shape.
 */
export function rowsToAoa<TRow extends Row>(
  cols: Column<TRow>[],
  rows: TRow[],
  grid?: Boostgrid<TRow>,
  treeOpts?: TreeOpts,
): unknown[][] {
  const visible = cols.filter((c) => c.visible);
  const treeMode = !!grid?.options.treeMode;
  const mode = treeOpts?.treeExport ?? "flat";
  const indentStr = treeOpts?.treeIndentString ?? "  ";
  const treeColId = treeMode ? grid!.getTreeColumnId() : null;
  const idField = grid?.identifier ?? null;

  const header: string[] = [];
  if (treeMode && mode === "path-column") header.push("Path");
  for (const c of visible) header.push(c.text);

  const body = rows.map((r) => {
    const out: unknown[] = [];
    if (treeMode && mode === "path-column" && idField && treeColId) {
      const id = (r as Record<string, unknown>)[idField] as string | number;
      const ancestors = grid!.getTreeAncestors(id) ?? [];
      const treeCol = grid!.columns.find((c) => c.id === treeColId);
      const labels = treeCol
        ? ancestors.map((a) =>
            treeCol.converter.to((a as Record<string, unknown>)[treeColId]),
          )
        : [];
      out.push("/" + labels.join("/"));
    }
    for (const c of visible) {
      const v = (r as Record<string, unknown>)[c.id];
      let cell: string | number =
        typeof v === "number" ? v : c.converter.to(v);
      if (
        treeMode &&
        mode === "indent" &&
        c.id === treeColId &&
        idField &&
        typeof cell === "string"
      ) {
        const id = (r as Record<string, unknown>)[idField] as string | number;
        const depth = grid!.getTreeDepth(id) ?? 0;
        cell = indentStr.repeat(depth) + cell;
      }
      out.push(cell);
    }
    return out;
  });
  return [header, ...body];
}

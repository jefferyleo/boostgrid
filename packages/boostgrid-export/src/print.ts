import type { Boostgrid, Column, Row } from "boostgrid";
import type { TreeExport } from "./index.js";

interface TreeOpts {
  treeExport: TreeExport;
  treeIndentString: string;
}

/**
 * Open a sibling window with a print-styled HTML snapshot of the supplied
 * rows, then call `window.print()`. The opened window auto-closes on
 * `afterprint`. Falls back to `console.warn` when popups are blocked —
 * we never throw, since print is a "nice to have" UX.
 */
export function exportPrint<TRow extends Row>(
  grid: Boostgrid<TRow>,
  rows: TRow[],
  title = "Print",
  _treeOpts?: TreeOpts,
): void {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    // eslint-disable-next-line no-console
    console.warn("boostgrid-export: print window was blocked by the browser.");
    return;
  }
  w.document.open();
  w.document.write(buildPrintHtml(grid.columns, rows, title));
  w.document.close();

  // Wait for layout, then trigger print. afterprint cleans up.
  const onAfter = () => { try { w.close(); } catch { /* ignore */ } };
  w.addEventListener("afterprint", onAfter, { once: true });
  // Some browsers (Safari) don't fire load reliably for a doc written via
  // document.write; queue with rAF instead.
  w.requestAnimationFrame(() => w.print());
}

function buildPrintHtml<TRow extends Row>(
  cols: Column<TRow>[],
  rows: TRow[],
  title: string,
): string {
  const visible = cols.filter((c) => c.visible);
  const ths = visible.map((c) => `<th>${escapeHtml(c.text)}</th>`).join("");
  const trs = rows.map((r) => {
    const tds = visible.map((c) => {
      const v = (r as Record<string, unknown>)[c.id];
      // Use formatter output if present (HTML allowed), else converter.to text.
      const cell = c.formatter ? c.formatter(c, r) : escapeHtml(c.converter.to(v));
      return `<td>${cell}</td>`;
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #222; }
    h1 { font-size: 16pt; margin: 0 0 0.75rem; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th, td { border: 1px solid #aaa; padding: 4pt 6pt; text-align: left; vertical-align: top; }
    thead th { background: #f1f1f1; font-weight: 600; }
    tbody tr:nth-child(even) td { background: #fafafa; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

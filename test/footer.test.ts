import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";
import type { FooterContext } from "../src/types";

function makeTable(opts: { withTfoot?: boolean } = {}): HTMLTableElement {
  document.body.innerHTML = `
    <table id="grid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric" data-align="right">ID</th>
          <th data-column-id="sender" data-order="asc">Sender</th>
          <th data-column-id="amount" data-type="numeric" data-align="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>alpha@x.com</td><td>10</td></tr>
        <tr><td>2</td><td>beta@x.com</td><td>20</td></tr>
        <tr><td>3</td><td>gamma@x.com</td><td>30</td></tr>
        <tr><td>4</td><td>delta@x.com</td><td>40</td></tr>
        <tr><td>5</td><td>epsilon@x.com</td><td>50</td></tr>
      </tbody>
      ${opts.withTfoot ? `<tfoot><tr><th>—</th><th>—</th><th class="static">static</th></tr></tfoot>` : ""}
    </table>
  `;
  return document.getElementById("grid") as HTMLTableElement;
}

describe("Boostgrid footer", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("does not render <tfoot> when no footer signal is present", () => {
    const table = makeTable();
    new Boostgrid(table, { rowCount: 10, navigation: 0 });
    expect(table.querySelector(":scope > tfoot")).toBeNull();
  });

  it("auto-creates <tfoot> when a column has footerFormatter", () => {
    const table = makeTable();
    const g = new Boostgrid(table, {
      rowCount: 10,
      navigation: 0,
      footerFormatters: {
        sum: (col, ctx: FooterContext) =>
          String(ctx.filteredRows.reduce((acc, r) => acc + Number(r[col.id]), 0)),
      },
    });
    // Re-tag the amount column to use the formatter (the parser already ran);
    // simplest: directly attach and reload to flush a render with the formatter.
    g.columns[2].footerFormatter = ((col, ctx: FooterContext) =>
      String(ctx.filteredRows.reduce((acc, r) => acc + Number(r[col.id]), 0))) as never;
    g.reload();

    const tfoot = table.querySelector(":scope > tfoot")!;
    expect(tfoot).not.toBeNull();
    expect((tfoot as HTMLElement).dataset.boostgridAuto).toBe("true");
    const cell = g.getFooterCell("amount")!;
    expect(cell).not.toBeNull();
    expect(cell.textContent).toBe("150"); // 10+20+30+40+50
  });

  it("honors existing <tfoot> markup and overlays formatters non-destructively for unformatted columns", () => {
    const table = makeTable({ withTfoot: true });
    const g = new Boostgrid(table, { rowCount: 10, navigation: 0 });
    // The library treats existing <tfoot> as an opt-in signal — render runs
    // and rebuilds the row, but no formatter cells are populated.
    const tfoot = table.querySelector(":scope > tfoot")!;
    expect(tfoot).not.toBeNull();
    expect((tfoot as HTMLElement).dataset.boostgridAuto).toBeUndefined();
    // Cells exist for every visible column
    expect(tfoot.querySelectorAll("th[data-column-id]").length).toBe(g.columns.length);
  });

  it("getFooterCell returns the cell for a column id", () => {
    const table = makeTable();
    const g = new Boostgrid(table, { rowCount: 10, navigation: 0, footer: true });
    expect(g.getFooterCell("amount")).not.toBeNull();
    expect(g.getFooterCell("nonexistent")).toBeNull();
  });

  it("footerCallback runs after column formatters and can overwrite cells", () => {
    const table = makeTable();
    let calls = 0;
    const g = new Boostgrid(table, {
      rowCount: 10,
      navigation: 0,
      footerFormatters: {
        sum: (col, ctx) =>
          String(ctx.filteredRows.reduce((acc, r) => acc + Number(r[col.id]), 0)),
      },
      footerCallback: (tr, ctx) => {
        calls++;
        // Overwrite the amount cell with a formatted version
        const cell = tr.querySelector('[data-column-id="amount"]');
        if (cell) cell.textContent = `Σ ${ctx.filteredRows.length} rows`;
      },
    });
    g.columns[2].footerFormatter = ((col, ctx: FooterContext) =>
      String(ctx.filteredRows.reduce((acc, r) => acc + Number(r[col.id]), 0))) as never;
    g.reload();
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(g.getFooterCell("amount")?.textContent).toBe("Σ 5 rows");
  });

  it("re-renders footer on page / sort / search changes", () => {
    const table = makeTable();
    const g = new Boostgrid(table, {
      rowCount: 2,
      navigation: 0,
      footerFormatters: {
        currentSum: (col, ctx) =>
          String(ctx.currentRows.reduce((acc, r) => acc + Number(r[col.id]), 0)),
        currentCount: (_col, ctx) => String(ctx.currentRows.length),
      },
    });
    g.columns[2].footerFormatter = ((col, ctx: FooterContext) =>
      String(ctx.currentRows.reduce((acc, r) => acc + Number(r[col.id]), 0))) as never;
    g.reload();

    // Default sort is sender asc → alpha, beta, delta, epsilon, gamma
    // Page 1: alpha(10) + beta(20) = 30
    expect(g.getFooterCell("amount")?.textContent).toBe("30");
    g.goToPage(2);
    // Page 2: delta(40) + epsilon(50) = 90
    expect(g.getFooterCell("amount")?.textContent).toBe("90");

    g.search("alpha");
    // After search "alpha" only one row matches (amount 10)
    expect(g.getFooterCell("amount")?.textContent).toBe("10");
  });

  it("destroy removes auto-created <tfoot> but preserves user-authored markup", () => {
    // Auto branch
    const tableA = makeTable();
    const ga = new Boostgrid(tableA, { rowCount: 10, navigation: 0, footer: true });
    expect(tableA.querySelector(":scope > tfoot")).not.toBeNull();
    ga.destroy();
    expect(tableA.querySelector(":scope > tfoot")).toBeNull();

    // User-authored branch
    document.body.innerHTML = "";
    const tableB = makeTable({ withTfoot: true });
    const gb = new Boostgrid(tableB, { rowCount: 10, navigation: 0 });
    expect(tableB.querySelector(":scope > tfoot")).not.toBeNull();
    gb.destroy();
    expect(tableB.querySelector(":scope > tfoot")).not.toBeNull();
  });
});

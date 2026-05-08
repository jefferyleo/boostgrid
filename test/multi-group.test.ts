import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="mgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="status">Status</th>
          <th data-column-id="region">Region</th>
          <th data-column-id="amount" data-type="numeric">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>active</td><td>us</td><td>10</td></tr>
        <tr><td>2</td><td>active</td><td>us</td><td>20</td></tr>
        <tr><td>3</td><td>active</td><td>eu</td><td>30</td></tr>
        <tr><td>4</td><td>pending</td><td>us</td><td>40</td></tr>
        <tr><td>5</td><td>pending</td><td>eu</td><td>50</td></tr>
        <tr><td>6</td><td>pending</td><td>eu</td><td>60</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("mgrid") as HTMLTableElement;
}

describe("Boostgrid multi-level grouping", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

  it("groupBy: ['status'] is equivalent to groupBy: 'status'", () => {
    const a = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, groupBy: "status" });
    const aHtml = a.element.querySelector("tbody")!.innerHTML;
    a.destroy();
    document.body.innerHTML = "";
    const b = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, groupBy: ["status"] });
    const bHtml = b.element.querySelector("tbody")!.innerHTML;
    b.destroy();
    expect(aHtml).toBe(bHtml);
  });

  it("groupBy: ['status', 'region'] produces nested headers", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      groupBy: ["status", "region"],
    });
    const headers = g.element.querySelectorAll<HTMLTableRowElement>("tr.boostgrid-group-row");
    // 2 statuses × (1-2 regions each) = 2 outer + 4 inner = 6 headers total
    // active{us,eu} + pending{us,eu} = 2 + 4 = 6 (with 2 outer + 4 inner)
    const depths = Array.from(headers).map((h) => h.getAttribute("data-depth"));
    // Expect at least one depth=0 and at least one depth=1
    expect(depths).toContain("0");
    expect(depths).toContain("1");
    // Outer groups are 'active' and 'pending'
    const outer = depths.filter((d) => d === "0");
    expect(outer.length).toBe(2);
    g.destroy();
  });

  it("aggregator key 'amount@1' runs only at depth 1", () => {
    const seen: Array<{ depth: number; sum: number }> = [];
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      groupBy: ["status", "region"],
      groupAggregators: {
        "amount@1": (_col, ctx) => {
          const sum = ctx.rows.reduce((s, r) => s + Number(r.amount), 0);
          seen.push({ depth: ctx.depth, sum });
          return `<strong>${sum}</strong>`;
        },
      },
    });
    // No depth-0 footer should fire (no key matched), only depth-1
    expect(seen.every((e) => e.depth === 1)).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    g.destroy();
  });

  it("toggleGroup('active//us') collapses just that nested bucket", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      groupBy: ["status", "region"],
    });
    g.toggleGroup("active//us");
    const dataRows = g.element.querySelectorAll(
      "tbody tr:not(.boostgrid-group-row):not(.boostgrid-group-footer)",
    );
    // active//us had 2 rows; after collapse the body should be missing those
    // 2 rows but still show active//eu (1) + pending//us (1) + pending//eu (2) = 4
    expect(dataRows.length).toBe(4);
    g.destroy();
  });

  it("collapsed depth-1 path round-trips through stateSave", () => {
    const a = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0,
      groupBy: ["status", "region"],
      stateSave: true, stateKey: "round4-mg",
    });
    a.toggleGroup("active//us");
    a.destroy();

    document.body.innerHTML = "";
    const b = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0,
      groupBy: ["status", "region"],
      stateSave: true, stateKey: "round4-mg",
    });
    expect(b.isGroupExpanded("active//us")).toBe(false);
    expect(b.isGroupExpanded("pending//eu")).toBe(true);
    b.destroy();
  });

  it("groupBy: ['status', 'status'] dedups silently to ['status']", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0,
      groupBy: ["status", "status"],
    });
    const headers = g.element.querySelectorAll<HTMLTableRowElement>("tr.boostgrid-group-row");
    // After dedup, only depth-0 headers exist
    const depths = new Set(Array.from(headers).map((h) => h.getAttribute("data-depth")));
    expect(depths.has("0")).toBe(true);
    expect(depths.has("1")).toBe(false);
    g.destroy();
  });

  it("groupBy: [] (empty) renders flat with no group headers", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0,
      groupBy: [] as string[],
    });
    const headers = g.element.querySelectorAll("tr.boostgrid-group-row");
    expect(headers.length).toBe(0);
    g.destroy();
  });

  it("groupSubtotalsOnTop emits the footer between header and rows", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0,
      groupBy: "status",
      groupSubtotalsOnTop: true,
      groupAggregators: {
        amount: (_col, ctx) =>
          `<strong>$${ctx.rows.reduce((s, r) => s + Number(r.amount || 0), 0)}</strong>`,
      },
    });
    const trs = Array.from(
      g.element.querySelectorAll<HTMLTableRowElement>("tbody > tr"),
    );
    // Find the "active" group's header and the first body row that follows.
    const headerIdx = trs.findIndex(
      (tr) =>
        tr.classList.contains("boostgrid-group-row") &&
        tr.textContent?.includes("active"),
    );
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    // Next row after the header should be the FOOTER (subtotal-on-top).
    const next = trs[headerIdx + 1];
    expect(next.classList.contains("boostgrid-group-footer")).toBe(true);
    g.destroy();
  });

  it("default emission order keeps the footer after the rows", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0,
      groupBy: "status",
      groupAggregators: {
        amount: (_col, ctx) =>
          `<strong>${ctx.rows.length}</strong>`,
      },
    });
    const trs = Array.from(
      g.element.querySelectorAll<HTMLTableRowElement>("tbody > tr"),
    );
    const headerIdx = trs.findIndex(
      (tr) =>
        tr.classList.contains("boostgrid-group-row") &&
        tr.textContent?.includes("active"),
    );
    // Next row is a regular body row (the footer comes later).
    const next = trs[headerIdx + 1];
    expect(next.classList.contains("boostgrid-group-row")).toBe(false);
    expect(next.classList.contains("boostgrid-group-footer")).toBe(false);
    g.destroy();
  });
});

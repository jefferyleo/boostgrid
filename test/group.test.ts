import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="ggrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="status" data-order="asc">Status</th>
          <th data-column-id="amount" data-type="numeric">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>open</td><td>10</td></tr>
        <tr><td>2</td><td>closed</td><td>50</td></tr>
        <tr><td>3</td><td>open</td><td>20</td></tr>
        <tr><td>4</td><td>closed</td><td>40</td></tr>
        <tr><td>5</td><td>open</td><td>30</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("ggrid") as HTMLTableElement;
}

describe("Boostgrid row grouping", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("renders a header row per group with the count", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      groupBy: "status",
    });
    const headers = g.element.querySelectorAll("tr.boostgrid-group-row");
    expect(headers.length).toBe(2); // closed, open (sender asc → "closed" first)
    // Format: "<label> (<count>)"
    expect(headers[0].textContent).toContain("closed");
    expect(headers[0].textContent).toContain("(2)");
    expect(headers[1].textContent).toContain("open");
    expect(headers[1].textContent).toContain("(3)");
    g.destroy();
  });

  it("collapsing a group hides its member rows", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      groupBy: "status",
    });
    const headerOpen = g.element.querySelectorAll<HTMLTableRowElement>("tr.boostgrid-group-row")[1];
    headerOpen.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // After collapse, only "closed" group's 2 rows render
    const dataRows = g.element.querySelectorAll("tbody tr:not(.boostgrid-group-row):not(.boostgrid-group-footer)");
    expect(dataRows.length).toBe(2);
    g.destroy();
  });

  it("groupAggregators produce a footer row only when they return non-empty strings", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      groupBy: "status",
      groupAggregators: {
        amount: (_col, ctx) =>
          `<strong>${ctx.rows.reduce((s, r) => s + Number(r.amount), 0)}</strong>`,
      },
    });
    const footers = g.element.querySelectorAll("tr.boostgrid-group-footer");
    expect(footers.length).toBe(2);
    // closed group: 50 + 40 = 90
    expect(footers[0].querySelector('[data-column-id="amount"]')?.textContent).toBe("90");
    // open group: 10 + 20 + 30 = 60
    expect(footers[1].querySelector('[data-column-id="amount"]')?.textContent).toBe("60");
    g.destroy();
  });

  it("respects groupExpanded: 'none' on initial render", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      groupBy: "status",
      groupExpanded: "none",
    });
    const dataRows = g.element.querySelectorAll("tbody tr:not(.boostgrid-group-row):not(.boostgrid-group-footer)");
    expect(dataRows.length).toBe(0);
    g.destroy();
  });

  it("ignores a non-existent groupBy column id (falls back to flat)", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      groupBy: "doesnotexist",
    });
    const headers = g.element.querySelectorAll("tr.boostgrid-group-row");
    expect(headers.length).toBe(0);
    const dataRows = g.element.querySelectorAll("tbody tr");
    expect(dataRows.length).toBe(5);
    g.destroy();
  });
});

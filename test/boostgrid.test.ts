import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="grid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric" data-align="right">ID</th>
          <th data-column-id="sender" data-order="asc">Sender</th>
          <th data-column-id="received">Received</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>alpha@x.com</td><td>2024-01-01</td></tr>
        <tr><td>2</td><td>beta@x.com</td><td>2024-02-02</td></tr>
        <tr><td>3</td><td>gamma@x.com</td><td>2024-03-03</td></tr>
        <tr><td>4</td><td>delta@x.com</td><td>2024-04-04</td></tr>
        <tr><td>5</td><td>epsilon@x.com</td><td>2024-05-05</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("grid") as HTMLTableElement;
}

describe("Boostgrid", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("parses columns and rows from the table", () => {
    const g = new Boostgrid(makeTable(), { rowCount: 10 });
    expect(g.columns.map((c) => c.id)).toEqual(["id", "sender", "received"]);
    expect(g.identifier).toBe("id");
    expect(g.getTotalRowCount()).toBe(5);
  });

  it("paginates", () => {
    const g = new Boostgrid(makeTable(), { rowCount: 2, navigation: 0 });
    expect(g.getTotalPageCount()).toBe(3);
    expect(g.getCurrentRows()).toHaveLength(2);
    g.goToPage(2);
    expect(g.getCurrentPage()).toBe(2);
    g.goToPage(3);
    expect(g.getCurrentRows()).toHaveLength(1);
  });

  it("sorts ascending by default and toggles via sort()", () => {
    const g = new Boostgrid(makeTable(), { rowCount: 10 });
    // initial sort on sender asc
    expect((g.getCurrentRows()[0] as Record<string, unknown>).sender).toBe("alpha@x.com");
    g.sort({ id: "desc" });
    expect((g.getCurrentRows()[0] as Record<string, unknown>).id).toBe(5);
  });

  it("searches and clears search", () => {
    const g = new Boostgrid(makeTable(), { rowCount: 10 });
    g.search("alpha");
    expect(g.getCurrentRows()).toHaveLength(1);
    g.search();
    expect(g.getCurrentRows()).toHaveLength(5);
  });

  it("appends and removes rows by id", () => {
    const g = new Boostgrid(makeTable(), { rowCount: 10 });
    g.append([{ id: 99, sender: "zzz@x.com", received: "2024-12-01" }]);
    expect(g.getTotalRowCount()).toBe(6);
    g.remove([99]);
    expect(g.getTotalRowCount()).toBe(5);
  });

  it("clear empties the grid", () => {
    const g = new Boostgrid(makeTable(), { rowCount: 10 });
    g.clear();
    expect(g.getTotalRowCount()).toBe(0);
    expect(g.getCurrentRows()).toEqual([]);
  });

  it("selects rows by id (single)", () => {
    const g = new Boostgrid(makeTable(), { selection: true, keepSelection: true });
    g.select([2]);
    expect(g.getSelectedRows()).toEqual([2]);
    g.deselect([2]);
    expect(g.getSelectedRows()).toEqual([]);
  });

  it("multi-select stays within currentRows", () => {
    const g = new Boostgrid(makeTable(), { selection: true, multiSelect: true, keepSelection: true });
    g.select([1, 3, 5]);
    expect(g.getSelectedRows().sort()).toEqual([1, 3, 5]);
  });

  it("destroy removes added chrome and unwraps the table", () => {
    const table = makeTable();
    const parent = table.parentElement!;
    const g = new Boostgrid(table);
    expect(parent.querySelector(".boostgrid")).toBeTruthy();
    g.destroy();
    expect(parent.querySelector(".boostgrid")).toBeNull();
    expect(parent.contains(table)).toBe(true);
  });

  it("emits boostgrid:loaded after data load", () => {
    const table = makeTable();
    let count = 0;
    table.addEventListener("boostgrid:loaded", () => { count++; });
    const g = new Boostgrid(table);
    g.search("alpha");
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

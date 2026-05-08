import { describe, it, expect, beforeEach, vi } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="dgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="sender">Sender</th>
          <th data-column-id="subject">Subject</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>alpha@x.com</td><td>Welcome</td></tr>
        <tr><td>2</td><td>beta@x.com</td><td>Hello</td></tr>
        <tr><td>3</td><td>gamma@x.com</td><td>Notes</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("dgrid") as HTMLTableElement;
}

describe("Boostgrid row detail", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

  it("renders the detail chevron cell only when rowDetail is set", () => {
    const off = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    expect(off.element.querySelectorAll(".bg-detail-cell").length).toBe(0);
    off.destroy();
    document.body.innerHTML = "";

    const on = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      rowDetail: (row) => `<div>Detail for ${row.id}</div>`,
    });
    // 1 in thead + 1 per body row (3 rows)
    const cells = on.element.querySelectorAll(".bg-detail-cell");
    expect(cells.length).toBe(4);
    // No detail panels open yet (default "none")
    expect(on.element.querySelectorAll(".boostgrid-detail-row").length).toBe(0);
    on.destroy();
  });

  it("toggleRowDetail opens the panel under the row", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      rowDetail: (row) => `<p data-test="detail-${row.id}">Hello ${row.sender}</p>`,
    });
    g.toggleRowDetail(2);
    const panel = g.element.querySelector('.boostgrid-detail-row[data-row-id="2"]');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('[data-test="detail-2"]')).not.toBeNull();
    expect(panel?.textContent).toContain("beta@x.com");
    g.destroy();
  });

  it("clicking the chevron fires toggle-detail and opens the panel", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      rowDetail: (row) => `<span>row ${row.id}</span>`,
    });
    const caret = g.element.querySelector<HTMLElement>(
      'tbody > tr[data-row-id="1"] .boostgrid-detail-caret',
    );
    expect(caret).not.toBeNull();
    caret!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(g.isRowDetailExpanded(1)).toBe(true);
    expect(g.element.querySelector('.boostgrid-detail-row[data-row-id="1"]')).not.toBeNull();
    g.destroy();
  });

  it("rowDetailExpanded: 'all' opens every panel by default", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      rowDetail: (row) => `<i>row ${row.id}</i>`,
      rowDetailExpanded: "all",
    });
    expect(g.element.querySelectorAll(".boostgrid-detail-row").length).toBe(3);
    g.collapseAllRowDetails();
    expect(g.element.querySelectorAll(".boostgrid-detail-row").length).toBe(0);
    g.destroy();
  });

  it("returning null from rowDetail skips the panel for that row", () => {
    const detail = vi.fn((row: { id: number }) => row.id === 2 ? "<p>only 2</p>" : null);
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      rowDetail: detail,
      rowDetailExpanded: "all",
    });
    // Only id=2 should produce a panel even though all are "expanded"
    const panels = g.element.querySelectorAll(".boostgrid-detail-row");
    expect(panels.length).toBe(1);
    expect(panels[0].getAttribute("data-row-id")).toBe("2");
    g.destroy();
  });

  it("detail panel cell colspan covers selection + detail + visible columns", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      selection: true,
      multiSelect: true,
      rowDetail: () => "<p>x</p>",
      rowDetailExpanded: "all",
    });
    const td = g.element.querySelector<HTMLTableCellElement>(
      ".boostgrid-detail-row .boostgrid-detail-cell",
    );
    // 3 visible columns + selection + detail = 5
    expect(td?.getAttribute("colspan")).toBe("5");
    g.destroy();
  });
});

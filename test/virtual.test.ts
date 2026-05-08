import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";

function make1000RowTable(rowCount = 1000): HTMLTableElement {
  const rows: string[] = [];
  for (let i = 1; i <= rowCount; i++) {
    rows.push(`<tr><td>${i}</td><td>user${i}@x.com</td><td>Subject ${i}</td></tr>`);
  }
  document.body.innerHTML = `
    <table id="vgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="sender">Sender</th>
          <th data-column-id="subject">Subject</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
  return document.getElementById("vgrid") as HTMLTableElement;
}

describe("Boostgrid virtual scroll", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("does nothing when virtualScroll is off (rendering all rows on the page)", () => {
    const g = new Boostgrid(make1000RowTable(50), { rowCount: -1, navigation: 0 });
    expect(g.virtualWindow).toBeNull();
    const tbody = g.element.querySelector("tbody")!;
    // No pad rows, no virtual class
    expect(tbody.querySelectorAll("tr.boostgrid-pad").length).toBe(0);
    expect(g.element.parentElement?.classList.contains("boostgrid--virtual")).toBe(false);
    g.destroy();
  });

  it("forces rowsPerPage to -1 when virtualScroll is on", () => {
    const g = new Boostgrid(make1000RowTable(100), {
      virtualScroll: true,
      rowCount: 25,    // explicitly nonsense in virtual mode; should be ignored
      rowHeight: 32,
      overscan: 5,
      navigation: 0,
    });
    expect(g.getRowCount()).toBe(-1);
    g.destroy();
  });

  it("renders a windowed slice + pad rows when virtualScroll is on", () => {
    const g = new Boostgrid(make1000RowTable(1000), {
      virtualScroll: true,
      rowHeight: 32,
      overscan: 5,
      navigation: 0,
    });
    const tbody = g.element.querySelector("tbody")!;
    const pads = tbody.querySelectorAll("tr.boostgrid-pad");
    // We're at scrollTop = 0, so window starts at 0 → padTop is 0 → only padBottom row exists
    expect(pads.length).toBeGreaterThanOrEqual(1);

    const renderedDataRows = tbody.querySelectorAll("tr:not(.boostgrid-pad)");
    expect(renderedDataRows.length).toBeLessThan(1000);
    expect(renderedDataRows.length).toBeGreaterThan(0);

    expect(g.virtualWindow).not.toBeNull();
    expect(g.virtualWindow!.start).toBe(0);
    g.destroy();
  });

  it("pad heights sum to (total - rendered) * rowHeight", () => {
    const g = new Boostgrid(make1000RowTable(1000), {
      virtualScroll: true,
      rowHeight: 32,
      overscan: 5,
      navigation: 0,
    });
    const win = g.virtualWindow!;
    const renderedRows = win.end - win.start;
    expect(win.padTop + win.padBottom).toBe((1000 - renderedRows) * 32);
    g.destroy();
  });

  it("destroy unmounts the virtual scroll listener and removes the marker class", () => {
    const table = make1000RowTable(100);
    const g = new Boostgrid(table, {
      virtualScroll: true,
      rowHeight: 32,
      overscan: 5,
      navigation: 0,
    });
    const wrapper = table.parentElement!;
    expect(wrapper.classList.contains("boostgrid--virtual")).toBe(true);
    g.destroy();
    // After destroy the wrapper has been removed; verify the class is gone from the DOM tree
    expect(document.querySelector(".boostgrid--virtual")).toBeNull();
  });
});

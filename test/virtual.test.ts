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

describe("Boostgrid virtual scroll: element pool", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  function dataRows(table: HTMLTableElement): HTMLTableRowElement[] {
    const tbody = table.querySelector("tbody")!;
    return Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr:not(.boostgrid-pad)"));
  }

  it("preserves tr identity across small scrolls (rows are recycled, not recreated)", () => {
    const g = new Boostgrid(make1000RowTable(1000), {
      virtualScroll: true, rowHeight: 32, overscan: 5, navigation: 0,
    });
    const before = dataRows(g.element);
    expect(before.length).toBeGreaterThan(0);
    g.scrollToRow(3);
    const after = dataRows(g.element);
    // The two arrays should overlap heavily — only a few rows scrolled out
    // of the window, so most <tr> references are the same objects.
    const shared = after.filter((tr) => before.includes(tr)).length;
    expect(shared).toBeGreaterThan(before.length - 10);
    g.destroy();
  });

  it("pool size matches window size on initial render", () => {
    const g = new Boostgrid(make1000RowTable(1000), {
      virtualScroll: true, rowHeight: 32, overscan: 5, navigation: 0,
    });
    const win = g.virtualWindow!;
    expect(dataRows(g.element).length).toBe(win.end - win.start);
    // Rerender with same window should keep identities stable.
    const before = dataRows(g.element);
    g.rerenderBody();
    const after = dataRows(g.element);
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBe(before[i]);
    }
    g.destroy();
  });

  it("pool shrinks when the dataset narrows below the window capacity", () => {
    const g = new Boostgrid(make1000RowTable(1000), {
      virtualScroll: true, rowHeight: 32, overscan: 5, navigation: 0,
    });
    const initialCount = dataRows(g.element).length;
    g.clear();
    g.append(Array.from({ length: 5 }, (_, i) => ({
      id: i, sender: `s${i}@x`, subject: `Subject ${i}`,
    })));
    const newCount = dataRows(g.element).length;
    expect(newCount).toBeLessThan(initialCount);
    expect(newCount).toBeLessThanOrEqual(5);
    g.destroy();
  });

  it("scrollToRow updates virtualWindow and tbody.scrollTop", () => {
    const g = new Boostgrid(make1000RowTable(1000), {
      virtualScroll: true, rowHeight: 32, overscan: 5, navigation: 0,
    });
    const tbody = g.element.querySelector("tbody")!;
    const ret = g.scrollToRow(500);
    expect(ret).toBe(g);
    expect(tbody.scrollTop).toBe(500 * 32);
    const win = g.virtualWindow!;
    expect(win.start).toBeLessThanOrEqual(500);
    expect(win.end).toBeGreaterThan(500);
    g.destroy();
  });

  it("scrollToRow is a no-op when virtualScroll is off", () => {
    const g = new Boostgrid(make1000RowTable(50), { rowCount: -1, navigation: 0 });
    const ret = g.scrollToRow(10);
    expect(ret).toBe(g);
    expect(g.virtualWindow).toBeNull();
    g.destroy();
  });

  it("scrollToRow clamps out-of-range indices", () => {
    const g = new Boostgrid(make1000RowTable(1000), {
      virtualScroll: true, rowHeight: 32, overscan: 5, navigation: 0,
    });
    const tbody = g.element.querySelector("tbody")!;
    g.scrollToRow(-5);
    expect(tbody.scrollTop).toBe(0);
    g.scrollToRow(99999);
    expect(tbody.scrollTop).toBe(999 * 32);
    g.destroy();
  });

  it("row-selection class is reapplied to recycled rows", () => {
    const g = new Boostgrid(make1000RowTable(1000), {
      virtualScroll: true, rowHeight: 32, overscan: 5, navigation: 0,
      selection: true, multiSelect: true,
    });
    g.select([10]);
    // Scroll row 10 out then back in — the row may end up in a recycled <tr>.
    g.scrollToRow(500);
    g.scrollToRow(10);
    const targetRow = g.element.querySelector<HTMLTableRowElement>('tbody > tr[data-row-id="10"]');
    expect(targetRow).not.toBeNull();
    expect(targetRow!.classList.contains("table-active")).toBe(true);
    const cb = targetRow!.querySelector<HTMLInputElement>("input.bg-select-row");
    expect(cb!.checked).toBe(true);
    g.destroy();
  });

  it("preserves tbody pad row identity across recycles (pads are not recreated)", () => {
    const g = new Boostgrid(make1000RowTable(1000), {
      virtualScroll: true, rowHeight: 32, overscan: 5, navigation: 0,
    });
    const tbody = g.element.querySelector("tbody")!;
    const firstPadBefore = tbody.firstElementChild;
    const lastPadBefore = tbody.lastElementChild;
    g.scrollToRow(200);
    const firstPadAfter = tbody.firstElementChild;
    const lastPadAfter = tbody.lastElementChild;
    expect(firstPadAfter).toBe(firstPadBefore);
    expect(lastPadAfter).toBe(lastPadBefore);
    g.destroy();
  });

  it("pad heights are updated to reflect the scrolled-to window", () => {
    const g = new Boostgrid(make1000RowTable(1000), {
      virtualScroll: true, rowHeight: 32, overscan: 5, navigation: 0,
    });
    g.scrollToRow(400);
    const win = g.virtualWindow!;
    const tbody = g.element.querySelector("tbody")!;
    const topPad = tbody.firstElementChild as HTMLElement;
    const bottomPad = tbody.lastElementChild as HTMLElement;
    expect(topPad.style.height).toBe(`${win.padTop}px`);
    expect(bottomPad.style.height).toBe(`${win.padBottom}px`);
    // And the pad heights still sum to (total - rendered) * rowHeight.
    expect(win.padTop + win.padBottom).toBe((1000 - (win.end - win.start)) * 32);
    g.destroy();
  });
});

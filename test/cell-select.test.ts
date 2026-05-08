import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";
import { rangeToTsv } from "../src/render/cell-select";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="csgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name">Name</th>
          <th data-column-id="email">Email</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>Alpha</td><td>a@x.com</td></tr>
        <tr><td>2</td><td>Beta</td><td>b@x.com</td></tr>
        <tr><td>3</td><td>Gamma</td><td>g@x.com</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("csgrid") as HTMLTableElement;
}

describe("Boostgrid cell selection", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("does not bind listeners when cellSelection is off", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    const td = g.element.querySelector<HTMLElement>('tbody > tr:first-child > td[data-column-id="name"]')!;
    td.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    expect(g.element.querySelectorAll(".boostgrid-cell-selected").length).toBe(0);
    g.destroy();
  });

  it("mousedown on a cell highlights it as a 1x1 range", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, cellSelection: true });
    const td = g.element.querySelector<HTMLElement>('tbody > tr:first-child > td[data-column-id="name"]')!;
    td.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    expect(td.classList.contains("boostgrid-cell-selected")).toBe(true);
    expect(g.element.querySelectorAll(".boostgrid-cell-selected").length).toBe(1);
    g.destroy();
  });

  it("drag from (0, name) to (2, email) fills a 3x2 rectangle", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, cellSelection: true });
    const start = g.element.querySelector<HTMLElement>('tbody > tr:first-child > td[data-column-id="name"]')!;
    const end   = g.element.querySelector<HTMLElement>('tbody > tr:last-child > td[data-column-id="email"]')!;
    start.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    end.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent("mouseup", {}));
    // 3 rows × 2 cols = 6 cells
    expect(g.element.querySelectorAll(".boostgrid-cell-selected").length).toBe(6);
    g.destroy();
  });

  it("copy event writes TSV to clipboardData", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, cellSelection: true });
    const start = g.element.querySelector<HTMLElement>('tbody > tr:first-child > td[data-column-id="name"]')!;
    const end   = g.element.querySelector<HTMLElement>('tbody > tr:nth-child(2) > td[data-column-id="email"]')!;
    start.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    end.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent("mouseup", {}));

    // Construct a fake clipboard event because jsdom's ClipboardEvent is sparse.
    const writes: Record<string, string> = {};
    const evt = new Event("copy", { bubbles: true, cancelable: true }) as Event & { clipboardData: { setData: (k: string, v: string) => void } };
    Object.defineProperty(evt, "clipboardData", {
      value: { setData: (k: string, v: string) => { writes[k] = v; } },
      configurable: true,
    });
    // Activate grid focus context — listener checks document.activeElement
    g.element.focus?.();
    document.dispatchEvent(evt);
    expect(writes["text/plain"]).toBe("Alpha\ta@x.com\nBeta\tb@x.com");
    g.destroy();
  });

  it("Escape clears the selection", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, cellSelection: true });
    const td = g.element.querySelector<HTMLElement>('tbody > tr:first-child > td[data-column-id="name"]')!;
    td.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    expect(g.element.querySelectorAll(".boostgrid-cell-selected").length).toBe(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(g.element.querySelectorAll(".boostgrid-cell-selected").length).toBe(0);
    g.destroy();
  });

  it("rangeToTsv pure helper produces TSV with newline-separated rows", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, cellSelection: true });
    const tsv = rangeToTsv(g, { startRow: 0, endRow: 2, startCol: 0, endCol: 2 });
    expect(tsv.split("\n")).toEqual([
      "1\tAlpha\ta@x.com",
      "2\tBeta\tb@x.com",
      "3\tGamma\tg@x.com",
    ]);
    g.destroy();
  });
});

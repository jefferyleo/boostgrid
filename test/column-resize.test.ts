import { describe, it, expect, beforeEach, vi } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="rgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric" data-width="80">ID</th>
          <th data-column-id="sender" data-width="200">Sender</th>
          <th data-column-id="subject" data-width="300">Subject</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>alpha</td><td>x</td></tr>
        <tr><td>2</td><td>beta</td><td>y</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("rgrid") as HTMLTableElement;
}

/** Stub each header's getBoundingClientRect so the resize math has a known
 *  starting width. jsdom doesn't lay out, so the default is `0`. */
function stubHeaderRects(grid: Boostgrid, widthMap: Record<string, number>): void {
  const ths = grid.element.querySelectorAll<HTMLTableCellElement>("thead > tr > th");
  ths.forEach((th) => {
    const id = th.getAttribute("data-column-id") || "";
    const w = widthMap[id] ?? 100;
    Object.defineProperty(th, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0, y: 0, top: 0, left: 0, right: w, bottom: 30, width: w, height: 30,
        toJSON: () => ({}),
      } as DOMRect),
    });
  });
}

describe("Boostgrid column resize", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

  it("commits a new width after mousedown -> mousemove -> mouseup", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    stubHeaderRects(g, { id: 80, sender: 200, subject: 300 });
    const grip = g.element.querySelector<HTMLElement>(
      'thead th[data-column-id="sender"] .boostgrid-resize-grip',
    )!;
    grip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 200 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 250 }));
    document.dispatchEvent(new MouseEvent("mouseup", {}));
    expect(g.columns.find((c) => c.id === "sender")?.width).toBe("250px");
    g.destroy();
  });

  it("clamps below minWidth", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
    });
    g.columns.find((c) => c.id === "subject")!.minWidth = 200;
    stubHeaderRects(g, { id: 80, sender: 200, subject: 300 });
    const grip = g.element.querySelector<HTMLElement>(
      'thead th[data-column-id="subject"] .boostgrid-resize-grip',
    )!;
    grip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 300 }));
    // Drag way to the left
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 50 }));
    document.dispatchEvent(new MouseEvent("mouseup", {}));
    expect(g.columns.find((c) => c.id === "subject")?.width).toBe("200px");
    g.destroy();
  });

  it("fires onColumnResize once on mouseup with the final px", () => {
    const onResize = vi.fn();
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      onColumnResize: onResize,
    });
    stubHeaderRects(g, { id: 80, sender: 200, subject: 300 });
    const grip = g.element.querySelector<HTMLElement>(
      'thead th[data-column-id="id"] .boostgrid-resize-grip',
    )!;
    grip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 80 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 95 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 }));
    document.dispatchEvent(new MouseEvent("mouseup", {}));
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith("id", 100);
    g.destroy();
  });

  it("omits the grip element when columnResize is false", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      columnResize: false,
    });
    const grips = g.element.querySelectorAll(".boostgrid-resize-grip");
    expect(grips.length).toBe(0);
    g.destroy();
  });
});

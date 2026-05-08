import { describe, it, expect, beforeEach, vi } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="cgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric" data-frozen="left" data-width="80">ID</th>
          <th data-column-id="status" data-frozen="left" data-width="100">Status</th>
          <th data-column-id="sender" data-width="200">Sender</th>
          <th data-column-id="subject" data-width="300">Subject</th>
          <th data-column-id="actions" data-frozen="right" data-width="120">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>open</td><td>alpha</td><td>x</td><td>edit</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("cgrid") as HTMLTableElement;
}

/** Stub bounding-rect so dragover X-math has a stable midpoint. */
function stubHeaderRects(grid: Boostgrid): void {
  let left = 0;
  grid.element.querySelectorAll<HTMLTableCellElement>("thead > tr > th").forEach((th) => {
    const w = Number(th.getAttribute("data-width") || 100);
    const right = left + w;
    const myLeft = left;
    Object.defineProperty(th, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: myLeft, y: 0, top: 0, left: myLeft, right, bottom: 30, width: w, height: 30,
        toJSON: () => ({}),
      } as DOMRect),
    });
    left = right;
  });
}

describe("Boostgrid column reorder", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

  it("reorderColumn drops a column at the new position (within same frozen group)", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    expect(g.reorderColumn("subject", "sender", "before")).toBe(true);
    const ids = g.columns.map((c) => c.id);
    expect(ids).toEqual(["id", "status", "subject", "sender", "actions"]);
    g.destroy();
  });

  it("fires onColumnReorder with the new id list", () => {
    const onReorder = vi.fn();
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      onColumnReorder: onReorder,
    });
    g.reorderColumn("sender", "subject", "after");
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["id", "status", "subject", "sender", "actions"]);
    g.destroy();
  });

  it("dragover paints data-drop-side on the target", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    stubHeaderRects(g);
    const senderTh = g.element.querySelector<HTMLElement>('thead th[data-column-id="sender"]')!;
    const subjectTh = g.element.querySelector<HTMLElement>('thead th[data-column-id="subject"]')!;
    // jsdom lacks DragEvent — fake via Event and manually attach clientX/dataTransfer.
    const fakeDrag = (type: string, clientX = 0): Event => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, "clientX", { value: clientX, configurable: true });
      Object.defineProperty(e, "dataTransfer", {
        value: { setData() {}, effectAllowed: "", dropEffect: "" },
        configurable: true,
      });
      return e;
    };
    senderTh.dispatchEvent(fakeDrag("dragstart"));
    // Hover the LEFT half of subject — should mark "before"
    const subjectRect = subjectTh.getBoundingClientRect();
    subjectTh.dispatchEvent(fakeDrag("dragover", subjectRect.left + 10));
    expect(subjectTh.getAttribute("data-drop-side")).toBe("before");
    // Then a dragleave clears it
    subjectTh.dispatchEvent(fakeDrag("dragleave"));
    expect(subjectTh.getAttribute("data-drop-side")).toBeNull();
    g.destroy();
  });

  it("frozen-left dropped onto non-frozen target snaps to end of the frozen-left run", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    // Drag "id" (left-frozen) onto "subject" (non-frozen)
    g.reorderColumn("id", "subject", "after");
    const ids = g.columns.map((c) => c.id);
    // id should land at the end of the left-frozen prefix (after status),
    // not next to subject.
    expect(ids).toEqual(["status", "id", "sender", "subject", "actions"]);
    g.destroy();
  });

  it("columnReorder: false omits draggable=true on header cells", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 0,
      columnReorder: false,
    });
    const draggable = g.element.querySelectorAll('thead th[draggable="true"]');
    expect(draggable.length).toBe(0);
    g.destroy();
  });
});

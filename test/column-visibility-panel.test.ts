import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="vgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="sender">Sender</th>
          <th data-column-id="subject">Subject</th>
          <th data-column-id="status">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>alpha</td><td>x</td><td>open</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("vgrid") as HTMLTableElement;
}

describe("Boostgrid column-visibility panel", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

  it("filter-columns input narrows the visible items by text substring", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 1 });
    const search = g["rootContainer" as keyof typeof g] as HTMLElement;
    // Find filter-columns input (it lives inside the toolbar dropdown menu).
    const input = search.querySelector<HTMLInputElement>('[data-bg-action="filter-columns"]')!;
    input.value = "send";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const items = search.querySelectorAll<HTMLElement>(".boostgrid-columns-item");
    const sender = Array.from(items).find((i) => i.getAttribute("data-column-id") === "sender")!;
    const subject = Array.from(items).find((i) => i.getAttribute("data-column-id") === "subject")!;
    expect(sender.classList.contains("d-none")).toBe(false);
    expect(subject.classList.contains("d-none")).toBe(true);
    g.destroy();
  });

  it("reorder via panel drag mutates grid.columns and persists", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 1,
      stateSave: true,
    });
    const root = g["rootContainer" as keyof typeof g] as HTMLElement;
    const senderItem = root.querySelector<HTMLElement>(
      '.boostgrid-columns-item[data-column-id="sender"]',
    )!;
    const subjectItem = root.querySelector<HTMLElement>(
      '.boostgrid-columns-item[data-column-id="subject"]',
    )!;
    Object.defineProperty(subjectItem, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({ x: 0, y: 100, top: 100, left: 0, right: 200, bottom: 130, width: 200, height: 30, toJSON: () => ({}) } as DOMRect),
    });
    const fakeDrag = (type: string, clientY = 0): Event => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, "clientY", { value: clientY, configurable: true });
      Object.defineProperty(e, "dataTransfer", {
        value: { setData() {}, effectAllowed: "", dropEffect: "" },
        configurable: true,
      });
      return e;
    };
    senderItem.dispatchEvent(fakeDrag("dragstart"));
    // Drop onto top half of subject -> "before"
    subjectItem.dispatchEvent(fakeDrag("dragover", 105));
    subjectItem.dispatchEvent(fakeDrag("drop", 105));
    expect(g.columns.map((c) => c.id)).toEqual(["id", "sender", "subject", "status"]);
    // Persisted columnOrder should reflect the new order
    g.flushState();
    const raw = JSON.parse(localStorage.getItem("boostgrid:vgrid")!);
    expect(raw.columnOrder).toEqual(["id", "sender", "subject", "status"]);
    g.destroy();
  });

  it("Reset to defaults restores baseline order + visibility", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 1 });
    // Mutate: hide subject, reorder
    g.columns.find((c) => c.id === "subject")!.visible = false;
    g.reorderColumn("status", "sender", "before");
    expect(g.columns.find((c) => c.id === "subject")?.visible).toBe(false);
    expect(g.columns.map((c) => c.id)).toEqual(["id", "status", "sender", "subject"]);
    // Click "Reset to defaults"
    g.resetColumnState();
    expect(g.columns.map((c) => c.id)).toEqual(["id", "sender", "subject", "status"]);
    expect(g.columns.find((c) => c.id === "subject")?.visible).toBe(true);
    g.destroy();
  });
});

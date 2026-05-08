import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";
import type { EditCommit } from "../src/types";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="egrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="sender" data-editable="true">Sender</th>
          <th data-column-id="qty" data-type="numeric" data-editable="true" data-edit-type="number">Qty</th>
          <th data-column-id="status" data-editable="true" data-edit-type="select"
              data-edit-options='[{"value":"open","label":"Open"},{"value":"closed","label":"Closed"}]'>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>alpha@x.com</td><td>5</td><td>open</td></tr>
        <tr><td>2</td><td>beta@x.com</td><td>10</td><td>closed</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("egrid") as HTMLTableElement;
}

function dblclickCell(grid: Boostgrid, rowId: string, colId: string): HTMLTableCellElement {
  const td = grid.element.querySelector<HTMLTableCellElement>(
    `tr[data-row-id="${rowId}"] td[data-column-id="${colId}"]`,
  )!;
  td.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  return td;
}

describe("Boostgrid cell edit", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("adds data-editable attr only on editable columns", () => {
    const g = new Boostgrid(makeTable(), { rowCount: 10, navigation: 0 });
    const idCell = g.element.querySelector('td[data-column-id="id"]')!;
    const senderCell = g.element.querySelector('td[data-column-id="sender"]')!;
    expect(idCell.getAttribute("data-editable")).toBeNull();
    expect(senderCell.getAttribute("data-editable")).toBe("true");
    g.destroy();
  });

  it("identifier columns are never editable even with data-editable=true", () => {
    document.body.innerHTML = `
      <table id="g" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true" data-editable="true">ID</th>
          <th data-column-id="sender">Sender</th>
        </tr></thead>
        <tbody><tr><td>1</td><td>alpha</td></tr></tbody>
      </table>
    `;
    const g = new Boostgrid(document.getElementById("g") as HTMLTableElement, { rowCount: 10, navigation: 0 });
    expect(g.columns.find((c) => c.id === "id")?.editable).toBe(false);
    g.destroy();
  });

  it("dblclick swaps an <input> into the cell", () => {
    const g = new Boostgrid(makeTable(), { rowCount: 10, navigation: 0 });
    const td = dblclickCell(g, "1", "sender");
    const input = td.querySelector<HTMLInputElement>("input[data-edit-input]")!;
    expect(input).not.toBeNull();
    expect(input.value).toBe("alpha@x.com");
    g.destroy();
  });

  it("dblclick on a select-type column renders a <select> with options", () => {
    const g = new Boostgrid(makeTable(), { rowCount: 10, navigation: 0 });
    const td = dblclickCell(g, "1", "status");
    const select = td.querySelector<HTMLSelectElement>("select[data-edit-input]")!;
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(2);
    expect(select.value).toBe("open");
    g.destroy();
  });

  it("Enter commits + fires onCellEdit with the new value", () => {
    const commits: EditCommit[] = [];
    const g = new Boostgrid(makeTable(), {
      rowCount: 10,
      navigation: 0,
      onCellEdit: (c) => { commits.push(c); },
    });
    const td = dblclickCell(g, "1", "sender");
    const input = td.querySelector<HTMLInputElement>("input[data-edit-input]")!;
    input.value = "ALPHA@x.com";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(commits).toHaveLength(1);
    expect(commits[0].oldValue).toBe("alpha@x.com");
    expect(commits[0].newValue).toBe("ALPHA@x.com");
    expect(td.textContent).toBe("ALPHA@x.com");
    g.destroy();
  });

  it("Escape cancels and restores the original cell", () => {
    let calls = 0;
    const g = new Boostgrid(makeTable(), {
      rowCount: 10,
      navigation: 0,
      onCellEdit: () => { calls++; },
    });
    const td = dblclickCell(g, "1", "sender");
    const input = td.querySelector<HTMLInputElement>("input[data-edit-input]")!;
    input.value = "should-not-stick";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(calls).toBe(0);
    expect(td.textContent).toBe("alpha@x.com");
    g.destroy();
  });

  it("revert() rolls the row back to the old value", () => {
    let lastCommit: EditCommit | null = null;
    const g = new Boostgrid(makeTable(), {
      rowCount: 10,
      navigation: 0,
      onCellEdit: (c) => { lastCommit = c; },
    });
    const td = dblclickCell(g, "1", "sender");
    const input = td.querySelector<HTMLInputElement>("input[data-edit-input]")!;
    input.value = "new@x.com";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(td.textContent).toBe("new@x.com");
    lastCommit!.revert();
    expect(td.textContent).toBe("alpha@x.com");
    g.destroy();
  });

  it("number-type column coerces commit value to a number", () => {
    let lastCommit: EditCommit | null = null;
    const g = new Boostgrid(makeTable(), {
      rowCount: 10,
      navigation: 0,
      onCellEdit: (c) => { lastCommit = c; },
    });
    const td = dblclickCell(g, "1", "qty");
    const input = td.querySelector<HTMLInputElement>("input[data-edit-input]")!;
    input.value = "42";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(lastCommit!.newValue).toBe(42);
    expect(typeof lastCommit!.newValue).toBe("number");
    g.destroy();
  });
});

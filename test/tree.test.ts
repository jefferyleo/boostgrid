import { describe, it, expect, beforeEach, vi } from "vitest";
import { Boostgrid } from "../src/core";

/**
 * Filesystem-shaped fixture (5 nodes, 3 depth levels):
 *   1: root            (folder)
 *   ├─ 2: docs         (folder)  parent=1
 *   │  └─ 4: readme    (file)    parent=2
 *   ├─ 3: src          (folder)  parent=1
 *   │  └─ 5: index.ts  (file)    parent=3
 */
function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="tgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name" data-tree-column="true">Name</th>
          <th data-column-id="parentId" data-visible="false">Parent</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>root</td><td></td></tr>
        <tr><td>2</td><td>docs</td><td>1</td></tr>
        <tr><td>3</td><td>src</td><td>1</td></tr>
        <tr><td>4</td><td>readme</td><td>2</td></tr>
        <tr><td>5</td><td>index.ts</td><td>3</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("tgrid") as HTMLTableElement;
}

function visibleRows(g: Boostgrid): HTMLTableRowElement[] {
  return Array.from(g.element.querySelectorAll<HTMLTableRowElement>("tbody tr"));
}

describe("Boostgrid tree mode", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

  it("flat data with parentId becomes a tree (DFS render order)", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, treeMode: true });
    const rows = visibleRows(g);
    // All 5 rows visible by default (treeExpanded: 'all')
    expect(rows.length).toBe(5);
    // First row is the root
    expect(rows[0].getAttribute("data-tree-depth")).toBe("0");
    // Direct children come right after the root
    const names = rows.map((r) => r.querySelector('[data-column-id="name"]')?.textContent?.trim());
    // Insertion order is 1,2,3,4,5; sorted upstream nothing changed.
    // DFS: root(0) → docs(1) → readme(2) → src(1) → index.ts(2)
    expect(names).toEqual(["root", "docs", "readme", "src", "index.ts"]);
    g.destroy();
  });

  it("treeExpanded: 'none' shows only roots; expandAllTree() reveals all", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, treeMode: true, treeExpanded: "none",
    });
    expect(visibleRows(g).length).toBe(1); // only the root
    g.expandAllTree();
    expect(visibleRows(g).length).toBe(5);
    g.destroy();
  });

  it("clicking the caret toggles just that subtree", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, treeMode: true });
    // Find the docs (id=2) caret
    const docsRow = visibleRows(g).find((r) => r.getAttribute("data-row-id") === "2")!;
    const caret = docsRow.querySelector<HTMLElement>(".boostgrid-tree-caret")!;
    caret.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // After collapsing docs, readme (id=4) should be hidden
    const remaining = visibleRows(g).map((r) => r.getAttribute("data-row-id"));
    expect(remaining).not.toContain("4");
    expect(remaining).toContain("3"); // src untouched
    expect(remaining).toContain("5"); // index.ts untouched
    g.destroy();
  });

  it("search reveals an ancestor chain even when only a leaf matches", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, treeMode: true,
      treeExpanded: "none", // start fully collapsed
    });
    // Initially only the root is visible
    expect(visibleRows(g).length).toBe(1);
    // Search for "index" — only the deeply-nested file matches
    g.search("index");
    const ids = visibleRows(g).map((r) => r.getAttribute("data-row-id"));
    // Both the leaf (5) AND its ancestor chain (1, 3) must be visible
    expect(ids).toContain("5");
    expect(ids).toContain("3");
    expect(ids).toContain("1");
    g.destroy();
  });

  it("detects a cycle and renders without infinite loop", () => {
    document.body.innerHTML = `
      <table id="cyc" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name" data-tree-column="true">Name</th>
          <th data-column-id="parentId" data-visible="false">Parent</th>
        </tr></thead>
        <tbody>
          <tr><td>1</td><td>a</td><td>2</td></tr>
          <tr><td>2</td><td>b</td><td>1</td></tr>
        </tbody>
      </table>
    `;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const g = new Boostgrid(
      document.getElementById("cyc") as HTMLTableElement,
      { rowCount: -1, navigation: 0, treeMode: true },
    );
    expect(visibleRows(g).length).toBe(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    g.destroy();
  });

  it("orphan parent id promotes the row to root with a warning", () => {
    document.body.innerHTML = `
      <table id="orph" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name" data-tree-column="true">Name</th>
          <th data-column-id="parentId" data-visible="false">Parent</th>
        </tr></thead>
        <tbody>
          <tr><td>1</td><td>a</td><td></td></tr>
          <tr><td>2</td><td>orphan</td><td>999</td></tr>
        </tbody>
      </table>
    `;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const g = new Boostgrid(
      document.getElementById("orph") as HTMLTableElement,
      { rowCount: -1, navigation: 0, treeMode: true },
    );
    const rows = visibleRows(g);
    expect(rows.length).toBe(2); // both visible (orphan promoted)
    // Both rows should be at depth 0
    const depths = rows.map((r) => r.getAttribute("data-tree-depth"));
    expect(depths).toEqual(["0", "0"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    g.destroy();
  });

  it("collapsed tree nodes round-trip through stateSave", () => {
    const a = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, treeMode: true,
      stateSave: true, stateKey: "round4-tree",
    });
    a.toggleTreeNode(2); // collapse docs
    a.destroy();

    document.body.innerHTML = "";
    const b = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, treeMode: true,
      stateSave: true, stateKey: "round4-tree",
    });
    expect(b.isTreeExpanded(2)).toBe(false);
    expect(b.isTreeExpanded(3)).toBe(true);
    b.destroy();
  });

  it("treeMode + groupBy together: tree wins, warning logged", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0,
      treeMode: true,
      groupBy: "name", // mutually exclusive with treeMode
    });
    // No group headers — tree mode took over
    const groupHeaders = g.element.querySelectorAll("tr.boostgrid-group-row");
    expect(groupHeaders.length).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    g.destroy();
  });
});

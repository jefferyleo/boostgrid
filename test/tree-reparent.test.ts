import { describe, it, expect, beforeEach, vi } from "vitest";
import { Boostgrid } from "../src/core";

/**
 * Filesystem-shaped fixture (5 nodes, 3 depth levels):
 *   1: root         (folder)
 *   ├─ 2: docs      parent=1
 *   │  └─ 4: readme parent=2
 *   ├─ 3: src       parent=1
 *   │  └─ 5: index  parent=3
 */
function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="rrgrid" class="table">
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
        <tr><td>5</td><td>index</td><td>3</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("rrgrid") as HTMLTableElement;
}

describe("Boostgrid tree drag-to-reparent", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

  it("reparentTreeNode mutates parentId and re-renders under the new parent", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, treeMode: true, treeReparent: true,
    });
    expect(g.reparentTreeNode(4, 3)).toBe(true);
    // After move, readme should sit under src in DFS order:
    // root → docs → src → readme → index (or similar; readme now sibling of index under src)
    const tbody = g.element.querySelector("tbody")!;
    const names = Array.from(tbody.querySelectorAll<HTMLElement>('[data-column-id="name"]'))
      .map((td) => td.textContent?.trim());
    expect(names).toContain("readme");
    // readme must come after src now
    expect(names.indexOf("readme")).toBeGreaterThan(names.indexOf("src"));
    g.destroy();
  });

  it("rejects a cycle (cannot move a parent under its own descendant)", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, treeMode: true, treeReparent: true,
    });
    // 2 (docs) is an ancestor of 4 (readme); moving 2 under 4 must fail.
    expect(g.reparentTreeNode(2, 4)).toBe(false);
    g.destroy();
  });

  it("treeReparent: false makes rows non-draggable and rejects programmatic moves through DnD path only", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, treeMode: true,
      // treeReparent left at default `false`
    });
    const draggable = g.element.querySelectorAll('tbody > tr[draggable="true"]');
    expect(draggable.length).toBe(0);
    // Programmatic API still works regardless of the DnD opt-in,
    // because the user explicitly invoked it.
    expect(g.reparentTreeNode(4, 3)).toBe(true);
    g.destroy();
  });

  it("onReparent fires with (child, newParent, oldParent) after a successful move", async () => {
    const onReparent = vi.fn();
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, treeMode: true, treeReparent: true,
      onReparent,
    });
    g.reparentTreeNode(4, 3);
    // onReparent is called via Promise.resolve() — let microtasks settle
    await Promise.resolve();
    await Promise.resolve();
    expect(onReparent).toHaveBeenCalledTimes(1);
    const [child, newParent, oldParent] = onReparent.mock.calls[0];
    expect((child as Record<string, unknown>).id).toBe(4);
    expect((newParent as Record<string, unknown>).id).toBe(3);
    expect((oldParent as Record<string, unknown>).id).toBe(2);
    g.destroy();
  });

  it("moving to root (newParentId = null) makes the row a top-level node", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, treeMode: true, treeReparent: true,
    });
    expect(g.reparentTreeNode(4, null)).toBe(true);
    // After: readme should be at depth 0 (a root)
    const tr = g.element.querySelector<HTMLElement>(
      'tbody > tr[data-row-id="4"]',
    );
    expect(tr?.getAttribute("data-tree-depth")).toBe("0");
    g.destroy();
  });
});

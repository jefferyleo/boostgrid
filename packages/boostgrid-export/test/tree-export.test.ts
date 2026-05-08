import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "boostgrid";
import { rowsToCsv } from "../src/csv";
import { rowsToAoa } from "../src/xlsx";

/** Filesystem-shaped fixture (same shape as test/tree.test.ts in core). */
function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="texgrid" class="table">
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
  return document.getElementById("texgrid") as HTMLTableElement;
}

describe("Tree-aware export", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

  it("indent mode prefixes the tree-column cell with depth × indent string", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, treeMode: true });
    const csv = rowsToCsv(
      g.columns,
      g.getFilteredRows(),
      ",",
      g,
      { treeExport: "indent", treeIndentString: "  " },
    );
    const lines = csv.split("\r\n");
    // Header: ID,Name (parentId is hidden)
    expect(lines[0]).toBe("ID,Name");
    // root depth 0 → "root"
    expect(lines[1]).toBe("1,root");
    // docs depth 1 → "  docs" (no quoting — leading spaces aren't a CSV-quote trigger)
    expect(lines[2]).toBe("2,  docs");
    // readme depth 2 → "    readme"
    expect(lines.find((l) => l.startsWith("4,"))).toContain("    readme");
    g.destroy();
  });

  it("path-column mode adds a leading 'Path' column with slash-joined ancestors", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, treeMode: true });
    const csv = rowsToCsv(
      g.columns,
      g.getFilteredRows(),
      ",",
      g,
      { treeExport: "path-column", treeIndentString: "  " },
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Path,ID,Name");
    // root has no ancestors → leading "/"
    expect(lines[1]).toBe("/,1,root");
    // readme's path is /root/docs (ancestor labels)
    const readmeLine = lines.find((l) => l.endsWith(",4,readme"));
    expect(readmeLine).toBe("/root/docs,4,readme");
    g.destroy();
  });

  it("flat mode (or treeMode off) writes rows untouched", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, treeMode: true });
    const indented = rowsToCsv(g.columns, g.getFilteredRows(), ",", g, {
      treeExport: "flat",
      treeIndentString: "  ",
    });
    // No leading spaces, no Path column
    expect(indented).toContain("2,docs");
    expect(indented).not.toContain("  docs");
    expect(indented.split("\r\n")[0]).toBe("ID,Name");
    g.destroy();
  });

  it("xlsx aoa indent mode pads strings (numbers stay numeric)", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, treeMode: true });
    const aoa = rowsToAoa(g.columns, g.getFilteredRows(), g, {
      treeExport: "indent",
      treeIndentString: "->",
    });
    // First column is ID (numeric → kept as number); name gets the indent.
    // Header
    expect(aoa[0]).toEqual(["ID", "Name"]);
    // root row
    expect(aoa[1]).toEqual([1, "root"]);
    // readme row depth 2 → "->->readme"
    const readmeAoa = aoa.find((r) => r[0] === 4);
    expect(readmeAoa?.[1]).toBe("->->readme");
    g.destroy();
  });
});

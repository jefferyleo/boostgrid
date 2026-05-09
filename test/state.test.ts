import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="state-grid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="sender">Sender</th>
          <th data-column-id="subject">Subject</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>alpha@x.com</td><td>Welcome</td></tr>
        <tr><td>2</td><td>beta@x.com</td><td>Hello</td></tr>
        <tr><td>3</td><td>gamma@x.com</td><td>Notes</td></tr>
        <tr><td>4</td><td>delta@x.com</td><td>Update</td></tr>
        <tr><td>5</td><td>epsilon@x.com</td><td>Final</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("state-grid") as HTMLTableElement;
}

describe("Boostgrid state persistence", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("does not write to localStorage when stateSave is off", () => {
    const g = new Boostgrid(makeTable(), { rowCount: 2, navigation: 0 });
    g.goToPage(2);
    expect(localStorage.length).toBe(0);
    g.destroy();
  });

  it("writes state under boostgrid:<id> key when stateSave is on", () => {
    const g = new Boostgrid(makeTable(), { stateSave: true, rowCount: 2, navigation: 0 });
    g.goToPage(2);
    g.flushState();
    const raw = localStorage.getItem("boostgrid:state-grid");
    expect(raw).not.toBeNull();
    const state = JSON.parse(raw!);
    expect(state.v).toBe(3);
    expect(state.current).toBe(2);
    expect(state.rowsPerPage).toBe(2);
    g.destroy();
  });

  it("restores page, rowsPerPage, search, and column visibility on next mount", () => {
    // Mount #1: navigate, search, hide a column, then tear down
    const g1 = new Boostgrid(makeTable(), { stateSave: true, rowCount: 2, navigation: 0 });
    g1.goToPage(2);
    g1.search("nothing-matches");
    g1.columns[2].visible = false; // simulate user hiding "subject"
    g1.reload();
    g1.destroy();
    document.body.innerHTML = "";

    // Mount #2: state should be applied before first render
    const g2 = new Boostgrid(makeTable(), { stateSave: true, rowCount: 2, navigation: 0 });
    expect(g2.getRowCount()).toBe(2);
    expect(g2.getSearchPhrase()).toBe("nothing-matches");
    expect(g2.columns.find((c) => c.id === "subject")?.visible).toBe(false);
    g2.destroy();
  });

  it("discards payloads with a wrong version", () => {
    localStorage.setItem("boostgrid:state-grid", JSON.stringify({ v: 99, current: 5 }));
    const g = new Boostgrid(makeTable(), { stateSave: true, rowCount: 2, navigation: 0 });
    expect(g.getCurrentPage()).toBe(1);
    g.destroy();
  });

  it("discards malformed JSON gracefully", () => {
    localStorage.setItem("boostgrid:state-grid", "this is not json {");
    const g = new Boostgrid(makeTable(), { stateSave: true, rowCount: 2, navigation: 0 });
    expect(g.getCurrentPage()).toBe(1);
    g.destroy();
  });

  it("respects a custom stateKey", () => {
    const g = new Boostgrid(makeTable(), {
      stateSave: true,
      stateKey: "my-custom-key",
      rowCount: 2,
      navigation: 0,
    });
    g.goToPage(2);
    g.flushState();
    expect(localStorage.getItem("my-custom-key")).not.toBeNull();
    expect(localStorage.getItem("boostgrid:state-grid")).toBeNull();
    g.destroy();
  });

  it("clearSavedState removes the persisted payload", () => {
    const g = new Boostgrid(makeTable(), { stateSave: true, rowCount: 2, navigation: 0 });
    g.goToPage(2);
    g.flushState();
    expect(localStorage.getItem("boostgrid:state-grid")).not.toBeNull();
    g.clearSavedState();
    expect(localStorage.getItem("boostgrid:state-grid")).toBeNull();
    g.destroy();
  });

  it("round-trips v:3 columnOrder + columnWidths", () => {
    const g1 = new Boostgrid(makeTable(), { stateSave: true, navigation: 0 });
    // Reorder columns: subject before sender
    const subject = g1.columns.find((c) => c.id === "subject")!;
    const senderIdx = g1.columns.findIndex((c) => c.id === "sender");
    g1.columns = g1.columns.filter((c) => c.id !== "subject");
    g1.columns.splice(senderIdx, 0, subject);
    // Set a pixel width
    const idCol = g1.columns.find((c) => c.id === "id")!;
    idCol.width = "175px";
    g1.reload();
    g1.destroy();
    document.body.innerHTML = "";

    // Mount #2: order + width should restore
    const g2 = new Boostgrid(makeTable(), { stateSave: true, navigation: 0 });
    expect(g2.columns.map((c) => c.id)).toEqual(["id", "subject", "sender"]);
    expect(g2.columns.find((c) => c.id === "id")?.width).toBe("175px");
    g2.destroy();
  });

  it("ignores stale columnOrder when id sets don't match", () => {
    // Pre-seed a payload referencing a column that doesn't exist
    localStorage.setItem(
      "boostgrid:state-grid",
      JSON.stringify({
        v: 3,
        current: 1,
        rowsPerPage: 10,
        searchPhrase: "",
        sortDictionary: {},
        columnVisibility: {},
        selected: [],
        collapsedGroups: [],
        expandedTreeNodes: [],
        columnOrder: ["id", "ghost", "sender"],
        columnWidths: {},
      }),
    );
    const g = new Boostgrid(makeTable(), { stateSave: true, navigation: 0 });
    // Authored order preserved
    expect(g.columns.map((c) => c.id)).toEqual(["id", "sender", "subject"]);
    g.destroy();
  });

  it("v:2 payload still applies cleanly without crashing", () => {
    localStorage.setItem(
      "boostgrid:state-grid",
      JSON.stringify({
        v: 2,
        current: 2,
        rowsPerPage: 2,
        searchPhrase: "alpha",
        sortDictionary: {},
        columnVisibility: { subject: false },
        selected: [],
        collapsedGroups: [],
        expandedTreeNodes: [],
      }),
    );
    const g = new Boostgrid(makeTable(), { stateSave: true, navigation: 0 });
    expect(g.getSearchPhrase()).toBe("alpha");
    expect(g.columns.find((c) => c.id === "subject")?.visible).toBe(false);
    g.destroy();
  });

  it("only persists selection when keepSelection is true", () => {
    // keepSelection: false → selection should NOT round-trip
    const g1 = new Boostgrid(makeTable(), {
      stateSave: true,
      selection: true,
      multiSelect: true,
      rowCount: 10,
      navigation: 0,
    });
    g1.select([1, 3]);
    g1.flushState();
    const raw1 = JSON.parse(localStorage.getItem("boostgrid:state-grid")!);
    expect(raw1.selected).toEqual([]);
    g1.destroy();
    document.body.innerHTML = "";
    localStorage.clear();

    // keepSelection: true → selection IS persisted
    const g2 = new Boostgrid(makeTable(), {
      stateSave: true,
      selection: true,
      multiSelect: true,
      keepSelection: true,
      rowCount: 10,
      navigation: 0,
    });
    g2.select([1, 3]);
    g2.flushState();
    const raw2 = JSON.parse(localStorage.getItem("boostgrid:state-grid")!);
    expect(raw2.selected.sort()).toEqual([1, 3]);
    g2.destroy();
  });
});

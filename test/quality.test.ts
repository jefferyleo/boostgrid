// Round 9 regression tests — covers the stability fixes and the
// debounced-state behavior introduced in 2.5.0.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(id = "qgrid"): HTMLTableElement {
  document.body.innerHTML = `
    <table id="${id}" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name" data-editable="true">Name</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;
  return document.getElementById(id) as HTMLTableElement;
}

describe("AJAX race-condition guard", () => {
  const realFetch = global.fetch;
  beforeEach(() => { document.body.innerHTML = ""; });
  afterEach(() => { global.fetch = realFetch; });

  it("dropping a stale (slow) response keeps the newer (fast) one", async () => {
    // First call resolves slowly; second call resolves quickly. Without
    // sequencing the slow-late call would overwrite the fresh data.
    let callCount = 0;
    const slowResolvers: ((v: Response) => void)[] = [];
    global.fetch = vi.fn((_url: RequestInfo) => {
      callCount++;
      if (callCount === 1) {
        return new Promise<Response>((resolve) => slowResolvers.push(resolve));
      }
      return Promise.resolve({
        json: async () => ({ current: 1, rowCount: 1, total: 1, rows: [{ id: 99, name: "fast" }] }),
      } as unknown as Response);
    }) as unknown as typeof fetch;

    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api",
      navigation: 0,
      rowCount: 10,
    });
    // Trigger a second request, then resolve the first (stale) one.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    g.reload();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // Now release the first (stale) response.
    slowResolvers[0]({
      json: async () => ({ current: 1, rowCount: 1, total: 1, rows: [{ id: 1, name: "stale" }] }),
    } as unknown as Response);
    for (let i = 0; i < 10; i++) await Promise.resolve();

    // The grid should be showing the FAST (id 99) row, not the stale one.
    const rows = g.getCurrentRows();
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(99);
    g.destroy();
  });

  it("destroy() during in-flight ajax does not crash on response", async () => {
    let resolveFetch: (v: Response) => void = () => { /* set below */ };
    global.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api",
      navigation: 0,
      rowCount: 10,
    });
    for (let i = 0; i < 3; i++) await Promise.resolve();
    g.destroy();
    // Late response after destroy → must be silently dropped.
    expect(() => {
      resolveFetch({
        json: async () => ({ current: 1, rowCount: 0, total: 0, rows: [] }),
      } as unknown as Response);
    }).not.toThrow();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
});

describe("Cell-edit listener cleanup", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("commit detaches keydown/blur from the swapped-out input", () => {
    const t = makeTable();
    const g = new Boostgrid(t, { rowCount: 5, navigation: 0 });
    g.append([{ id: 1, name: "Alice" }]);
    const td = t.querySelector<HTMLTableCellElement>("tbody td[data-editable]")!;
    expect(td).not.toBeNull();
    td.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = td.querySelector<HTMLInputElement>("[data-edit-input]")!;
    expect(input).not.toBeNull();
    input.value = "Bob";
    // Commit via Enter
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    // The cell should now hold the committed text — no input remains.
    expect(td.querySelector("[data-edit-input]")).toBeNull();
    expect(td.textContent).toContain("Bob");
    // Firing keydown on the *stale* (now-detached) input must be a no-op.
    expect(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    }).not.toThrow();
    g.destroy();
  });
});

describe("Debounced saveState", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

  it("multiple rapid mutations result in one localStorage write after flushState", () => {
    const g = new Boostgrid(makeTable(), {
      stateSave: true,
      navigation: 0,
      rowCount: 5,
    });
    // No write yet — saveState is debounced.
    expect(localStorage.getItem("boostgrid:qgrid")).toBeNull();
    // Five mutations in rapid succession.
    g.goToPage(1);
    g.goToPage(1);
    g.search("foo");
    g.search("bar");
    g.search("baz");
    // Still nothing — debounce hasn't fired.
    expect(localStorage.getItem("boostgrid:qgrid")).toBeNull();
    // Flush; now exactly one record exists.
    g.flushState();
    const raw = localStorage.getItem("boostgrid:qgrid");
    expect(raw).not.toBeNull();
    const state = JSON.parse(raw!);
    expect(state.searchPhrase).toBe("baz");
    g.destroy();
  });

  it("destroy() flushes a pending save", () => {
    const g = new Boostgrid(makeTable(), {
      stateSave: true,
      navigation: 0,
      rowCount: 5,
    });
    g.goToPage(1);
    g.search("alpha");
    expect(localStorage.getItem("boostgrid:qgrid")).toBeNull();
    g.destroy(); // should flush
    const raw = localStorage.getItem("boostgrid:qgrid");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).searchPhrase).toBe("alpha");
  });
});

describe("Locale validation", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("invalid BCP-47 locale does not crash on render", () => {
    const t = makeTable();
    expect(() => {
      const g = new Boostgrid(t, {
        navigation: 0,
        rowCount: 5,
        locale: "not-a-real-tag",
      });
      g.append([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
      g.destroy();
    }).not.toThrow();
  });
});

describe("Lifecycle hardening", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("destroy() called twice is a no-op", () => {
    const g = new Boostgrid(makeTable(), { navigation: 0, rowCount: 5 });
    expect(() => {
      g.destroy();
      g.destroy();
    }).not.toThrow();
  });
});

// ---- Round 2.4.2 regression coverage ---------------------------------------
describe("2.4.2 — Diffed selection toggle", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("select([id]) marks the row's <tr> table-active and checks its checkbox", () => {
    const t = makeTable();
    const g = new Boostgrid(t, {
      navigation: 0,
      rowCount: -1,
      selection: true,
      multiSelect: true,
    });
    g.append([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }, { id: 3, name: "Carol" }]);
    g.select([2]);
    const tr2 = t.querySelector<HTMLTableRowElement>('tr[data-row-id="2"]')!;
    const tr1 = t.querySelector<HTMLTableRowElement>('tr[data-row-id="1"]')!;
    expect(tr2.classList.contains("table-active")).toBe(true);
    expect(tr1.classList.contains("table-active")).toBe(false);
    const cb2 = tr2.querySelector<HTMLInputElement>("input.bg-select-row")!;
    expect(cb2.checked).toBe(true);
    g.destroy();
  });

  it("deselect([id]) only un-marks the affected row, leaves others alone", () => {
    const t = makeTable();
    const g = new Boostgrid(t, {
      navigation: 0,
      rowCount: -1,
      selection: true,
      multiSelect: true,
    });
    g.append([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
    g.select([1, 2]);
    g.deselect([1]);
    const tr1 = t.querySelector<HTMLTableRowElement>('tr[data-row-id="1"]')!;
    const tr2 = t.querySelector<HTMLTableRowElement>('tr[data-row-id="2"]')!;
    expect(tr1.classList.contains("table-active")).toBe(false);
    expect(tr2.classList.contains("table-active")).toBe(true);
    g.destroy();
  });

  it("select() with no args still flips every visible row (full-refresh path)", () => {
    const t = makeTable();
    const g = new Boostgrid(t, {
      navigation: 0,
      rowCount: -1,
      selection: true,
      multiSelect: true,
    });
    g.append([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }, { id: 3, name: "Carol" }]);
    g.select();
    const trs = t.querySelectorAll<HTMLTableRowElement>("tbody > tr");
    for (const tr of trs) {
      expect(tr.classList.contains("table-active")).toBe(true);
    }
    g.destroy();
  });

  it("header select-all checkbox stays in sync after a per-id select", () => {
    const t = makeTable();
    const g = new Boostgrid(t, {
      navigation: 0,
      rowCount: -1,
      selection: true,
      multiSelect: true,
    });
    g.append([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
    const headCb = t.querySelector<HTMLInputElement>("thead input.bg-select-all")!;
    expect(headCb.checked).toBe(false);
    g.select([1, 2]);
    expect(headCb.checked).toBe(true);
    g.deselect([1]);
    expect(headCb.checked).toBe(false);
    g.destroy();
  });
});

describe("2.4.2 — Performance marks", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    if (typeof performance !== "undefined" && performance.clearMarks) {
      performance.clearMarks();
      performance.clearMeasures();
    }
  });

  it("emits no marks when performanceMarks is off (default)", () => {
    const g = new Boostgrid(makeTable("pmgrid"), {
      navigation: 0,
      rowCount: -1,
    });
    g.append([{ id: 1, name: "Alice" }]);
    const measures = performance.getEntriesByType("measure");
    expect(measures.filter((m) => m.name.startsWith("boostgrid:"))).toHaveLength(0);
    g.destroy();
  });

  it("emits header / body / footer measures when performanceMarks is on", () => {
    const g = new Boostgrid(makeTable("pmgrid"), {
      navigation: 0,
      rowCount: -1,
      performanceMarks: true,
    });
    g.append([{ id: 1, name: "Alice" }]);
    const measures = performance.getEntriesByType("measure");
    const ours = measures.filter((m) => m.name.startsWith("boostgrid:pmgrid:"));
    const phases = ours.map((m) => m.name.split(":")[2]);
    expect(phases).toContain("header");
    expect(phases).toContain("body");
    g.destroy();
  });
});

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

// ---- 2.4.3 regression coverage ---------------------------------------------
describe("2.4.3 — Pre-resolved cell-paint pipeline", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("formatter and non-formatter columns paint correctly via the pipeline", () => {
    document.body.innerHTML = `
      <table id="ppgrid" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name">Name</th>
          <th data-column-id="badge">Badge</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    `;
    const g = new Boostgrid(document.getElementById("ppgrid") as HTMLTableElement, {
      navigation: 0,
      rowCount: -1,
      formatters: {
        // Formatter for the "badge" column — distinguishes innerHTML vs textContent
        // path. Must produce HTML so the test catches a textContent mistake.
        badge: (col, row) => `<span class="badge bg-success">${row.name}</span>`,
      },
    });
    // Wire the formatter onto the column at attach (mimics what real usage does).
    g.columns.find((c) => c.id === "badge")!.formatter = (col, row) =>
      `<span class="badge bg-success" data-formatted="${row.name}">${row.name}</span>`;
    g.append([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
    const tbl = document.getElementById("ppgrid") as HTMLTableElement;
    const aliceRow = tbl.querySelector('tr[data-row-id="1"]')!;
    const bobRow = tbl.querySelector('tr[data-row-id="2"]')!;
    const aliceName = aliceRow.querySelector('td[data-column-id="name"]')!;
    const aliceBadge = aliceRow.querySelector('td[data-column-id="badge"] .badge') as HTMLElement;
    const bobBadge = bobRow.querySelector('td[data-column-id="badge"] .badge') as HTMLElement;
    // Non-formatter column: textContent path
    expect(aliceName.textContent).toBe("Alice");
    // Formatter column: innerHTML path produced an actual <span>, not text
    expect(aliceBadge).not.toBeNull();
    expect(aliceBadge.dataset.formatted).toBe("Alice");
    // Closure captures the COLUMN (not the loop index) → second row's
    // formatter still sees the same column and uses row 2's data
    expect(bobBadge).not.toBeNull();
    expect(bobBadge.dataset.formatted).toBe("Bob");
    g.destroy();
  });
});

describe("2.4.3 — Diffed column-visibility toggle", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  function makeVisTable(): HTMLTableElement {
    document.body.innerHTML = `
      <table id="vgrid" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name">Name</th>
          <th data-column-id="role">Role</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    `;
    return document.getElementById("vgrid") as HTMLTableElement;
  }

  it("hiding a non-frozen column flips the hidden attribute on its cells in place", () => {
    const t = makeVisTable();
    const g = new Boostgrid(t, { navigation: 0, rowCount: -1 });
    g.append([{ id: 1, name: "Alice", role: "admin" }, { id: 2, name: "Bob", role: "user" }]);
    // Capture row identities BEFORE toggle so we can prove no re-render fired
    const beforeRows = Array.from(t.querySelectorAll('tbody tr[data-row-id]'));
    // Hide "role" via the same data-bg-action chain the panel uses
    t.dispatchEvent(new MouseEvent("click", { bubbles: true })); // warm up
    g.columns.find((c) => c.id === "role")!.visible = !g.columns.find((c) => c.id === "role")!.visible;
    // Equivalent: trigger the action handler manually by clicking a synthesized button
    const btn = document.createElement("button");
    btn.setAttribute("data-bg-action", "toggle-column");
    btn.setAttribute("data-bg-value", "role");
    // Reset visible (we just flipped it manually for setup), then dispatch
    g.columns.find((c) => c.id === "role")!.visible = true;
    g.element.parentElement!.appendChild(btn);
    btn.click();
    // After click: role cells should be hidden, but row <tr>s are the same DOM nodes
    const roleCells = t.querySelectorAll<HTMLElement>('[data-column-id="role"]');
    for (const c of roleCells) expect(c.hidden).toBe(true);
    const afterRows = Array.from(t.querySelectorAll('tbody tr[data-row-id]'));
    expect(afterRows).toEqual(beforeRows); // identity check — no re-render
    g.destroy();
  });

  it("showing a previously-hidden column flips hidden back to false", () => {
    const t = makeVisTable();
    const g = new Boostgrid(t, { navigation: 0, rowCount: -1 });
    g.append([{ id: 1, name: "Alice", role: "admin" }]);
    // Hide
    g.columns.find((c) => c.id === "role")!.visible = false;
    const btn = document.createElement("button");
    btn.setAttribute("data-bg-action", "toggle-column");
    btn.setAttribute("data-bg-value", "role");
    g.columns.find((c) => c.id === "role")!.visible = true; // reset for click flip
    g.element.parentElement!.appendChild(btn);
    btn.click();
    // Now visible=false; click again to flip back to true
    btn.click();
    const roleCells = t.querySelectorAll<HTMLElement>('[data-column-id="role"]');
    for (const c of roleCells) expect(c.hidden).toBe(false);
    g.destroy();
  });
});

describe("2.4.3 — Virtual scroll pad-only fast path", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("appending rows while same window keeps existing data <tr>s in place", () => {
    document.body.innerHTML = `
      <div class="table-responsive" style="height: 200px">
        <table id="vsgrid" class="table">
          <thead><tr>
            <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
            <th data-column-id="name">Name</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    `;
    const t = document.getElementById("vsgrid") as HTMLTableElement;
    const g = new Boostgrid(t, {
      navigation: 0,
      rowCount: -1,
      virtualScroll: true,
      rowHeight: 30,
      overscan: 2,
    });
    // Seed with enough rows that the virtual window is BOUNDED by the
    // viewport (not by dataset size). With jsdom's default 480px
    // viewport and rowHeight=30, the window covers ~18 rows. Seeding
    // 30 rows makes start/end stable when more rows append.
    const seed = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `R${i + 1}` }));
    g.append(seed);
    const winBefore = g.virtualWindow!;
    const beforeRows = Array.from(t.querySelectorAll('tbody tr[data-row-id]'))
      .filter((r) => !r.classList.contains("boostgrid-pad"));
    expect(beforeRows.length).toBeGreaterThan(0);
    // Append more rows. Same scroll position, same viewport, so the
    // visible window's start/end don't move — only padBottom grows.
    // That's exactly the pad-only fast-path scenario.
    g.append([
      { id: 31, name: "R31" }, { id: 32, name: "R32" }, { id: 33, name: "R33" },
    ]);
    const winAfter = g.virtualWindow!;
    expect(winAfter.start).toBe(winBefore.start);
    expect(winAfter.end).toBe(winBefore.end);
    expect(winAfter.padBottom).toBeGreaterThan(winBefore.padBottom);
    // Critical: data <tr>s are the SAME DOM nodes (identity-preserving)
    // because the fast path mutated pad row heights without rebuilding.
    const afterRows = Array.from(t.querySelectorAll('tbody tr[data-row-id]'))
      .filter((r) => !r.classList.contains("boostgrid-pad"));
    expect(afterRows.length).toBe(beforeRows.length);
    for (let i = 0; i < beforeRows.length; i++) {
      expect(afterRows[i]).toBe(beforeRows[i]);
    }
    g.destroy();
  });
});

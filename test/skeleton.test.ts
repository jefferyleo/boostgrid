import { describe, it, expect, beforeEach, vi } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="skgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name">Name</th>
          <th data-column-id="email">Email</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;
  return document.getElementById("skgrid") as HTMLTableElement;
}

/** Fetch stub that never resolves, so we can inspect the in-flight UI. */
function pendingFetch(): typeof fetch {
  return vi.fn(() => new Promise(() => { /* never resolves */ })) as unknown as typeof fetch;
}

describe("Boostgrid loading skeleton", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    document.body.innerHTML = "";
    global.fetch = realFetch;
  });

  it("renders skeleton rows during an in-flight ajax fetch", () => {
    global.fetch = pendingFetch();
    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api/rows",
      rowCount: 5,
      navigation: 0,
    });
    const skeletonRows = g.element.querySelectorAll("tbody > tr.boostgrid-skeleton-row");
    expect(skeletonRows.length).toBe(5);
    // Each skeleton row has one bar per visible column
    const bars = g.element.querySelectorAll(".boostgrid-skeleton-bar");
    expect(bars.length).toBe(5 * 3);
    g.destroy();
  });

  it("respects loadingSkeleton: false and renders an empty body instead", () => {
    global.fetch = pendingFetch();
    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api/rows",
      rowCount: 5,
      navigation: 0,
      loadingSkeleton: false,
    });
    expect(g.element.querySelectorAll(".boostgrid-skeleton-row").length).toBe(0);
    g.destroy();
  });

  it("respects an explicit numeric loadingSkeleton count", () => {
    global.fetch = pendingFetch();
    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api/rows",
      rowCount: 50,
      navigation: 0,
      loadingSkeleton: 3,
    });
    expect(g.element.querySelectorAll(".boostgrid-skeleton-row").length).toBe(3);
    g.destroy();
  });

  it("skeleton is replaced by real rows once fetch resolves", async () => {
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        current: 1,
        rowCount: 2,
        rows: [
          { id: 1, name: "Alpha", email: "a@x.com" },
          { id: 2, name: "Beta",  email: "b@x.com" },
        ],
        total: 2,
      }),
    })) as unknown as typeof fetch;
    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api/rows",
      rowCount: 2,
      navigation: 0,
    });
    // Microtask flush — fetch resolves through two await points (the
    // response and json()), each producing several microtasks.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(g.element.querySelectorAll(".boostgrid-skeleton-row").length).toBe(0);
    expect(g.element.querySelectorAll('tbody > tr[data-row-id]').length).toBe(2);
    g.destroy();
  });

  it("does not render skeleton in non-ajax mode", () => {
    document.body.innerHTML = `
      <table id="g" class="table">
        <thead>
          <tr>
            <th data-column-id="id" data-identifier="true">ID</th>
            <th data-column-id="x">X</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>a</td></tr>
        </tbody>
      </table>
    `;
    const g = new Boostgrid(document.getElementById("g") as HTMLTableElement, {
      navigation: 0, rowCount: -1,
    });
    expect(g.element.querySelectorAll(".boostgrid-skeleton-row").length).toBe(0);
    g.destroy();
  });
});

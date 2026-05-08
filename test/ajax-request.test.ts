import { describe, it, expect, beforeEach, vi } from "vitest";
import { Boostgrid } from "../src/core";
import type { AjaxRequest } from "../src/types";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="agrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="status">Status</th>
          <th data-column-id="region">Region</th>
          <th data-column-id="parentId" data-visible="false">Parent</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;
  return document.getElementById("agrid") as HTMLTableElement;
}

function captureFetch(): { calls: { url: string; body: AjaxRequest }[] } {
  const captured: { calls: { url: string; body: AjaxRequest }[] } = { calls: [] };
  global.fetch = vi.fn(async (url: RequestInfo, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : null;
    captured.calls.push({ url: String(url), body });
    return {
      json: async () => ({ current: 1, rowCount: 0, rows: [], total: 0 }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return captured;
}

describe("Boostgrid ajax request payload", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    document.body.innerHTML = "";
    global.fetch = realFetch;
  });

  it("omits groupBy/treeMode fields when neither feature is active", async () => {
    const cap = captureFetch();
    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api",
      navigation: 0,
      rowCount: 10,
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const body = cap.calls[0].body;
    expect(body.groupBy).toBeUndefined();
    expect(body.collapsedGroups).toBeUndefined();
    expect(body.treeMode).toBeUndefined();
    expect(body.expandedTreeNodes).toBeUndefined();
    g.destroy();
  });

  it("sends groupBy as a string[] when grouping is on", async () => {
    const cap = captureFetch();
    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api",
      navigation: 0,
      rowCount: 10,
      groupBy: ["status", "region"],
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const body = cap.calls[0].body;
    expect(body.groupBy).toEqual(["status", "region"]);
    g.destroy();
  });

  it("normalizes single-string groupBy to a one-element array", async () => {
    const cap = captureFetch();
    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api",
      navigation: 0,
      rowCount: 10,
      groupBy: "status",
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(cap.calls[0].body.groupBy).toEqual(["status"]);
    g.destroy();
  });

  it("sends collapsedGroups when at least one path is collapsed", async () => {
    const cap = captureFetch();
    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api",
      navigation: 0,
      rowCount: 10,
      groupBy: ["status"],
    });
    g.collapsedGroupPaths.add("active");
    g.reload();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const last = cap.calls[cap.calls.length - 1].body;
    expect(last.collapsedGroups).toEqual(["active"]);
    g.destroy();
  });

  it("sends treeMode + expandedTreeNodes when treeMode is on", async () => {
    const cap = captureFetch();
    const g = new Boostgrid(makeTable(), {
      ajax: true,
      url: "/api",
      navigation: 0,
      rowCount: 10,
      treeMode: true,
      treeExpanded: "none",
    });
    g.expandedTreeNodes.add(42);
    g.expandedTreeNodes.add("special");
    g.reload();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const last = cap.calls[cap.calls.length - 1].body;
    expect(last.treeMode).toBe(true);
    expect(last.expandedTreeNodes).toEqual([42, "special"]);
    g.destroy();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="sgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name">Name</th>
          <th data-column-id="email">Email</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>Alpha</td><td>a@x.com</td></tr>
        <tr><td>2</td><td>Beta</td><td>b@x.com</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("sgrid") as HTMLTableElement;
}

describe("Boostgrid sticky header", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("does not add the sticky-head class when stickyHeader is off", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    const wrapper = g.element.parentElement!;
    expect(wrapper.classList.contains("boostgrid--sticky-head")).toBe(false);
    g.destroy();
  });

  it("adds the sticky-head class when stickyHeader is true", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0, stickyHeader: true });
    const wrapper = g.element.parentElement!;
    expect(wrapper.classList.contains("boostgrid--sticky-head")).toBe(true);
    g.destroy();
  });
});

describe("Boostgrid truncated-cell tooltips", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("sets `title` lazily on hover when scrollWidth > clientWidth", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    const td = g.element.querySelector<HTMLTableCellElement>(
      'tbody > tr:first-child > td[data-column-id="email"]',
    )!;
    // Stub the layout — jsdom otherwise reports both as 0.
    Object.defineProperty(td, "scrollWidth", { configurable: true, get: () => 220 });
    Object.defineProperty(td, "clientWidth", { configurable: true, get: () => 100 });
    expect(td.getAttribute("title")).toBeNull();
    td.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(td.getAttribute("title")).toBe("a@x.com");
    g.destroy();
  });

  it("does not overwrite an existing title attribute", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    const td = g.element.querySelector<HTMLTableCellElement>(
      'tbody > tr:first-child > td[data-column-id="email"]',
    )!;
    td.setAttribute("title", "kept");
    Object.defineProperty(td, "scrollWidth", { configurable: true, get: () => 220 });
    Object.defineProperty(td, "clientWidth", { configurable: true, get: () => 100 });
    td.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(td.getAttribute("title")).toBe("kept");
    g.destroy();
  });

  it("data-bg-no-tooltip opts a single cell out of the auto-tooltip", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    const td = g.element.querySelector<HTMLTableCellElement>(
      'tbody > tr:first-child > td[data-column-id="email"]',
    )!;
    td.setAttribute("data-bg-no-tooltip", "true");
    Object.defineProperty(td, "scrollWidth", { configurable: true, get: () => 220 });
    Object.defineProperty(td, "clientWidth", { configurable: true, get: () => 100 });
    td.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(td.getAttribute("title")).toBeNull();
    g.destroy();
  });

  it("does not bind the listener when truncatedTooltips is false", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, truncatedTooltips: false,
    });
    const td = g.element.querySelector<HTMLTableCellElement>(
      'tbody > tr:first-child > td[data-column-id="email"]',
    )!;
    Object.defineProperty(td, "scrollWidth", { configurable: true, get: () => 220 });
    Object.defineProperty(td, "clientWidth", { configurable: true, get: () => 100 });
    td.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(td.getAttribute("title")).toBeNull();
    g.destroy();
  });

  it("does nothing when content fits inside the cell", () => {
    const g = new Boostgrid(makeTable(), { rowCount: -1, navigation: 0 });
    const td = g.element.querySelector<HTMLTableCellElement>(
      'tbody > tr:first-child > td[data-column-id="name"]',
    )!;
    Object.defineProperty(td, "scrollWidth", { configurable: true, get: () => 60 });
    Object.defineProperty(td, "clientWidth", { configurable: true, get: () => 100 });
    td.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(td.getAttribute("title")).toBeNull();
    g.destroy();
  });
});

describe("Boostgrid i18n", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("custom labels override the toolbar UI strings", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1,
      navigation: 1,
      columnSelection: true,
      labels: {
        searchColumns: "Suchen Sie Spalten",
        resetColumns: "Zurücksetzen",
        columns: "Spalten",
      },
    });
    const wrapper = g.element.parentElement!;
    const search = wrapper.querySelector<HTMLInputElement>('[data-bg-action="filter-columns"]')!;
    expect(search.placeholder).toBe("Suchen Sie Spalten");
    expect(search.getAttribute("aria-label")).toBe("Suchen Sie Spalten");
    const reset = wrapper.querySelector<HTMLButtonElement>('[data-bg-action="reset-columns"]')!;
    expect(reset.textContent).toBe("Zurücksetzen");
    g.destroy();
  });

  it("infos uses Intl.NumberFormat with the configured locale", () => {
    document.body.innerHTML = `
      <table id="big" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name">Name</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    `;
    const rows = Array.from({ length: 12345 }, (_, i) => ({ id: i + 1, name: "x" }));
    const g = new Boostgrid(document.getElementById("big") as HTMLTableElement, {
      navigation: 2,
      rowCount: 100,
      locale: "de-DE",
    });
    g.append(rows);
    const wrapper = g.element.parentElement!;
    const infos = wrapper.querySelector<HTMLElement>(".bg-infos")!;
    // German thousands separator is "."
    expect(infos.textContent).toContain("12.345");
    g.destroy();
  });

  it("bulk-bar count + clear button are translatable", () => {
    document.body.innerHTML = `
      <table id="bg2" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name">Name</th>
        </tr></thead>
        <tbody>
          <tr><td>1</td><td>a</td></tr>
          <tr><td>2</td><td>b</td></tr>
        </tbody>
      </table>
    `;
    const g = new Boostgrid(document.getElementById("bg2") as HTMLTableElement, {
      rowCount: -1, navigation: 0,
      selection: true, multiSelect: true,
      bulkActions: () => "<span>x</span>",
      labels: {
        bulkSelected: "{n} sélectionnés",
        bulkClear: "Effacer",
      },
    });
    g.select([1, 2]);
    const wrapper = g.element.parentElement!;
    expect(wrapper.querySelector(".boostgrid-bulkbar-count")?.textContent).toBe("2 sélectionnés");
    expect(wrapper.querySelector('[data-bg-action="bulk-clear"]')?.textContent).toBe("Effacer");
    g.destroy();
  });

  it("tree-caret aria-label uses labels.treeExpand / treeCollapse", () => {
    document.body.innerHTML = `
      <table id="tt" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name" data-tree-column="true">Name</th>
          <th data-column-id="parentId" data-visible="false">Parent</th>
        </tr></thead>
        <tbody>
          <tr><td>1</td><td>root</td><td></td></tr>
          <tr><td>2</td><td>leaf</td><td>1</td></tr>
        </tbody>
      </table>
    `;
    const g = new Boostgrid(document.getElementById("tt") as HTMLTableElement, {
      rowCount: -1, navigation: 0,
      treeMode: true, treeExpanded: "all",
      labels: { treeCollapse: "Réduire", treeExpand: "Développer" },
    });
    const caret = g.element.querySelector('.boostgrid-tree-caret');
    // Default is "all" → root is expanded → aria-label = treeCollapse
    expect(caret?.getAttribute("aria-label")).toBe("Réduire");
    g.destroy();
  });
});

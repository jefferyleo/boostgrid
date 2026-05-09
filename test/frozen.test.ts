import { describe, it, expect, beforeEach } from "vitest";
import { Boostgrid } from "../src/core";
import { computeFrozenOffsets, widthAsPx } from "../src/render/header";

function makeWideTable(): HTMLTableElement {
  document.body.innerHTML = `
    <div class="table-responsive">
      <table id="fgrid" class="table">
        <thead>
          <tr>
            <th data-column-id="id" data-identifier="true" data-type="numeric"
                data-frozen="left" data-width="80">ID</th>
            <th data-column-id="sender" data-frozen="left" data-width="200">Sender</th>
            <th data-column-id="subject" data-width="300">Subject</th>
            <th data-column-id="received" data-width="160">Received</th>
            <th data-column-id="status" data-width="120">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>alpha@x.com</td><td>Welcome</td><td>2024-01-01</td><td>open</td></tr>
          <tr><td>2</td><td>beta@x.com</td><td>Hello</td><td>2024-02-02</td><td>closed</td></tr>
        </tbody>
      </table>
    </div>
  `;
  return document.getElementById("fgrid") as HTMLTableElement;
}

describe("Boostgrid frozen columns", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("widthAsPx parses bare numbers and 'Npx', returns null otherwise", () => {
    expect(widthAsPx("80")).toBe(80);
    expect(widthAsPx("80px")).toBe(80);
    expect(widthAsPx("10rem")).toBeNull();
    expect(widthAsPx("20%")).toBeNull();
    expect(widthAsPx(null)).toBeNull();
  });

  it("parses data-frozen='left' and stores it on the column", () => {
    const g = new Boostgrid(makeWideTable(), { rowCount: -1, navigation: 0 });
    expect(g.columns[0].frozen).toBe("left");
    expect(g.columns[1].frozen).toBe("left");
    expect(g.columns[2].frozen).toBeNull();
    g.destroy();
  });

  it("emits boostgrid-frozen class + cumulative left styles on header cells", () => {
    const g = new Boostgrid(makeWideTable(), { rowCount: -1, navigation: 0 });
    const ths = g.element.querySelectorAll<HTMLTableCellElement>("thead > tr > th");
    expect(ths[0].classList.contains("boostgrid-frozen")).toBe(true);
    expect(ths[0].getAttribute("style")).toContain("left: 0px");
    expect(ths[1].classList.contains("boostgrid-frozen")).toBe(true);
    // Second frozen column starts at column 0 width = 80
    expect(ths[1].getAttribute("style")).toContain("left: 80px");
    expect(ths[2].classList.contains("boostgrid-frozen")).toBe(false);
    g.destroy();
  });

  it("emits the same classes on body cells in the same row", () => {
    const g = new Boostgrid(makeWideTable(), { rowCount: -1, navigation: 0 });
    const tds = g.element.querySelectorAll<HTMLTableCellElement>("tbody > tr:first-child > td");
    expect(tds[0].classList.contains("boostgrid-frozen")).toBe(true);
    expect(tds[1].classList.contains("boostgrid-frozen")).toBe(true);
    expect(tds[2].classList.contains("boostgrid-frozen")).toBe(false);
    expect(tds[1].getAttribute("style")).toContain("left: 80px");
    g.destroy();
  });

  it("computeFrozenOffsets accumulates left correctly with selection cell", () => {
    document.body.innerHTML = `
      <table id="g" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true" data-frozen="left" data-width="80">ID</th>
          <th data-column-id="sender" data-frozen="left" data-width="200">Sender</th>
          <th data-column-id="subject">Subject</th>
        </tr></thead>
        <tbody><tr><td>1</td><td>x</td><td>y</td></tr></tbody>
      </table>
    `;
    const g = new Boostgrid(document.getElementById("g") as HTMLTableElement, {
      rowCount: -1,
      navigation: 0,
      selection: true,
      multiSelect: true,
    });
    const visible = g.columns.filter((c) => c.visible);
    const offsets = computeFrozenOffsets(g, visible);
    // index 0 → just selection cell (40px)
    expect(offsets.left[0]).toBe(40);
    // index 1 → selection + id (40 + 80)
    expect(offsets.left[1]).toBe(120);
    g.destroy();
  });

  it("emits right offsets and data-frozen-side='right' on right-frozen columns", () => {
    document.body.innerHTML = `
      <div class="table-responsive">
        <table id="rgrid" class="table">
          <thead>
            <tr>
              <th data-column-id="id" data-identifier="true" data-type="numeric" data-width="80">ID</th>
              <th data-column-id="sender" data-width="200">Sender</th>
              <th data-column-id="subject" data-width="300">Subject</th>
              <th data-column-id="status" data-frozen="right" data-width="120">Status</th>
              <th data-column-id="actions" data-frozen="right" data-width="80">Actions</th>
            </tr>
          </thead>
          <tbody><tr><td>1</td><td>a</td><td>b</td><td>c</td><td>x</td></tr></tbody>
        </table>
      </div>
    `;
    const g = new Boostgrid(document.getElementById("rgrid") as HTMLTableElement, {
      rowCount: -1,
      navigation: 0,
    });
    const ths = g.element.querySelectorAll<HTMLTableCellElement>("thead > tr > th");
    // status is right-frozen with one right-frozen column (actions, 80) trailing it
    expect(ths[3].getAttribute("data-frozen-side")).toBe("right");
    expect(ths[3].getAttribute("style")).toContain("right: 80px");
    // actions is the rightmost, no trailing right-frozen → 0
    expect(ths[4].getAttribute("data-frozen-side")).toBe("right");
    expect(ths[4].getAttribute("style")).toContain("right: 0px");
    // mid columns get no data-frozen-side
    expect(ths[1].getAttribute("data-frozen-side")).toBeNull();
    g.destroy();
  });

  it("computeFrozenOffsets accumulates right trailing widths only", () => {
    document.body.innerHTML = `
      <table id="rg" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true">ID</th>
          <th data-column-id="name">Name</th>
          <th data-column-id="status" data-frozen="right" data-width="120">Status</th>
          <th data-column-id="actions" data-frozen="right" data-width="80">Actions</th>
        </tr></thead>
        <tbody><tr><td>1</td><td>x</td><td>open</td><td>edit</td></tr></tbody>
      </table>
    `;
    const g = new Boostgrid(document.getElementById("rg") as HTMLTableElement, {
      rowCount: -1,
      navigation: 0,
    });
    const visible = g.columns.filter((c) => c.visible);
    const offsets = computeFrozenOffsets(g, visible);
    // index 0 (id) → status (120) + actions (80) trailing
    expect(offsets.right[0]).toBe(200);
    // index 2 (status) → only actions (80) trailing
    expect(offsets.right[2]).toBe(80);
    // index 3 (actions, last) → nothing trailing
    expect(offsets.right[3]).toBe(0);
    g.destroy();
  });

  it("supports mixed left + right frozen columns in a single row", () => {
    document.body.innerHTML = `
      <table id="mg" class="table">
        <thead><tr>
          <th data-column-id="id" data-identifier="true" data-frozen="left" data-width="80">ID</th>
          <th data-column-id="sender" data-frozen="left" data-width="200">Sender</th>
          <th data-column-id="subject" data-width="300">Subject</th>
          <th data-column-id="status" data-frozen="right" data-width="120">Status</th>
          <th data-column-id="actions" data-frozen="right" data-width="80">Actions</th>
        </tr></thead>
        <tbody><tr><td>1</td><td>a</td><td>b</td><td>c</td><td>x</td></tr></tbody>
      </table>
    `;
    const g = new Boostgrid(document.getElementById("mg") as HTMLTableElement, {
      rowCount: -1,
      navigation: 0,
    });
    const tds = g.element.querySelectorAll<HTMLTableCellElement>("tbody > tr:first-child > td");
    expect(tds[0].getAttribute("data-frozen-side")).toBe("left");
    expect(tds[1].getAttribute("data-frozen-side")).toBe("left");
    expect(tds[1].getAttribute("style")).toContain("left: 80px");
    expect(tds[2].getAttribute("data-frozen-side")).toBeNull();
    expect(tds[3].getAttribute("data-frozen-side")).toBe("right");
    expect(tds[3].getAttribute("style")).toContain("right: 80px");
    expect(tds[4].getAttribute("data-frozen-side")).toBe("right");
    expect(tds[4].getAttribute("style")).toContain("right: 0px");
    g.destroy();
  });

  it("toggles boostgrid--scrolled-x on horizontal scroll of .table-responsive parent", () => {
    const g = new Boostgrid(makeWideTable(), { rowCount: -1, navigation: 0 });
    const wrapper = g.element.parentElement!;
    const scrollParent = wrapper.closest(".table-responsive") as HTMLElement;
    // Default scrollLeft = 0 → class absent
    expect(wrapper.classList.contains("boostgrid--scrolled-x")).toBe(false);
    // Simulate horizontal scroll — jsdom doesn't reflow but accepts assignment + dispatch
    Object.defineProperty(scrollParent, "scrollLeft", { configurable: true, get: () => 30 });
    scrollParent.dispatchEvent(new Event("scroll"));
    expect(wrapper.classList.contains("boostgrid--scrolled-x")).toBe(true);
    g.destroy();
  });
});

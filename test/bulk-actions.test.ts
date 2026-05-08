import { describe, it, expect, beforeEach, vi } from "vitest";
import { Boostgrid } from "../src/core";

function makeTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table id="bgrid" class="table">
      <thead>
        <tr>
          <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
          <th data-column-id="name">Name</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>alpha</td></tr>
        <tr><td>2</td><td>beta</td></tr>
        <tr><td>3</td><td>gamma</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById("bgrid") as HTMLTableElement;
}

describe("Boostgrid bulk-action bar", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

  it("does not mount the bar when bulkActions is null", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, selection: true, multiSelect: true,
    });
    expect(g["rootContainer" as keyof typeof g] instanceof HTMLDivElement).toBe(true);
    const root = (g as any).rootContainer as HTMLDivElement;
    expect(root.querySelector(".boostgrid-bulkbar")).toBeNull();
    g.destroy();
  });

  it("mounts hidden when bulkActions is set but selection is empty", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, selection: true, multiSelect: true,
      bulkActions: () => `<button data-bg-action="archive">Archive</button>`,
    });
    const bar = (g as any).rootContainer.querySelector(".boostgrid-bulkbar") as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.display).toBe("none");
    g.destroy();
  });

  it("appears when selection becomes non-empty and shows the count", () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, selection: true, multiSelect: true,
      bulkActions: () => `<button data-bg-action="archive">Archive</button>`,
    });
    g.select([1, 3]);
    const bar = (g as any).rootContainer.querySelector(".boostgrid-bulkbar") as HTMLElement;
    expect(bar.style.display).not.toBe("none");
    expect(bar.querySelector(".boostgrid-bulkbar-count")?.textContent).toBe("2 selected");
    expect(bar.querySelector('[data-bg-action="archive"]')).not.toBeNull();
    g.destroy();
  });

  it("user-supplied content receives the live row objects", () => {
    const renderer = vi.fn((rows) => `<span data-test="bulk">picked ${rows.length}</span>`);
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, selection: true, multiSelect: true,
      bulkActions: renderer,
    });
    g.select([2]);
    expect(renderer).toHaveBeenCalled();
    const args = renderer.mock.calls[renderer.mock.calls.length - 1][0];
    expect(Array.isArray(args)).toBe(true);
    expect((args[0] as Record<string, unknown>).id).toBe(2);
    g.destroy();
  });

  it('"Clear" button deselects everything and hides the bar', () => {
    const g = new Boostgrid(makeTable(), {
      rowCount: -1, navigation: 0, selection: true, multiSelect: true,
      bulkActions: () => `<button>Archive</button>`,
    });
    g.select([1, 2, 3]);
    const bar = (g as any).rootContainer.querySelector(".boostgrid-bulkbar") as HTMLElement;
    const clearBtn = bar.querySelector<HTMLButtonElement>('[data-bg-action="bulk-clear"]')!;
    clearBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(g.getSelectedRows()).toEqual([]);
    expect(bar.style.display).toBe("none");
    g.destroy();
  });
});

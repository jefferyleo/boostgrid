import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { useRef, useEffect } from "react";
import { ReactBoostgrid, type ReactBoostgridHandle } from "../src/index";

const SAMPLE = [
  { id: 1, sender: "alpha@x.com", subject: "hi"      },
  { id: 2, sender: "beta@x.com",  subject: "hey"     },
  { id: 3, sender: "gamma@x.com", subject: "howdy"   },
];

const COLUMNS = [
  { id: "id",      text: "ID",      identifier: true, type: "numeric", align: "right" as const },
  { id: "sender",  text: "Sender",  order: "asc" as const },
  { id: "subject", text: "Subject" },
];

describe("ReactBoostgrid", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  afterEach(cleanup);

  it("renders a table with one row per data entry", () => {
    render(<ReactBoostgrid data={SAMPLE} columns={COLUMNS} options={{ rowCount: 10 }} />);
    expect(screen.getByText("alpha@x.com")).toBeTruthy();
    expect(screen.getByText("beta@x.com")).toBeTruthy();
    expect(screen.getByText("gamma@x.com")).toBeTruthy();
  });

  it("emits the supplied event handlers", async () => {
    const onLoaded = vi.fn();
    render(<ReactBoostgrid data={SAMPLE} columns={COLUMNS} onLoaded={onLoaded} />);
    // Boostgrid fires "loaded" synchronously inside loadData() (which the
    // wrapper triggers via append). The handler is wired up in the same
    // useEffect, so loaded fires before the test resumes.
    expect(onLoaded).toHaveBeenCalled();
    const args = onLoaded.mock.calls.at(-1)!;
    expect(Array.isArray(args[0])).toBe(true);
    expect(args[0].length).toBe(3);
  });

  it("re-renders rows when the data prop changes", async () => {
    const { rerender } = render(<ReactBoostgrid data={SAMPLE} columns={COLUMNS} />);
    expect(screen.queryByText("alpha@x.com")).toBeTruthy();
    const updated = [{ id: 99, sender: "delta@x.com", subject: "new" }];
    await act(async () => { rerender(<ReactBoostgrid data={updated} columns={COLUMNS} />); });
    expect(screen.queryByText("alpha@x.com")).toBeNull();
    expect(screen.queryByText("delta@x.com")).toBeTruthy();
  });

  it("exposes an imperative handle via ref", () => {
    function Harness({ onReady }: { onReady: (h: ReactBoostgridHandle) => void }) {
      const ref = useRef<ReactBoostgridHandle>(null);
      useEffect(() => { if (ref.current) onReady(ref.current); }, [onReady]);
      return <ReactBoostgrid ref={ref} data={SAMPLE} columns={COLUMNS} />;
    }
    let handle: ReactBoostgridHandle | null = null;
    render(<Harness onReady={(h) => { handle = h; }} />);
    expect(handle).not.toBeNull();
    expect(typeof handle!.search).toBe("function");
    expect(handle!.grid).not.toBeNull();
    expect(handle!.grid!.getTotalRowCount()).toBe(3);
  });

  it("destroy is called on unmount (no leaked toolbar elements)", () => {
    const { container, unmount } = render(<ReactBoostgrid data={SAMPLE} columns={COLUMNS} />);
    expect(container.querySelector(".boostgrid")).toBeTruthy();
    unmount();
    // After unmount the wrapper element is gone from the React tree and the
    // grid's destroy() has been called — no orphaned chrome should remain in
    // the document body.
    expect(document.body.querySelector(".boostgrid-toolbar")).toBeNull();
  });
});

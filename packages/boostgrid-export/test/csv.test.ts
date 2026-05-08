import { describe, it, expect } from "vitest";
import { rowsToCsv } from "../src/csv";
import { rowsToAoa } from "../src/xlsx";
import type { Column } from "boostgrid";

const stringConv = { from: (v: string) => v, to: (v: unknown) => v == null ? "" : String(v) };

function col<TRow extends Record<string, unknown>>(id: string, text = id): Column<TRow> {
  return {
    id, text,
    identifier: false, type: "string", converter: stringConv,
    align: "left", headerAlign: "left", cssClass: "", headerCssClass: "",
    formatter: null, footerFormatter: null,
    editable: false, editType: "text", editOptions: [],
    frozen: null, order: null, searchable: true, sortable: true, visible: true, width: null,
  };
}

describe("CSV serialization", () => {
  it("emits a CRLF-separated header + body", () => {
    const cols = [col("id"), col("name")];
    const rows = [{ id: 1, name: "alpha" }, { id: 2, name: "beta" }];
    const csv = rowsToCsv(cols, rows);
    expect(csv).toBe("id,name\r\n1,alpha\r\n2,beta");
  });

  it("quotes fields that contain commas, quotes, or newlines (RFC 4180)", () => {
    const cols = [col("a"), col("b")];
    const rows = [
      { a: 'has "quote"', b: "x,y" },
      { a: "line1\nline2", b: "carriage\rreturn" },
    ];
    const csv = rowsToCsv(cols, rows);
    expect(csv).toContain(`"has ""quote""","x,y"`);
    expect(csv).toContain(`"line1\nline2","carriage\rreturn"`);
  });

  it("respects a custom delimiter", () => {
    const cols = [col("a"), col("b")];
    const rows = [{ a: "1", b: "2" }];
    expect(rowsToCsv(cols, rows, ";")).toBe("a;b\r\n1;2");
  });

  it("skips invisible columns", () => {
    const a = col("a"); const b = col("b"); b.visible = false;
    const csv = rowsToCsv([a, b], [{ a: "1", b: "2" }]);
    expect(csv).toBe("a\r\n1");
  });
});

describe("XLSX AOA shape", () => {
  it("produces header + body with native numbers preserved", () => {
    const cols = [col("id"), col("name")];
    const rows = [{ id: 1, name: "alpha" }, { id: 2, name: "beta" }];
    const aoa = rowsToAoa(cols, rows);
    expect(aoa[0]).toEqual(["id", "name"]);
    expect(aoa[1]).toEqual([1, "alpha"]);  // 1 stays as a number, not "1"
    expect(aoa[2]).toEqual([2, "beta"]);
  });
});

import type { Boostgrid } from "../core.js";
import type { Column, EditCommit, Row } from "../types.js";

/**
 * Cell-level edit-on-dblclick. One delegated `dblclick` listener on the
 * grid's root catches `<td data-editable="true">` events, swaps an
 * `<input>` (or `<select>`) into the cell, focuses it, and commits on
 * Enter or blur, cancels on Escape. Concurrent edits are serialized:
 * opening a second cell commits the first.
 *
 * The mounted listener is no-op'd when no column is editable, so grids
 * that don't use the feature pay zero runtime cost beyond the tiny check.
 */
export function mountCellEdit<TRow extends Row = Row>(grid: Boostgrid<TRow>): () => void {
  if (!grid.columns.some((c) => c.editable)) return () => { /* noop */ };

  let active: ActiveEditor<TRow> | null = null;

  const openIfApplicable = (target: Element | null) => {
    const td = target?.closest("td[data-editable]") as HTMLTableCellElement | null;
    if (!td || td.querySelector("[data-edit-input]")) return;
    const tr = td.closest("tr");
    const colId = td.getAttribute("data-column-id");
    const rowId = tr?.getAttribute("data-row-id");
    if (!colId || rowId == null) return;

    const column = grid.columns.find((c) => c.id === colId);
    const row = grid.currentRows.find((r) => grid.identifier && String(r[grid.identifier]) === rowId);
    if (!column || !row || !column.editable) return;

    if (active) commit(active, /* silent */ true);
    active = openEditor(grid, td, column, row, () => { active = null; });
  };

  const onDblClick = (e: Event) => openIfApplicable(e.target as Element | null);

  grid.element.addEventListener("dblclick", onDblClick);

  return () => {
    if (active) commit(active, /* silent */ true);
    grid.element.removeEventListener("dblclick", onDblClick);
  };
}

interface ActiveEditor<TRow extends Row> {
  td: HTMLTableCellElement;
  input: HTMLInputElement | HTMLSelectElement;
  column: Column<TRow>;
  row: TRow;
  oldValue: unknown;
  oldHtml: string;
  grid: Boostgrid<TRow>;
  closed: boolean;
  onClose: () => void;
}

function openEditor<TRow extends Row>(
  grid: Boostgrid<TRow>,
  td: HTMLTableCellElement,
  column: Column<TRow>,
  row: TRow,
  onClose: () => void,
): ActiveEditor<TRow> {
  const oldValue = row[column.id];
  const oldHtml = td.innerHTML;

  let input: HTMLInputElement | HTMLSelectElement;
  if (column.editType === "select") {
    const select = document.createElement("select");
    select.className = "form-select form-select-sm boostgrid-edit-input";
    select.setAttribute("data-edit-input", "true");
    for (const opt of column.editOptions) {
      const o = document.createElement("option");
      o.value = String(opt.value);
      o.textContent = opt.label;
      if (String(opt.value) === String(oldValue)) o.selected = true;
      select.appendChild(o);
    }
    input = select;
  } else {
    const inp = document.createElement("input");
    inp.type = column.editType === "number" ? "number" : "text";
    inp.className = "form-control form-control-sm boostgrid-edit-input";
    inp.setAttribute("data-edit-input", "true");
    inp.value = oldValue == null ? "" : String(oldValue);
    input = inp;
  }

  td.innerHTML = "";
  td.appendChild(input);
  // Focus & select on next microtask so the swap is visually immediate
  Promise.resolve().then(() => {
    input.focus();
    if (input instanceof HTMLInputElement) input.select();
  });

  const editor: ActiveEditor<TRow> = {
    td, input, column, row, oldValue, oldHtml, grid, closed: false, onClose,
  };

  const onKey = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === "Enter") { e.preventDefault(); commit(editor, false); }
    else if (ke.key === "Escape") { e.preventDefault(); cancel(editor); }
  };
  input.addEventListener("keydown", onKey);
  input.addEventListener("blur", () => commit(editor, false));

  return editor;
}

function commit<TRow extends Row>(editor: ActiveEditor<TRow>, silent: boolean): void {
  if (editor.closed) return;
  editor.closed = true;
  const raw = editor.input.value;
  const newValue = editor.column.editType === "number" ? Number(raw) : raw;

  // Mutate the row in place — currentRows/filtered/sorted hold the same refs.
  (editor.row as Record<string, unknown>)[editor.column.id] = newValue;
  paintCell(editor.td, editor.column, editor.row);

  if (!silent && editor.grid.options.onCellEdit) {
    const commitInfo: EditCommit<TRow> = {
      row: editor.row,
      column: editor.column,
      oldValue: editor.oldValue,
      newValue,
      revert: () => {
        (editor.row as Record<string, unknown>)[editor.column.id] = editor.oldValue;
        paintCell(editor.td, editor.column, editor.row);
      },
    };
    void editor.grid.options.onCellEdit(commitInfo);
  }
  editor.onClose();
}

function cancel<TRow extends Row>(editor: ActiveEditor<TRow>): void {
  if (editor.closed) return;
  editor.closed = true;
  editor.td.innerHTML = editor.oldHtml;
  editor.onClose();
}

function paintCell<TRow extends Row>(td: HTMLTableCellElement, col: Column<TRow>, row: TRow): void {
  if (col.formatter) {
    td.innerHTML = col.formatter(col, row);
  } else {
    td.textContent = col.converter.to(row[col.id]);
  }
}

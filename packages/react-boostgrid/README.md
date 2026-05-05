# react-boostgrid

A thin React wrapper around [`boostgrid`](https://www.npmjs.com/package/boostgrid) — the Bootstrap 5 data grid.

```tsx
import { ReactBoostgrid } from "react-boostgrid";
import "boostgrid/style.css";

<ReactBoostgrid
  data={rows}
  columns={[
    { id: "id", text: "ID", identifier: true, type: "numeric", align: "right" },
    { id: "sender", text: "Sender" },
  ]}
  options={{ selection: true, multiSelect: true }}
  onSelected={(rows) => console.log(rows)}
/>
```

## Install

```bash
npm install react-boostgrid boostgrid
```

## Props

| Prop | Type | Description |
|---|---|---|
| `data` | `Row[]` | Rows to render. Diffed via `clear()` + `append()` on change. |
| `columns` | `Column[]` | Column declarations rendered as `<th data-column-id>`. |
| `options` | `Partial<BoostgridOptions>` | Forwarded to the core. |
| `className` | `string` | Applied to the table; defaults to `"table table-hover"`. |
| `onLoaded` / `onSelected` / `onDeselected` / `onSorted` / `onSearched` | callback | Maps to grid events. |

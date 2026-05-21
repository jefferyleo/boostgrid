# Boostgrid

[![npm](https://img.shields.io/npm/v/boostgrid?style=flat-square)](https://www.npmjs.com/package/boostgrid)
[![NuGet](https://img.shields.io/nuget/v/Boostgrid?style=flat-square)](https://www.nuget.org/packages/Boostgrid)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Bundle](https://img.shields.io/badge/min%2Bgzip-%3C15%20KB-brightgreen?style=flat-square)

A modern, framework-agnostic data grid for **Bootstrap 5**. No jQuery, written in TypeScript,
ships ESM + UMD.

- 🎯 **Bootstrap 5 native** — uses BS5 classes and CSS variables.
- ⚡ **Fast** — single delegated event listener, memoized derived view, indexed selection lookups,
  debounced search, virtual scrolling for 10k+ rows.
- 📦 **Tiny** — ~9 KB brotli core (15 KB hard ceiling); tree-shakeable formatters.
- 🧠 **Type-safe** — `Boostgrid<TRow>` is generic over your row shape. Formatters,
  callbacks, and footers all infer `TRow` end-to-end.
- 🧩 **Framework-friendly** — vanilla core +
  [`react-boostgrid`](./packages/react-boostgrid) and
  [`vue-boostgrid`](./packages/vue-boostgrid) wrappers.
  Optional [`boostgrid-export`](./packages/boostgrid-export) plugin for CSV / Excel / Print.

### Feature highlights

| | |
|---|---|
| **Sorting / filtering / search** | Multi-column sort, debounced search, custom converters per column |
| **Selection** | Single + multi, headerless checkbox, `getSelectedRows()` API |
| **Pagination** | Top, bottom, both, or `rowsPerPage: -1` (all) |
| **Virtual scroll** | `virtualScroll: true` — windowed rendering with rAF coalescing |
| **Cell edit** | `editable` per column with text / number / select editors, `onCellEdit` commit hook + `revert()` for async rollback |
| **Row grouping** | `groupBy` + `groupAggregators` for subtotals; collapse state persisted |
| **Multi-level grouping** | `groupBy: ["status", "region"]` for nested headers; `colId@N` aggregator key targets a specific tier |
| **Tree data** | `treeMode: true` with adjacency-list `parentId`; expand/collapse caret, ancestor-aware search, cycle/orphan defense |
| **Frozen columns** | `frozen: "left" \| "right"` per column, sticky positioning with directional scroll-shadow |
| **Column reorder + resize** | Drag headers to rearrange (frozen-group constrained); drag right edge to resize; both persisted to v:3 state |
| **Tree drag-to-reparent** | Drop a node onto another to change `parentId`; cycle-guarded; `onReparent` callback can veto |
| **Master/detail rows** | `rowDetail: (row) => string \| HTMLElement` mounts an expandable panel under each row |
| **Cell selection + copy** | `cellSelection: true` for spreadsheet-style range select; Ctrl/Cmd+C copies as TSV |
| **Bulk-action bar** | `bulkActions: (rows) => …` renders a sticky toolbar when selection is non-empty |
| **Loading skeleton** | Animated placeholder rows during ajax fetches (default on; tunable count) |
| **Server-side adapters** | `ajax: true` pairs with `groupBy` + `treeMode` — request payload carries the active state |
| **i18n** | Every UI string in `options.labels`; `Intl.NumberFormat` for the pagination summary via `options.locale` |
| **Sticky header** | `stickyHeader: true` pins `<thead>` via pure CSS; coexists with frozen columns |
| **Auto tooltips** | Truncated cells get a `title` attribute on hover (`truncatedTooltips: true` by default) |
| **Footer aggregates** | `footer: true` + per-column `footerFormatter` or whole-row `footerCallback` |
| **State persistence** | `stateSave: true` — sort / search / page / selection / collapsed groups in localStorage |
| **Formatters** | Built-in `linkify`, `truncate`, `date`, `commands`, `statusBadge`, `numericRange` + your own |
| **AJAX** | `url` option for server-side, supports `Content-Range`-style total count |

## Install

```bash
# npm
npm install boostgrid

# CDN — use .umd.js (the CDN serves .cjs with `application/node`,
#       which modern browsers refuse to execute as a <script>).
<script src="https://cdn.jsdelivr.net/npm/boostgrid@2/dist/boostgrid.umd.js"></script>
<link  href="https://cdn.jsdelivr.net/npm/boostgrid@2/dist/boostgrid.css" rel="stylesheet">

# NuGet
Install-Package Boostgrid
```

## Quick start

```html
<table id="grid" class="table table-hover" data-toggle="boostgrid"
       data-selection="true" data-multi-select="true">
  <thead>
    <tr>
      <th data-column-id="id" data-identifier="true" data-type="numeric">ID</th>
      <th data-column-id="sender" data-order="asc">Sender</th>
      <th data-column-id="received">Received</th>
    </tr>
  </thead>
  <tbody>...</tbody>
</table>
```

```js
import { attach } from "boostgrid";
import "boostgrid/style.css";

attach("#grid"); // or rely on data-toggle="boostgrid" auto-init
```

The full documentation, live examples, and API reference are at the
[showcase site](./docs/index.html) (`npm run dev`).

## Framework wrappers

Both wrappers use the same **host-div pattern**: the wrapper renders an empty
`<div>`, and Boostgrid builds the `<table>` imperatively inside it. The
framework's reconciler never fights the grid's DOM mutations. Both expose
the same imperative handle (`search`, `sort`, `reload`, `getSelectedRows`,
`grid` escape hatch).

### React

```tsx
import { ReactBoostgrid } from "react-boostgrid";
import "boostgrid/style.css";

export default function Inbox() {
  const [rows, setRows] = useState<Row[]>(initial);
  return (
    <ReactBoostgrid
      data={rows}
      columns={[
        { id: "id", text: "ID", identifier: true, type: "numeric" },
        { id: "sender", text: "Sender", order: "asc" },
        { id: "subject", text: "Subject" },
      ]}
      options={{ selection: true, stateSave: true }}
      onSelected={(rows) => console.log(rows)}
    />
  );
}
```

### Vue 3

```vue
<script setup lang="ts">
import { ref } from "vue";
import { VueBoostgrid } from "vue-boostgrid";
import "boostgrid/style.css";

const data = ref([{ id: 1, sender: "alpha@x.com", subject: "Welcome" }]);
const cols = [
  { id: "id", text: "ID", identifier: true, type: "numeric" },
  { id: "sender", text: "Sender", order: "asc" },
  { id: "subject", text: "Subject" },
];
</script>

<template>
  <VueBoostgrid :data="data" :columns="cols"
    :options="{ stateSave: true, selection: true }"
    @selected="(rs) => console.log(rs)" />
</template>
```

## Export plugin

CSV, Excel, and Print export ship as a separate workspace package so the core
stays tiny. Excel uses the optional peer dependency `xlsx-js-style` via a
runtime dynamic import — install it only if you need `.xlsx` output.

```ts
import { attach } from "boostgrid";
import { attachExport } from "boostgrid-export";

const [grid] = attach("#grid");
const exporter = attachExport(grid, { filename: "messages", include: "filtered" });

exporter.csv();
await exporter.xlsx();   // requires xlsx-js-style
exporter.print();
```

`attachExport` also adds a delegated click listener for declarative buttons:

```html
<button data-bg-export="csv">Export CSV</button>
<button data-bg-export="xlsx">Export Excel</button>
<button data-bg-export="print">Print</button>
```

## Development

```bash
npm install
npm run dev          # Vite dev server with the docs site
npm test             # Vitest, core (49 specs)
npm run test:all     # core + react + export + vue (62 specs)
npm run build        # ESM + UMD + d.ts + css to dist/
npm run build:all    # core + all three workspace packages
npm run size         # bundle-size guard (size-limit, 15 KB ceiling)
```

## Workspace topology

```
boostgrid/                       — core (this package)
├── packages/
│   ├── react-boostgrid/         — React 18+ wrapper
│   ├── vue-boostgrid/           — Vue 3 wrapper
│   └── boostgrid-export/        — CSV / Excel / Print plugin
├── docs/                        — showcase site (deployed to GitHub Pages)
└── dist/                        — build output (gitignored)
```

## License

MIT — Copyright © Jeffery Leo.

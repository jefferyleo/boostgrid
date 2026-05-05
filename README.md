# Boostgrid

[![npm](https://img.shields.io/npm/v/boostgrid?style=flat-square)](https://www.npmjs.com/package/boostgrid)
[![NuGet](https://img.shields.io/nuget/v/Boostgrid?style=flat-square)](https://www.nuget.org/packages/Boostgrid)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Bundle](https://img.shields.io/badge/min%2Bgzip-%3C15%20KB-brightgreen?style=flat-square)

A modern, framework-agnostic data grid for **Bootstrap 5**. No jQuery, written in TypeScript,
ships ESM + UMD.

- 🎯 **Bootstrap 5 native** — uses BS5 classes and CSS variables.
- ⚡ **Fast** — single delegated event listener, memoized derived view, indexed selection lookups,
  debounced search, optional virtual scrolling.
- 📦 **Tiny** — &lt; 15 KB min+gzip core; tree-shakeable formatters.
- 🧩 **Framework-friendly** — vanilla core + a [`react-boostgrid`](./packages/react-boostgrid)
  wrapper (see below). Vue / Angular / Blazor wrappers planned.

## Install

```bash
# npm
npm install boostgrid

# CDN
<script src="https://cdn.jsdelivr.net/npm/boostgrid@2/dist/boostgrid.umd.cjs"></script>
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

## React

A first-class React wrapper ships in
[`packages/react-boostgrid`](./packages/react-boostgrid):

```tsx
import { ReactBoostgrid } from "react-boostgrid";
import "boostgrid/style.css";

export default function Inbox() {
  const [rows, setRows] = useState<Row[]>(initial);
  return (
    <ReactBoostgrid
      data={rows}
      columns={[
        { id: "id", text: "ID", identifier: true, type: "numeric", align: "right" },
        { id: "sender", text: "Sender", order: "asc" },
        { id: "subject", text: "Subject" },
      ]}
      options={{ rowCount: 10, selection: true, multiSelect: true }}
      onSelected={(rows) => console.log(rows)}
    />
  );
}
```

The wrapper renders only an empty host `<div>`; the table is built imperatively
on mount, so React's reconciler never fights the DOM mutations boostgrid does.
A live demo lives on the *Examples → React wrapper* tab of the docs site.

## Development

```bash
npm install
npm run dev      # Vite dev server with the docs site
npm test         # Vitest
npm run build    # ESM + UMD + d.ts + css to dist/
npm run size     # bundle-size guard (size-limit)
```

## License

MIT — Copyright © Jeffery Leo.

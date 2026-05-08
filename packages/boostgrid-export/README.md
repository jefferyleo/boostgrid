# boostgrid-export

CSV / Excel / Print export plugin for [boostgrid](https://www.npmjs.com/package/boostgrid).

```bash
npm install boostgrid boostgrid-export
# Optional: only needed if you call `xlsx()`
npm install xlsx-js-style
```

## Usage

```ts
import { attach } from "boostgrid";
import { attachExport } from "boostgrid-export";

const [grid] = attach("#grid");
const exporter = attachExport(grid, {
  filename: "messages",
  // include: "current" | "filtered" | "all"   — default "filtered"
});

exporter.csv();
await exporter.xlsx();   // dynamic-imports xlsx-js-style
exporter.print();
```

You can also wire export buttons declaratively. Any
`<button data-bg-export="csv|xlsx|print">` inside the grid's wrapper is
captured by a delegated click listener:

```html
<button class="btn btn-outline-secondary" data-bg-export="csv">Export CSV</button>
<button class="btn btn-outline-secondary" data-bg-export="xlsx">Export Excel</button>
<button class="btn btn-outline-secondary" data-bg-export="print">Print</button>
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `filename` | string | `"boostgrid"` | Output filename without extension. |
| `include` | `"current" \| "filtered" \| "all"` | `"filtered"` | Row slice to write out. |
| `csvDelimiter` | string | `","` | CSV field separator. |
| `xlsxSheetName` | string | `"Sheet1"` | Excel sheet name. |
| `printTitle` | string | `"Print"` | `<title>` of the print window. |

## License

MIT — Jeffery Leo

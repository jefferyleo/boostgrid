# vue-boostgrid

Vue 3 wrapper for [boostgrid](https://www.npmjs.com/package/boostgrid).

```bash
npm install boostgrid vue-boostgrid
```

## Usage

```vue
<script setup lang="ts">
import { ref } from "vue";
import { VueBoostgrid, type VueBoostgridHandle } from "vue-boostgrid";
import "boostgrid/style.css";

interface Message {
  id: number;
  sender: string;
  subject: string;
  received: string;
}

const data = ref<Message[]>([
  { id: 1, sender: "alpha@x.com", subject: "Welcome",  received: "2026-01-01" },
  { id: 2, sender: "beta@x.com",  subject: "Hello",    received: "2026-01-05" },
]);

const cols = [
  { id: "id",       text: "ID",       identifier: true, type: "numeric" },
  { id: "sender",   text: "Sender",   order: "asc" as const },
  { id: "subject",  text: "Subject" },
  { id: "received", text: "Received" },
];

const handle = ref<VueBoostgridHandle | null>(null);

function searchAlpha() {
  handle.value?.search("alpha");
}
</script>

<template>
  <button @click="searchAlpha">Search alpha</button>
  <VueBoostgrid
    :data="data"
    :columns="cols"
    :options="{ stateSave: true, selection: true, multiSelect: true }"
    @selected="(rows) => console.log('selected:', rows)"
    ref="handle"
  />
</template>
```

## Component reference

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `Row[]` | required | Rows to render. Reassign the array to trigger a clear+append. |
| `columns` | `ColumnDef[]` | required | Column declarations. |
| `options` | `Partial<BoostgridOptions>` | `{}` | Forwarded to the core constructor. |
| `className` | `string` | `""` | Class on the wrapping host `<div>`. |
| `tableClassName` | `string` | `"table table-hover"` | Class on the underlying `<table>`. |

### Events

`loaded`, `selected`, `deselected`, `sorted`, `searched` — map 1:1 to grid events.

### Imperative handle

Access via `ref`:

```ts
const handle = ref<VueBoostgridHandle | null>(null);
handle.value?.search("alpha");
handle.value?.sort({ received: "desc" });
handle.value?.reload();
handle.value?.getSelectedRows();
handle.value?.grid;  // raw Boostgrid instance escape hatch
```

## License

MIT — Jeffery Leo

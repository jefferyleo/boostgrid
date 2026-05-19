// Docs-site bootstrap: loads boostgrid (built ESM bundle) and wires up
// the Examples / Documentation tabs.
// Goes through the page's `<script type="importmap">` so a single
// version-bump in index.html cache-busts every consumer at once.
import { Boostgrid, attach as _attach } from "boostgrid";

// All showcase examples render bottom-pagination only — overrides Boostgrid's
// default navigation bitmask (3 = top + bottom). Per-example options still win.
const attach = (target, options = {}) => _attach(target, { navigation: 2, ...options });

document.getElementById("year").textContent = new Date().getFullYear();
window.Boostgrid = Boostgrid;
window.boostgridAttach = attach;

const SAMPLE_URL = "data/sample.json";
let cachedSample = null;
async function loadSample() {
  if (!cachedSample) cachedSample = await (await fetch(SAMPLE_URL)).json();
  return cachedSample;
}

// Each example: HTML fragment + a setup function that mounts the grid AFTER
// the fragment is in the DOM and any data is loaded.
const EXAMPLES = [
  {
    id: "basic",
    title: "Basic",
    file: "examples/basic.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-basic tbody", data, ["id","sender","subject","received"]);
      attach("#ex-basic");
    },
  },
  {
    id: "selection",
    title: "Row selection",
    file: "examples/selection.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-sel tbody", data, ["id","sender","subject","received"]);
      const [grid] = attach("#ex-sel");
      document.getElementById("ex-sel-show").onclick = () => {
        alert("Selected ids: " + JSON.stringify(grid.getSelectedRows()));
      };
      document.getElementById("ex-sel-remove").onclick = () => grid.remove();
    },
  },
  {
    id: "formatter",
    title: "Custom formatter",
    file: "examples/formatter.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-fmt tbody", data, ["id","sender","subject","status"]);
      attach("#ex-fmt", {
        formatters: {
          statusBadge(_col, row) {
            const map = { 0: ["success","OK"], 1: ["info","Info"], 2: ["warning","Warn"], 3: ["danger","Error"] };
            const [variant, label] = map[Number(row.status)] ?? ["secondary","?"];
            return `<span class="badge text-bg-${variant}">${label}</span>`;
          },
        },
      });
    },
  },
  {
    id: "search",
    title: "Search & sort",
    file: "examples/search.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-search tbody", data, ["id","sender","subject","received"]);
      attach("#ex-search");
    },
  },
  {
    id: "alignment",
    title: "Header & row align",
    file: "examples/alignment.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-align tbody", data, ["id","sender","subject","received","status"]);
      attach("#ex-align");
    },
  },
  {
    id: "commands",
    title: "Commands column",
    file: "examples/commands.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-cmd tbody", data.slice(0, 12), ["id","sender","subject"]);
      const [grid] = attach("#ex-cmd", {
        formatters: {
          commands(_col, row) {
            return `<div class="btn-group btn-group-sm" role="group" aria-label="row commands">
              <button type="button" class="btn btn-outline-primary" data-bg-action="cmd-edit" data-bg-value="${row.id}" title="Edit">
                <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn btn-outline-danger" data-bg-action="cmd-delete" data-bg-value="${row.id}" title="Delete">
                <i class="bi bi-trash"></i>
              </button>
            </div>`;
          },
        },
      });
      // Delegated handler scoped to this grid's container
      const log = document.getElementById("ex-cmd-log");
      const root = grid.element.closest(".boostgrid") ?? grid.element.parentElement;
      root?.addEventListener("click", (e) => {
        const t = e.target.closest("[data-bg-action]");
        if (!t) return;
        const action = t.dataset.bgAction;
        const id = Number(t.dataset.bgValue);
        if (action === "cmd-edit")   logLine(log, `edit  → row id=${id}`);
        if (action === "cmd-delete") { logLine(log, `delete → row id=${id}`); grid.remove([id]); }
      });
    },
  },
  {
    id: "inline-edit",
    title: "Inline row edit",
    file: "examples/inline-edit.html",
    async setup() {
      const data = await loadSample();
      const editable = data.slice(0, 8).map((r) => ({ ...r }));
      fillTbody("#ex-edit tbody", editable, ["id","sender","subject"]);
      const [grid] = attach("#ex-edit", {
        formatters: {
          editText(col, row) {
            const v = String(row[col.id] ?? "").replace(/"/g, "&quot;");
            return `<input type="text" class="form-control form-control-sm" data-edit-id="${row.id}" data-edit-field="${col.id}" value="${v}">`;
          },
        },
      });
      const log = document.getElementById("ex-edit-log");
      grid.element.addEventListener("change", (e) => {
        const inp = e.target.closest("input[data-edit-field]");
        if (!inp) return;
        const id = Number(inp.dataset.editId);
        const field = inp.dataset.editField;
        const oldVal = editable.find((r) => r.id === id)?.[field];
        const newVal = inp.value;
        const row = editable.find((r) => r.id === id);
        if (row) row[field] = newVal;
        logLine(log, `id=${id} ${field}: "${oldVal}" → "${newVal}"`);
      });
    },
  },
  {
    id: "ajax",
    title: "Server-side (Ajax)",
    file: "examples/ajax.html",
    async setup() {},
  },
  {
    id: "responsive",
    title: "Responsive",
    file: "examples/responsive.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-resp tbody", data, ["id","sender","subject","received","status"]);
      attach("#ex-resp");
    },
  },
  {
    id: "column-vis",
    title: "Column visibility",
    file: "examples/column-vis.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-colvis tbody", data, ["id","sender","subject","received","status"]);
      attach("#ex-colvis");
    },
  },
  {
    id: "external-toolbar",
    title: "External toolbar",
    file: "examples/external-toolbar.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-tb tbody", data, ["id","sender","subject","received"]);
      const [grid] = attach("#ex-tb");
      let nextId = 1000;
      document.getElementById("ex-tb-add")?.addEventListener("click", () => {
        grid.append([{ id: nextId++, sender: "new@example.com", subject: "Hot off the press", received: "2026-05-04" }]);
      });
      document.getElementById("ex-tb-clear")?.addEventListener("click", () => grid.clear());
      document.getElementById("ex-tb-search")?.addEventListener("click", () => grid.search("alpha"));
      document.getElementById("ex-tb-reload")?.addEventListener("click", () => {
        grid.clear();
        grid.append(data);
        grid.search("");
      });
    },
  },
  {
    id: "multi-sort",
    title: "Multi-column sort",
    file: "examples/multi-sort.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-msort tbody", data, ["id","sender","subject","received"]);
      attach("#ex-msort", { multiSort: true });
    },
  },
  {
    id: "page-sizes",
    title: "Custom page sizes",
    file: "examples/page-sizes.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-pages tbody", data, ["id","sender","subject","received"]);
      attach("#ex-pages", { rowCount: [5, 10, 25, -1] });
    },
  },
  {
    id: "events-log",
    title: "Events log",
    file: "examples/events-log.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-events tbody", data, ["id","sender","subject"]);
      const [grid] = attach("#ex-events", { selection: true, multiSelect: true });
      const log = document.getElementById("ex-events-log");
      const names = ["initialized","load","loaded","appended","removed","cleared","selected","deselected","sorted","searched"];
      names.forEach((name) => {
        grid.on(name, (...args) => {
          const arg = args.length === 0 ? "—" : JSON.stringify(args[0]).slice(0, 80);
          logLine(log, `${name}  ${arg}`);
        });
      });
    },
  },
  {
    id: "no-results",
    title: "Empty / no-results state",
    file: "examples/no-results.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-empty tbody", data.slice(0, 12), ["id","sender","subject"]);
      const [grid] = attach("#ex-empty", {
        labels: {
          noResults: "No matches — try a different search.",
          empty:     "Nothing here yet.",
        },
      });
      document.getElementById("ex-empty-filter")?.addEventListener("click", () => grid.search("zzzznotfound"));
      document.getElementById("ex-empty-clear")?.addEventListener("click", () => grid.search(""));
      document.getElementById("ex-empty-wipe")?.addEventListener("click", () => grid.clear());
    },
  },
  {
    id: "icons",
    title: "Icon set swap",
    file: "examples/icons.html",
    async setup() {
      // Lazy-inject FontAwesome stylesheet for this demo
      if (!document.getElementById("ex-fa-cdn")) {
        const link = document.createElement("link");
        link.id = "ex-fa-cdn";
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/css/all.min.css";
        document.head.appendChild(link);
      }
      const data = await loadSample();
      fillTbody("#ex-icons tbody", data, ["id","sender","subject"]);
      const mod = await import("../../dist/boostgrid.js");
      attach("#ex-icons", { icons: mod.fontAwesomeIcons });
    },
  },
  {
    id: "row-click",
    title: "Row-click select",
    file: "examples/row-click.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-rowclick tbody", data, ["id","sender","subject","received"]);
      const [grid] = attach("#ex-rowclick", {
        selection: true, multiSelect: true, rowSelect: true, keepSelection: true,
      });
      const out = document.getElementById("ex-rowclick-out");
      const render = () => { out.textContent = JSON.stringify(grid.getSelectedRows()); };
      grid.on("selected", render);
      grid.on("deselected", render);
    },
  },
  {
    id: "api-panel",
    title: "Programmatic API panel",
    file: "examples/api-panel.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-api tbody", data.slice(0, 12), ["id","sender","subject"]);
      const [grid] = attach("#ex-api", { selection: true, multiSelect: true });
      const log = document.getElementById("ex-api-log");
      let extraId = 900;
      const root = grid.element.closest(".boostgrid") ?? grid.element.parentElement;
      root?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-api]");
        if (!btn) return;
        const op = btn.dataset.api;
        try {
          if (op === "append")   { grid.append([{ id: extraId++, sender: "api@x.io", subject: "appended via api" }]); logLine(log, `append → id=${extraId - 1}`); }
          if (op === "remove")   { const sel = grid.getSelectedRows(); grid.remove(); logLine(log, `remove(selected) → ${JSON.stringify(sel)}`); }
          if (op === "clear")    { grid.clear(); logLine(log, "clear()"); }
          if (op === "select")   { grid.select(); logLine(log, "select(visible)"); }
          if (op === "deselect") { grid.deselect(); logLine(log, "deselect(all)"); }
          if (op === "search")   { grid.search("alpha"); logLine(log, 'search("alpha")'); }
          if (op === "sort")     { grid.sort({ sender: "asc" }); logLine(log, 'sort({sender:"asc"})'); }
          if (op === "reload")   { grid.reload(); logLine(log, "reload()"); }
          if (op === "info")     { logLine(log, `getCurrentRows() → ${grid.getCurrentRows().length} rows · page ${grid.getCurrentPage()}/${grid.getTotalPageCount()}`); }
        } catch (err) { logLine(log, `error: ${err.message}`); }
      });
    },
  },
  {
    id: "multi-formatter",
    title: "Combined formatters",
    file: "examples/multi-formatter.html",
    async setup() {
      const data = await loadSample();
      // Synthesize an amount field so the money formatter has something to render
      const enriched = data.map((r, i) => ({ ...r, amount: ((i + 1) * 137.5) % 9999 }));
      fillTbody("#ex-mfmt tbody", enriched, ["id","sender","subject","amount","received","status"]);
      const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
      const rtf   = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      attach("#ex-mfmt", {
        formatters: {
          money(_col, row) { return money.format(Number(row.amount) || 0); },
          rel(_col, row) {
            const t = new Date(row.received).getTime();
            if (Number.isNaN(t)) return row.received ?? "";
            const days = Math.round((t - Date.now()) / 86400000);
            return rtf.format(days, "day");
          },
          pill(_col, row) {
            const map = { 0: ["success","OK"], 1: ["info","Info"], 2: ["warning","Warn"], 3: ["danger","Error"] };
            const [v, l] = map[Number(row.status)] ?? ["secondary","?"];
            return `<span class="badge text-bg-${v}">${l}</span>`;
          },
        },
      });
    },
  },
  {
    id: "modal",
    title: "Inside a BS5 modal",
    file: "examples/modal.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-modal-grid tbody", data, ["id","sender","subject","received"]);
      const modalEl = document.getElementById("ex-modal");

      // Portal the modal out to <body> — the example frame creates a stacking /
      // containment context, which would otherwise trap the modal's fixed
      // positioning behind the backdrop.
      if (modalEl && modalEl.parentElement !== document.body) {
        document.body.appendChild(modalEl);
      }

      let grid;
      const bs = window.bootstrap;
      const instance = bs?.Modal ? bs.Modal.getOrCreateInstance(modalEl) : null;
      document.getElementById("ex-modal-open")?.addEventListener("click", () => {
        instance ? instance.show() : modalEl.classList.add("show");
      });
      // Defer attach() until the dialog is actually visible — measures correctly
      modalEl.addEventListener("shown.bs.modal", () => {
        if (!grid) {
          [grid] = attach("#ex-modal-grid", { selection: true, multiSelect: true });
        } else {
          grid.reload();
        }
      });
    },
  },
  {
    id: "state",
    title: "State persistence",
    file: "examples/state.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-state tbody", data, ["id","sender","subject","received"]);
      const [grid] = attach("#ex-state", {
        stateSave: true,
        stateKey: "boostgrid:ex-state",
        rowCount: [5, 10, 25, -1],
      });
      document.getElementById("ex-state-clear")?.addEventListener("click", () => {
        grid.clearSavedState();
        // Visually reset the live grid too so the user sees the wipe took effect
        grid.search("");
        grid.sort({});
        grid.columns.forEach((c) => (c.visible = true));
        grid.reload();
      });
    },
  },
  {
    id: "typed",
    title: "Typed rows (TS generics)",
    file: "examples/typed.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-typed tbody", data, ["id","sender","subject","received"]);
      attach("#ex-typed");
    },
  },
  {
    id: "footer",
    title: "Footer / column totals",
    file: "examples/footer.html",
    async setup() {
      const data = await loadSample();
      // Synthesize an amount column so the sum is meaningful
      const enriched = data.map((r, i) => ({ ...r, amount: ((i + 1) * 137.5) % 9999 }));
      fillTbody("#ex-foot tbody", enriched, ["id","sender","subject","amount"]);
      const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
      attach("#ex-foot", {
        formatters: {
          money: (_col, row) => money.format(Number(row.amount) || 0),
        },
        footerFormatters: {
          sumAmount: (_col, ctx) => {
            const total = ctx.filteredRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
            return `<strong>${money.format(total)}</strong>`;
          },
        },
        footerCallback: (tr, ctx) => {
          const cell = tr.querySelector('[data-column-id="subject"]');
          if (cell) {
            cell.innerHTML = `<span class="text-muted small">Showing ${ctx.start}–${ctx.end} of ${ctx.filteredRows.length}</span>`;
          }
        },
      });
    },
  },
  {
    id: "virtual-scroll",
    title: "Virtual scroll · 10k rows",
    file: "examples/virtual-scroll.html",
    async setup() {
      // Generate a 10,000-row dataset client-side (mock data)
      const N = 10000;
      const senders = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
      const rows = Array.from({ length: N }, (_, i) => ({
        id: i + 1,
        sender: `${senders[i % senders.length]}${i + 1}@example.com`,
        subject: `Subject line #${i + 1}`,
        received: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
      }));
      fillTbody("#ex-vs tbody", rows, ["id", "sender", "subject", "received"]);
      attach("#ex-vs", { virtualScroll: true, rowHeight: 32, overscan: 5 });
      const counter = document.getElementById("ex-vs-count");
      if (counter) counter.textContent = N.toLocaleString();
    },
  },
  {
    id: "cell-edit",
    title: "Cell edit (dblclick)",
    file: "examples/cell-edit.html",
    async setup() {
      const data = await loadSample();
      const editable = data.slice(0, 12).map((r) => ({ ...r }));
      fillTbody("#ex-edit-cell tbody", editable, ["id", "sender", "subject", "status"]);
      const log = document.getElementById("ex-edit-cell-log");
      attach("#ex-edit-cell", {
        formatters: {
          statusBadge(_col, row) {
            const map = { 0: ["success","OK"], 1: ["info","Info"], 2: ["warning","Warn"], 3: ["danger","Error"] };
            const [v, l] = map[Number(row.status)] ?? ["secondary","?"];
            return `<span class="badge text-bg-${v}">${l}</span>`;
          },
        },
        onCellEdit: ({ row, column, oldValue, newValue }) => {
          logLine(log, `id=${row.id} ${column.id}: "${oldValue}" → "${newValue}"`);
        },
      });
    },
  },
  {
    id: "grouping",
    title: "Row grouping + subtotals",
    file: "examples/grouping.html",
    async setup() {
      const data = await loadSample();
      // Synthesize an amount column so the subtotal aggregator has something to sum
      const enriched = data.map((r, i) => ({ ...r, amount: ((i + 1) * 137.5) % 9999 }));
      fillTbody("#ex-grp tbody", enriched, ["id", "status", "sender", "subject", "amount"]);
      attach("#ex-grp", {
        groupBy: "status",
        groupExpanded: "all",
        formatters: {
          statusBadge(_col, row) {
            const map = { 0: ["success","OK"], 1: ["info","Info"], 2: ["warning","Warn"], 3: ["danger","Error"] };
            const [v, l] = map[Number(row.status)] ?? ["secondary","?"];
            return `<span class="badge text-bg-${v}">${l}</span>`;
          },
        },
        groupAggregators: {
          amount: (_col, ctx) => {
            const sum = ctx.rows.reduce((s, r) => s + Number(r.amount || 0), 0);
            return `<strong>$${sum.toFixed(2)}</strong>`;
          },
        },
      });
    },
  },
  {
    id: "frozen",
    title: "Frozen left columns",
    file: "examples/frozen.html",
    async setup() {
      const data = await loadSample();
      // Synthesize the extra columns the wide example shows
      const regions = ["NA", "EU", "APAC", "LATAM"];
      const priorities = ["low", "normal", "high", "urgent"];
      const enriched = data.map((r, i) => ({
        ...r,
        region: regions[i % regions.length],
        priority: priorities[i % priorities.length],
      }));
      fillTbody("#ex-frozen tbody", enriched,
        ["id", "sender", "subject", "received", "status", "region", "priority"]);
      attach("#ex-frozen", {
        formatters: {
          statusBadge(_col, row) {
            const map = { 0: ["success","OK"], 1: ["info","Info"], 2: ["warning","Warn"], 3: ["danger","Error"] };
            const [v, l] = map[Number(row.status)] ?? ["secondary","?"];
            return `<span class="badge text-bg-${v}">${l}</span>`;
          },
        },
      });
    },
  },
  {
    id: "multi-grouping",
    title: "Multi-level grouping",
    file: "examples/multi-grouping.html",
    async setup() {
      // ── Sales-pipeline fixture ───────────────────────────────────────
      // 24 deals across 3 regions × 5 stages × 4 owners, with realistic
      // amounts. Hand-curated so each group has 1-3 rows and the totals
      // tell a clean story.
      const deals = [
        // NA
        { id: 1,  region: "NA",   stage: "Discovery",   deal: "Northwind — replatform pilot",      owner: "Lina Chen",     amount:  18500, closeDate: "2026-08-14" },
        { id: 2,  region: "NA",   stage: "Discovery",   deal: "Acme Robotics — eval",              owner: "Diego Ortiz",   amount:  24000, closeDate: "2026-09-02" },
        { id: 3,  region: "NA",   stage: "Qualified",   deal: "Pinecrest Health — phase 1",        owner: "Lina Chen",     amount:  62000, closeDate: "2026-07-30" },
        { id: 4,  region: "NA",   stage: "Qualified",   deal: "Globex — analytics rollout",        owner: "Maya Iyer",     amount:  88500, closeDate: "2026-08-20" },
        { id: 5,  region: "NA",   stage: "Proposal",    deal: "Initech — annual renewal",          owner: "Diego Ortiz",   amount: 145000, closeDate: "2026-06-30" },
        { id: 6,  region: "NA",   stage: "Proposal",    deal: "Hooli — premium tier",              owner: "Maya Iyer",     amount: 210000, closeDate: "2026-07-12" },
        { id: 7,  region: "NA",   stage: "Closed Won",  deal: "Stark Industries — expansion",      owner: "Lina Chen",     amount: 320000, closeDate: "2026-05-08" },
        { id: 8,  region: "NA",   stage: "Closed Won",  deal: "Wayne Enterprises — pilot",         owner: "Diego Ortiz",   amount:  47000, closeDate: "2026-05-01" },
        { id: 9,  region: "NA",   stage: "Closed Lost", deal: "Cyberdyne — eval lapsed",           owner: "Maya Iyer",     amount:  35000, closeDate: "2026-04-22" },

        // EMEA
        { id: 10, region: "EMEA", stage: "Discovery",   deal: "Ouroboros AB — info gathering",     owner: "Saoirse Walsh", amount:  15800, closeDate: "2026-09-15" },
        { id: 11, region: "EMEA", stage: "Qualified",   deal: "Zentrum AG — security review",      owner: "Saoirse Walsh", amount:  74000, closeDate: "2026-08-04" },
        { id: 12, region: "EMEA", stage: "Qualified",   deal: "Helvetia Bank — pilot",             owner: "Tomás Ribeiro", amount: 112000, closeDate: "2026-07-25" },
        { id: 13, region: "EMEA", stage: "Proposal",    deal: "Nordkraft — multi-year",            owner: "Tomás Ribeiro", amount: 280000, closeDate: "2026-06-15" },
        { id: 14, region: "EMEA", stage: "Proposal",    deal: "Athena Media — content suite",      owner: "Saoirse Walsh", amount:  96000, closeDate: "2026-07-01" },
        { id: 15, region: "EMEA", stage: "Closed Won",  deal: "Soleil Solar — fleet rollout",      owner: "Tomás Ribeiro", amount: 168000, closeDate: "2026-04-30" },
        { id: 16, region: "EMEA", stage: "Closed Lost", deal: "Riverside Press — went in-house",   owner: "Saoirse Walsh", amount:  54000, closeDate: "2026-05-12" },

        // APAC
        { id: 17, region: "APAC", stage: "Discovery",   deal: "Kookaburra Mining — scoping",       owner: "Hiro Tanaka",   amount:  22500, closeDate: "2026-09-20" },
        { id: 18, region: "APAC", stage: "Discovery",   deal: "Sapporo Logistics — intro",         owner: "Hiro Tanaka",   amount:  17000, closeDate: "2026-09-30" },
        { id: 19, region: "APAC", stage: "Qualified",   deal: "Vermilion Air — fleet ops",         owner: "Priya Nair",    amount: 130000, closeDate: "2026-07-18" },
        { id: 20, region: "APAC", stage: "Proposal",    deal: "Kestrel Telecom — billing core",    owner: "Priya Nair",    amount: 245000, closeDate: "2026-06-25" },
        { id: 21, region: "APAC", stage: "Proposal",    deal: "Banyan Hotels — guest CRM",         owner: "Hiro Tanaka",   amount:  82000, closeDate: "2026-07-08" },
        { id: 22, region: "APAC", stage: "Closed Won",  deal: "Daiichi Foods — expansion",         owner: "Priya Nair",    amount: 198000, closeDate: "2026-05-20" },
        { id: 23, region: "APAC", stage: "Closed Won",  deal: "Phoenix Retail — ANZ rollout",      owner: "Hiro Tanaka",   amount: 124000, closeDate: "2026-05-04" },
        { id: 24, region: "APAC", stage: "Closed Lost", deal: "Kintaro Studios — paused",          owner: "Priya Nair",    amount:  41000, closeDate: "2026-04-18" },
      ];

      // Render the rows manually — fillTbody serializes via toString and
      // we want amount as a raw number so the formatter can format it.
      const tbody = document.querySelector("#ex-mgrp tbody");
      if (tbody) {
        tbody.innerHTML = "";
        for (const d of deals) {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${d.id}</td><td>${d.region}</td><td>${d.stage}</td><td>${d.deal}</td><td>${d.owner}</td><td>${d.amount}</td><td>${d.closeDate}</td>`;
          tbody.appendChild(tr);
        }
      }

      const money = (n) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
      const sum = (rows) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);

      const stageColors = {
        "Discovery":   ["secondary", "Discovery"],
        "Qualified":   ["info",      "Qualified"],
        "Proposal":    ["primary",   "Proposal"],
        "Closed Won":  ["success",   "Won"],
        "Closed Lost": ["danger",    "Lost"],
      };

      const [grid] = attach("#ex-mgrp", {
        navigation: 0,
        rowCount: -1,
        groupBy: ["region", "stage"],
        groupExpanded: "all",
        formatters: {
          stageBadge: (_col, row) => {
            const [v, l] = stageColors[row.stage] ?? ["secondary", row.stage];
            return `<span class="badge text-bg-${v}">${l}</span>`;
          },
          money: (_col, row) => money(Number(row.amount || 0)),
        },
        groupAggregators: {
          // Region tier (depth 0): pipeline count + grand total
          "deal@0": (_col, ctx) =>
            `<em class="text-muted">${ctx.rows.length} deals</em>`,
          "amount@0": (_col, ctx) =>
            `<strong>${money(sum(ctx.rows))}</strong>`,

          // Stage tier (depth 1): sum + average within the stage
          "amount@1": (_col, ctx) => {
            const total = sum(ctx.rows);
            const avg = total / ctx.rows.length;
            return `<span class="text-muted small">avg ${money(avg)}</span>&nbsp;&nbsp;<strong>${money(total)}</strong>`;
          },

          // Owner tier (depth 2, only when 3-level grouping is on):
          // simple per-owner total, no styling distractions.
          "amount@2": (_col, ctx) => money(sum(ctx.rows)),
        },
      });

      // ── Live controls ────────────────────────────────────────────────
      const groupButtons = document.querySelectorAll('[data-mg-group]');
      groupButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          groupButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const ids = btn.getAttribute("data-mg-group").split(",");
          grid.options.groupBy = ids;
          grid.collapsedGroupPaths.clear();
          grid.rerenderBody();
        });
      });

      const topToggle = document.getElementById("ex-mgrp-top");
      topToggle?.addEventListener("change", () => {
        grid.options.groupSubtotalsOnTop = topToggle.checked;
        grid.rerenderBody();
      });

      document.querySelector('[data-mg-action="expand-all"]')
        ?.addEventListener("click", () => {
          grid.collapsedGroupPaths.clear();
          grid.options.groupExpanded = "all";
          grid.rerenderBody();
        });
      document.querySelector('[data-mg-action="collapse-all"]')
        ?.addEventListener("click", () => {
          grid.collapsedGroupPaths.clear();
          grid.options.groupExpanded = "none";
          grid.rerenderBody();
        });
    },
  },
  {
    id: "tree",
    title: "Tree data",
    file: "examples/tree.html",
    async setup() {
      // Synthesized filesystem-shaped fixture so the example is self-contained.
      const rows = [
        { id: 1,  parentId: null, name: "src",                  size: null,    modified: "2026-04-12" },
        { id: 2,  parentId: 1,    name: "core.ts",              size: 18432,   modified: "2026-04-29" },
        { id: 3,  parentId: 1,    name: "types.ts",             size: 7211,    modified: "2026-04-22" },
        { id: 4,  parentId: 1,    name: "render",               size: null,    modified: "2026-04-30" },
        { id: 5,  parentId: 4,    name: "body.ts",              size: 5632,    modified: "2026-04-30" },
        { id: 6,  parentId: 4,    name: "tree.ts",              size: 4192,    modified: "2026-04-30" },
        { id: 7,  parentId: 4,    name: "group.ts",             size: 5184,    modified: "2026-04-30" },
        { id: 8,  parentId: 4,    name: "header.ts",            size: 2944,    modified: "2026-03-18" },
        { id: 9,  parentId: 1,    name: "styles",               size: null,    modified: "2026-03-15" },
        { id: 10, parentId: 9,    name: "boostgrid.scss",       size: 6144,    modified: "2026-04-30" },
        { id: 11, parentId: null, name: "test",                 size: null,    modified: "2026-04-30" },
        { id: 12, parentId: 11,   name: "boostgrid.test.ts",    size: 9216,    modified: "2026-04-15" },
        { id: 13, parentId: 11,   name: "tree.test.ts",         size: 5120,    modified: "2026-04-30" },
        { id: 14, parentId: 11,   name: "multi-group.test.ts",  size: 4608,    modified: "2026-04-30" },
        { id: 15, parentId: null, name: "docs",                 size: null,    modified: "2026-04-30" },
        { id: 16, parentId: 15,   name: "examples",             size: null,    modified: "2026-04-30" },
        { id: 17, parentId: 16,   name: "tree.html",            size: 2048,    modified: "2026-04-30" },
        { id: 18, parentId: 16,   name: "multi-grouping.html",  size: 2304,    modified: "2026-04-30" },
        { id: 19, parentId: 15,   name: "index.html",           size: 35840,   modified: "2026-04-30" },
        { id: 20, parentId: 15,   name: "assets",               size: null,    modified: "2026-04-30" },
        { id: 21, parentId: 20,   name: "site.css",             size: 30208,   modified: "2026-04-30" },
        { id: 22, parentId: 20,   name: "site.js",              size: 27136,   modified: "2026-04-30" },
      ];
      // Render the rows ourselves — fillTbody assumes string cells; the
      // size formatter wants pretty bytes and "modified" stays as-is.
      const tbody = document.querySelector("#ex-tree tbody");
      if (tbody) {
        tbody.innerHTML = "";
        const fmt = (n) => {
          if (n == null) return "—";
          if (n < 1024) return `${n} B`;
          if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
          return `${(n / 1024 / 1024).toFixed(1)} MB`;
        };
        for (const r of rows) {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${r.id}</td><td>${r.name}</td><td>${fmt(r.size)}</td><td>${r.modified}</td><td>${r.parentId ?? ""}</td>`;
          tbody.appendChild(tr);
        }
      }
      const [grid] = attach("#ex-tree", {
        treeMode: true,
        treeIndentPx: 22,
        treeExpanded: "all",
      });
      // Wire the toolbar buttons
      document.getElementById("ex-tree-expand")
        ?.addEventListener("click", () => grid.expandAllTree());
      document.getElementById("ex-tree-collapse")
        ?.addEventListener("click", () => grid.collapseAllTree());
    },
  },
  {
    id: "column-ux",
    title: "Column UX",
    file: "examples/column-ux.html",
    async setup() {
      const data = await loadSample();
      // The same statusBadge + commands formatters used elsewhere.
      const formatters = {
        statusBadge(_col, row) {
          const map = { 0: ["success","OK"], 1: ["info","Info"], 2: ["warning","Warn"], 3: ["danger","Error"] };
          const [variant, label] = map[Number(row.status)] ?? ["secondary","?"];
          return `<span class="badge text-bg-${variant}">${label}</span>`;
        },
        commands() {
          return `<div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-outline-primary"><i class="bi bi-pencil"></i></button>
            <button type="button" class="btn btn-outline-danger"><i class="bi bi-trash"></i></button>
          </div>`;
        },
      };
      fillTbody("#ex-cux tbody", data, ["id","sender","subject","received","status","actions"]);
      const log = document.getElementById("ex-cux-log");
      const [grid] = attach("#ex-cux", {
        formatters,
        onColumnReorder: (ids) => log && (log.textContent = "Order: " + ids.join(", ")),
        onColumnResize: (id, px) => log && (log.textContent = `Resized ${id} → ${px}px`),
      });
      document.getElementById("ex-cux-reset")?.addEventListener("click", () => {
        grid.resetColumnState();
        if (log) log.textContent = "Columns reset.";
      });
    },
  },
  {
    id: "row-detail",
    title: "Master/detail",
    file: "examples/row-detail.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-rd tbody", data, ["id","sender","subject","received"]);
      const [grid] = attach("#ex-rd", {
        rowDetail: (row) => `
          <div class="row g-3">
            <div class="col-md-7">
              <h6 class="mb-1">${row.subject}</h6>
              <p class="text-muted small mb-0">From <strong>${row.sender}</strong> on ${row.received}.</p>
              <p class="mb-0 mt-2">
                Lorem ipsum preview text rendered for row #${row.id}. Replace this with the deep summary,
                related tasks, or whatever your row deserves.
              </p>
            </div>
            <div class="col-md-5">
              <dl class="row mb-0 small">
                <dt class="col-sm-5">Status</dt>
                <dd class="col-sm-7">${row.status ?? "—"}</dd>
                <dt class="col-sm-5">Received</dt>
                <dd class="col-sm-7"><code>${row.received}</code></dd>
                <dt class="col-sm-5">Row id</dt>
                <dd class="col-sm-7"><code>${row.id}</code></dd>
              </dl>
            </div>
          </div>
        `,
      });
      document.getElementById("ex-rd-expand")?.addEventListener("click", () => grid.expandAllRowDetails());
      document.getElementById("ex-rd-collapse")?.addEventListener("click", () => grid.collapseAllRowDetails());
    },
  },
  {
    id: "bulk-actions",
    title: "Bulk action bar",
    file: "examples/bulk-actions.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-bulk tbody", data, ["id","sender","subject","received"]);
      const [grid] = attach("#ex-bulk", {
        selection: true,
        multiSelect: true,
        keepSelection: true,
        bulkActions: (rows) => `
          <button type="button" class="btn btn-sm btn-outline-primary" data-bg-action="ex-bulk-archive">
            <i class="bi bi-archive"></i> Archive
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-bg-action="ex-bulk-delete">
            <i class="bi bi-trash"></i> Delete
          </button>
          <span class="text-muted small ms-2">spanning rows ${rows.map((r) => r.id).join(", ")}</span>
        `,
      });
      const root = grid.element.parentElement;
      root?.addEventListener("click", (e) => {
        const target = e.target.closest?.("[data-bg-action]");
        if (!target) return;
        if (target.dataset.bgAction === "ex-bulk-delete") grid.remove();
        else if (target.dataset.bgAction === "ex-bulk-archive") {
          alert(`Archived ${grid.getSelectedRows().length} rows (demo).`);
        }
      });
    },
  },
  {
    id: "cell-select",
    title: "Cell selection & copy",
    file: "examples/cell-select.html",
    async setup() {
      const rows = [
        { quarter: "Q1", region: "NA",   revenue: "$1.24M", growth: "+8.4%",  rep: "Lina Chen" },
        { quarter: "Q1", region: "EMEA", revenue: "$0.96M", growth: "+11.2%", rep: "Tomás Ribeiro" },
        { quarter: "Q1", region: "APAC", revenue: "$0.71M", growth: "+5.7%",  rep: "Hiro Tanaka" },
        { quarter: "Q2", region: "NA",   revenue: "$1.41M", growth: "+13.7%", rep: "Diego Ortiz" },
        { quarter: "Q2", region: "EMEA", revenue: "$1.08M", growth: "+12.5%", rep: "Saoirse Walsh" },
        { quarter: "Q2", region: "APAC", revenue: "$0.83M", growth: "+16.9%", rep: "Priya Nair" },
        { quarter: "Q3", region: "NA",   revenue: "$1.58M", growth: "+12.1%", rep: "Maya Iyer" },
        { quarter: "Q3", region: "EMEA", revenue: "$1.21M", growth: "+11.9%", rep: "Tomás Ribeiro" },
        { quarter: "Q3", region: "APAC", revenue: "$0.94M", growth: "+13.3%", rep: "Hiro Tanaka" },
      ];
      const tbody = document.querySelector("#ex-cs tbody");
      if (tbody) {
        tbody.innerHTML = "";
        for (const r of rows) {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${r.quarter}</td><td>${r.region}</td><td>${r.revenue}</td><td>${r.growth}</td><td>${r.rep}</td>`;
          tbody.appendChild(tr);
        }
      }
      attach("#ex-cs", {
        navigation: 0,
        rowCount: -1,
        cellSelection: true,
      });
    },
  },
  {
    id: "server-side",
    title: "Server-side adapter",
    file: "examples/server-side.html",
    async setup() {
      // Mock server: builds a response for whatever payload Boostgrid sends.
      // We synthesize three fixtures (flat, grouped, tree) and pick based
      // on the request body.
      const flatRows = (await loadSample()).slice(0, 12).map((r) => ({
        id: r.id, status: ({0: "open", 1: "info", 2: "warn", 3: "closed"})[Number(r.status)] ?? "open",
        name: r.subject, parentId: null,
      }));
      // Tree fixture: `parentId` drives the hierarchy — Boostgrid renders
      // the indent + caret automatically once `treeColumn` is set on the
      // header. No manual leading spaces needed.
      const treeRows = [
        { id: 1,  status: "open",   name: "Inbox",                  parentId: null },
        { id: 2,  status: "open",   name: "Q4 budget review",       parentId: 1 },
        { id: 3,  status: "open",   name: "Quarterly all-hands",    parentId: 1 },
        { id: 7,  status: "open",   name: "Re: timeline",           parentId: 3 },
        { id: 8,  status: "open",   name: "Re: agenda",             parentId: 3 },
        { id: 4,  status: "closed", name: "Archive",                parentId: null },
        { id: 5,  status: "closed", name: "2025 contracts",         parentId: 4 },
        { id: 6,  status: "closed", name: "2024 contracts",         parentId: 4 },
        { id: 9,  status: "closed", name: "Vendor agreement.pdf",   parentId: 5 },
        { id: 10, status: "closed", name: "Renewal terms.docx",     parentId: 5 },
      ];
      const reqEl = document.getElementById("ex-ss-req");
      const resEl = document.getElementById("ex-ss-res");
      const realFetch = window.fetch;
      window.fetch = async (url, init) => {
        if (!String(url).includes("/api/rows")) return realFetch(url, init);
        const body = init?.body ? JSON.parse(init.body) : {};
        if (reqEl) reqEl.textContent = JSON.stringify(body, null, 2);
        // Simulate a small server delay so the skeleton can shine.
        await new Promise((r) => setTimeout(r, 240));
        let rows;
        if (body.treeMode) rows = treeRows;
        else if (body.groupBy) rows = [...flatRows].sort((a, b) => String(a.status).localeCompare(String(b.status)));
        else rows = flatRows;
        const payload = { current: body.current ?? 1, rowCount: body.rowCount ?? 25, rows, total: rows.length };
        if (resEl) resEl.textContent = JSON.stringify({ current: payload.current, rowCount: payload.rowCount, total: payload.total, rows: `[ ...${rows.length} rows ]` }, null, 2);
        return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
      };

      // Mount once with column markup intact, then mutate options between
      // modes — destroy + re-attach would lose the per-column data-* attrs
      // (data-tree-column, data-identifier) that the markup carries.
      const [grid] = attach("#ex-ss", {
        ajax: true,
        url: "/api/rows",
        rowCount: 12,
        navigation: 2,
        loadingSkeleton: true,
      });

      const setMode = (mode) => {
        // Reset all hierarchy options before applying the new mode.
        grid.options.groupBy = null;
        grid.options.treeMode = false;
        grid.collapsedGroupPaths.clear();
        grid.expandedTreeNodes.clear();
        if (mode === "grouped") {
          grid.options.groupBy = ["status"];
          grid.options.groupExpanded = "all";
        } else if (mode === "tree") {
          grid.options.treeMode = true;
          grid.options.treeExpanded = "all";
          grid.treeExpandTracking = "collapsed"; // "all" → start everything expanded
        }
        grid.reload();
      };

      document.querySelectorAll('[data-ss-mode]').forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll('[data-ss-mode]').forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          setMode(btn.getAttribute("data-ss-mode"));
        });
      });
    },
  },
  {
    id: "sticky",
    title: "Sticky header & tooltips",
    file: "examples/sticky.html",
    async setup() {
      const data = await loadSample();
      // Repeat the sample so we have enough rows to actually scroll.
      const padded = [];
      for (let i = 0; i < 4; i++) for (const r of data) padded.push({ ...r, id: padded.length + 1 });
      fillTbody("#ex-sticky tbody", padded, ["id","sender","subject","received"]);
      attach("#ex-sticky", {
        navigation: 0,
        rowCount: -1,
        stickyHeader: true,
        truncatedTooltips: true,
      });
    },
  },
  {
    id: "i18n",
    title: "Internationalization",
    file: "examples/i18n.html",
    async setup() {
      const data = await loadSample();
      // Generate a much bigger dataset so the locale-aware digit grouping
      // in the "Showing N…" line has something interesting to format.
      const big = [];
      for (let i = 0; i < 800; i++) {
        const r = data[i % data.length];
        big.push({ ...r, id: big.length + 1 });
      }
      fillTbody("#ex-i18n tbody", big, ["id","sender","subject","received"]);

      const localeBundles = {
        "en-US": {
          // Fall back to all defaults
        },
        "de-DE": {
          all: "Alle",
          infos: "Zeige {start} bis {end} von {total} Einträgen",
          loading: "Lädt…",
          noResults: "Keine Treffer.",
          refresh: "Aktualisieren",
          search: "Suche",
          columns: "Spalten",
          searchColumns: "Spalten suchen",
          resetColumns: "Zurücksetzen",
          dragToReorder: "Zum Sortieren ziehen",
          resizeColumn: "{column} skalieren",
          rowDetailsHeader: "Detail",
          showDetails: "Details anzeigen",
          hideDetails: "Details ausblenden",
          bulkActions: "Sammelaktionen",
          bulkSelected: "{n} ausgewählt",
          bulkClear: "Aufheben",
          treeExpand: "Aufklappen",
          treeCollapse: "Zuklappen",
        },
        "ja-JP": {
          all: "すべて",
          infos: "{total} 件中 {start} - {end} 件を表示",
          loading: "読込中…",
          noResults: "該当なし",
          refresh: "再読込",
          search: "検索",
          columns: "列",
          searchColumns: "列を検索",
          resetColumns: "既定に戻す",
          dragToReorder: "ドラッグして並べ替え",
          resizeColumn: "{column} のサイズ変更",
          rowDetailsHeader: "詳細",
          showDetails: "詳細を表示",
          hideDetails: "詳細を非表示",
          bulkActions: "一括操作",
          bulkSelected: "{n} 件選択中",
          bulkClear: "解除",
          treeExpand: "展開",
          treeCollapse: "折り畳み",
        },
      };

      // Locale-aware date formatter, cached per locale so we don't allocate
      // a fresh Intl.DateTimeFormat on every cell render.
      const dateFmts = new Map();
      const localeDate = (_col, row) => {
        const locale = grid?.options?.locale ?? "en-US";
        let fmt = dateFmts.get(locale);
        if (!fmt) {
          fmt = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
          dateFmts.set(locale, fmt);
        }
        const d = new Date(row.received);
        return Number.isNaN(d.getTime()) ? row.received : fmt.format(d);
      };

      // Side-panel rendering: dump a few label keys + the active locale
      // so the user can SEE what's translated at a glance.
      const renderLabelsPanel = (locale, labels) => {
        const dl = document.getElementById("ex-i18n-labels");
        if (!dl) return;
        const rows = [
          ["locale", locale],
          ["search", labels.search ?? "Search"],
          ["all", labels.all ?? "All"],
          ["columns", labels.columns ?? "Columns"],
          ["noResults", labels.noResults ?? "No results found."],
          ["bulkSelected", labels.bulkSelected ?? "{n} selected"],
          ["treeExpand", labels.treeExpand ?? "Expand"],
        ];
        dl.innerHTML = rows
          .map(([k, v]) =>
            `<dt class="text-muted">${k}</dt><dd class="mb-0"><code>${v}</code></dd>`,
          )
          .join("");
      };

      // Mount once. Switching locale just re-points `options.labels` and
      // `options.locale` then re-renders — keeps the column markup intact.
      // `grid` is declared with `let` (not the destructure-const pattern
      // used elsewhere) so the `localeDate` formatter, which closes over
      // it, doesn't fall into the temporal dead zone during the very
      // first render that runs inside attach().
      let grid;
      [grid] = attach("#ex-i18n", {
        locale: "en-US",
        rowCount: 25,
        navigation: 3, // top + bottom toolbars so search / page-size / "All" / pagination summary are all visible
        columnSelection: true,
        formatters: { localeDate },
        labels: localeBundles["en-US"],
      });
      renderLabelsPanel("en-US", localeBundles["en-US"]);

      const setLocale = (locale) => {
        const labels = localeBundles[locale];
        grid.options.locale = locale;
        // Merge so any missing key in a partial translation falls back to the
        // current bag (which itself fell back to defaults at attach time).
        grid.options.labels = { ...grid.options.labels, ...labels };
        // Toolbar strings (search placeholder, "All", columns title) are baked
        // into the toolbars at mount time — redrawChrome rebuilds them.
        grid.redrawChrome();
        // Reload re-runs the body + re-formats the locale-aware date column.
        grid.reload();
        renderLabelsPanel(locale, labels);
      };

      document.querySelectorAll('[data-i18n-locale]').forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll('[data-i18n-locale]').forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          setLocale(btn.getAttribute("data-i18n-locale"));
        });
      });
    },
  },
  {
    id: "tree-reparent",
    title: "Tree drag-to-reparent",
    file: "examples/tree-reparent.html",
    async setup() {
      const rows = [
        { id: 1,  parentId: null, name: "Documents",         size: null   },
        { id: 2,  parentId: 1,    name: "2026",              size: null   },
        { id: 3,  parentId: 2,    name: "Q1 report.pdf",     size: 184320 },
        { id: 4,  parentId: 2,    name: "annual.xlsx",       size: 92160  },
        { id: 5,  parentId: 1,    name: "archive",           size: null   },
        { id: 6,  parentId: 5,    name: "old-budget.xlsx",   size: 73728  },
        { id: 7,  parentId: null, name: "Photos",            size: null   },
        { id: 8,  parentId: 7,    name: "trip.jpg",          size: 2048000 },
        { id: 9,  parentId: 7,    name: "family.jpg",        size: 1536000 },
      ];
      const tbody = document.querySelector("#ex-trep tbody");
      const fmt = (n) => {
        if (n == null) return "—";
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1024 / 1024).toFixed(1)} MB`;
      };
      if (tbody) {
        tbody.innerHTML = "";
        for (const r of rows) {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${r.id}</td><td>${r.name}</td><td>${fmt(r.size)}</td><td>${r.parentId ?? ""}</td>`;
          tbody.appendChild(tr);
        }
      }
      const banner = document.getElementById("ex-trep-banner");
      attach("#ex-trep", {
        treeMode: true,
        treeReparent: true,
        treeExpanded: "all",
        onReparent: (child, newParent) => {
          if (banner) {
            banner.textContent = `Moved "${child.name}" → ${newParent ? `"${newParent.name}"` : "root"}.`;
          }
        },
      });
    },
  },
  {
    id: "export",
    title: "Export · CSV / Excel / Print",
    file: "examples/export.html",
    async setup() {
      const data = await loadSample();
      fillTbody("#ex-export tbody", data, ["id", "sender", "subject", "received"]);
      const [grid] = attach("#ex-export");
      // Lazy-load the export package (separate workspace bundle resolved via importmap)
      try {
        const { attachExport } = await import("boostgrid-export");
        attachExport(grid, { filename: "boostgrid-export-demo", include: "filtered" });
      } catch (err) {
        console.error("[export example]", err);
      }
    },
  },
  {
    id: "vue",
    title: "Vue 3 wrapper",
    file: "examples/vue.html",
    async setup() {
      const data = await loadSample();
      try {
        const [{ createApp, h, ref }, { VueBoostgrid }] = await Promise.all([
          import("vue"),
          import("vue-boostgrid"),
        ]);
        const host = document.getElementById("ex-vue-host");
        if (!host) return;

        const App = {
          setup() {
            const rows = ref(data.map((r) => ({ id: r.id, sender: r.sender, subject: r.subject, received: r.received })));
            const cols = [
              { id: "id",       text: "ID",      identifier: true, type: "numeric", align: "right" },
              { id: "sender",   text: "Sender",  order: "asc" },
              { id: "subject",  text: "Subject" },
              { id: "received", text: "Received" },
            ];
            return () => h(VueBoostgrid, {
              data: rows.value,
              columns: cols,
              options: { rowCount: 10, selection: true, multiSelect: true },
            });
          },
        };
        createApp(App).mount(host);
      } catch (err) {
        console.error("[vue example]", err);
        const host = document.getElementById("ex-vue-host");
        if (host) {
          host.innerHTML = `<div class="text-warning small">Vue preview failed to load: ${err.message}.</div>`;
        }
      }
    },
  },
  {
    id: "react",
    title: "React wrapper",
    file: "examples/react.html",
    async setup() {
      const data = await loadSample();
      // Lazy-load React + the local wrapper bundle (resolved via the importmap
      // in index.html). Failure here just leaves the static code-sample
      // visible — the page does not break.
      try {
        const [{ createElement, useState, useRef }, { createRoot }, { ReactBoostgrid }] = await Promise.all([
          import("react"),
          import("react-dom/client"),
          import("react-boostgrid"),
        ]);
        const host = document.getElementById("ex-react-host");
        if (!host) return;

        const initial = data.map((r) => ({ id: r.id, sender: r.sender, subject: r.subject, received: r.received }));
        const columns = [
          { id: "id",       text: "ID",      identifier: true, type: "numeric", align: "right" },
          { id: "sender",   text: "Sender",  order: "asc" },
          { id: "subject",  text: "Subject" },
          { id: "received", text: "Received" },
        ];

        let setRowsExternal;
        let gridHandle;

        function Demo() {
          const [rows, setRows] = useState(initial);
          const ref = useRef(null);
          setRowsExternal = setRows;
          gridHandle = ref;
          return createElement(ReactBoostgrid, {
            ref,
            data: rows,
            columns,
            options: { rowCount: 10, selection: true, multiSelect: true },
          });
        }

        const root = createRoot(host);
        root.render(createElement(Demo));

        document.getElementById("ex-react-add")?.addEventListener("click", () => {
          setRowsExternal?.((rs) => [
            ...rs,
            { id: 100 + rs.length, sender: "new@user.test", subject: "Hot off the press", received: "2026-05-03" },
          ]);
        });
        document.getElementById("ex-react-search")?.addEventListener("click", () => {
          gridHandle?.current?.search("alpha");
        });
        document.getElementById("ex-react-reload")?.addEventListener("click", () => {
          setRowsExternal?.(initial);
          gridHandle?.current?.search("");
        });
      } catch (err) {
        console.error("[react example]", err);
        const host = document.getElementById("ex-react-host");
        if (host) {
          host.innerHTML = `<div class="text-warning small">React preview failed to load: ${err.message}. The static code sample below still applies.</div>`;
        }
      }
    },
  },
];

function fillTbody(selector, rows, fields) {
  const tbody = document.querySelector(selector);
  if (!tbody) return;
  tbody.innerHTML = rows.map((r) =>
    "<tr>" + fields.map((f) => `<td>${r[f] ?? ""}</td>`).join("") + "</tr>"
  ).join("");
}

function logLine(target, msg) {
  if (!target) return;
  const time = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.textContent = `[${time}]  ${msg}`;
  target.prepend(line);
  while (target.children.length > 8) target.lastChild.remove();
}

// ───── Code-sample tabs (delegated) ─────
document.addEventListener("click", (e) => {
  const tab = e.target.closest?.("[data-code-tab]");
  if (!tab) return;
  const root = tab.closest(".code-samples");
  if (!root) return;
  const id = tab.dataset.codeTab;
  root.querySelectorAll(".code-samples-tab").forEach((t) => t.classList.toggle("active", t === tab));
  root.querySelectorAll(".code-samples-panel").forEach((p) => {
    p.classList.toggle("active", p.dataset.codePanel === id);
  });
});

// Activate first tab in each code-samples block on example load
function initCodeTabs(scope) {
  scope.querySelectorAll(".code-samples").forEach((root) => {
    const firstTab   = root.querySelector(".code-samples-tab");
    const firstPanel = root.querySelector(".code-samples-panel");
    if (firstTab)   firstTab.classList.add("active");
    if (firstPanel) firstPanel.classList.add("active");
  });
}

const list = document.getElementById("exampleList");
let activeAnchor = null;
EXAMPLES.forEach((ex, i) => {
  const a = document.createElement("a");
  a.href = "javascript:void(0)";
  a.className = "list-group-item list-group-item-action";
  a.textContent = ex.title;
  a.addEventListener("click", () => loadExample(ex, a));
  list.appendChild(a);
  if (i === 0) loadExample(ex, a);
});

async function loadExample(ex, anchor) {
  if (activeAnchor) activeAnchor.classList.remove("active");
  anchor.classList.add("active");
  activeAnchor = anchor;
  const host = document.getElementById("exampleHost");
  host.classList.add("example-host");
  try {
    const html = await (await fetch(ex.file)).text();
    host.innerHTML = `
      <header class="frame-bar">
        <span class="dots"><i></i><i></i><i></i></span>
        <span class="frame-title">~/examples/${ex.id}.html</span>
        <span class="caps muted">${String(EXAMPLES.indexOf(ex) + 1).padStart(2, "0")} · ${ex.title}</span>
      </header>
      <div class="frame-body">${html}</div>
    `;
    await ex.setup();
    initCodeTabs(host);
  } catch (err) {
    host.innerHTML = `<div class="frame-body text-danger">Failed to load example: ${err.message}</div>`;
  }
}

// ---------- Documentation tables ----------

const OPTIONS = [
  ["navigation",       "0 | 1 | 2 | 3",        "3",         "Toolbar position bitmask: 1=top, 2=bottom, 3=both."],
  ["padding",          "number",               "2",         "Page numbers shown either side of the current page."],
  ["columnSelection",  "boolean",              "true",      "Show the column visibility dropdown."],
  ["rowCount",         "number | number[]",    "[10,25,50,-1]", "Page sizes; -1 means \"All\"."],
  ["selection",        "boolean",              "false",     "Enable row selection."],
  ["multiSelect",      "boolean",              "false",     "Allow multiple selected rows."],
  ["rowSelect",        "boolean",              "false",     "Click anywhere on a row to (de)select."],
  ["keepSelection",    "boolean",              "false",     "Preserve selection across paging/filter/sort."],
  ["sorting",          "boolean",              "true",      "Enable sortable column headers."],
  ["multiSort",        "boolean",              "false",     "Sort by multiple columns at once."],
  ["caseSensitive",    "boolean",              "false",     "Case-sensitive search."],
  ["searchSettings",   "{delay,characters}",   "{200, 1}",  "Debounce for the search input."],
  ["virtualScroll",    "boolean",              "false",     "Render only visible rows (for very large datasets)."],
  ["ajax",             "boolean",              "false",     "Fetch rows from a remote URL."],
  ["url",              "string | () => string","\"\"",      "Endpoint used when ajax is true."],
  ["icons",            "IconSet",              "bootstrapIcons", "Icon class strings; swap for fontAwesomeIcons for FA."],
  ["footer",           "boolean",              "false",     "Force-enable `<tfoot>` rendering. Implicit when `footerFormatters` or `footerCallback` are set, or when `<tfoot>` markup exists."],
  ["footerFormatters", "Record<string, fn>",   "{}",        "Per-column footer formatters keyed by `data-footer-formatter`. Receive `(column, ctx)` and return HTML."],
  ["footerCallback",   "(tr, ctx) => void",    "null",      "Runs after column footer formatters on every draw. Use it to overwrite cells or correlate values across columns."],
  ["stateSave",        "boolean",              "false",     "Persist sort, page, page-size, search, column visibility (and selection when `keepSelection: true`) to `localStorage`. Restored before first render."],
  ["stateKey",         "string \\| null",       "null",      "localStorage key for state persistence. Defaults to `boostgrid:<table-id>`, or a hash of the column ids when no `id` exists."],
  ["virtualScroll",    "boolean",              "false",     "Render only rows in the viewport. Forces `rowsPerPage = -1` and adds pad rows to keep the scrollbar shape correct."],
  ["rowHeight",        "number",               "38",        "Fixed row height in px used for virtual-scroll math. Must match actual row height (set via CSS or `data-width` on the table)."],
  ["overscan",         "number",               "5",         "Rows rendered above + below the viewport during virtual scroll, smoothing fast scrolls."],
  ["editable",         "boolean",              "false",     "Default value for `column.editable`. Identifier columns are never editable even when this is on."],
  ["onCellEdit",       "(commit) => void \\| Promise", "null", "Fires after a cell edit commits. The commit object exposes `revert()` to roll back if the server rejects."],
  ["groupBy",          "string \\| string[] \\| null", "null", "Group rows by column id, or by an ordered array of ids for multi-level grouping (e.g. `[\"status\",\"region\"]`). Sorting is applied before grouping."],
  ["groupExpanded",    "\"all\" \\| \"none\" \\| Record", "\"all\"", "Initial expand/collapse state for groups. Per-path Record (e.g. `{\"active//us\": false}`) allows mixed defaults."],
  ["groupAggregators", "Record<string, fn>",   "{}",        "Per-column-id aggregator functions, like `footerFormatters` but at group scope. Key syntax: `\"colId\"` to run at every depth, or `\"colId@N\"` to scope to a specific depth."],
  ["treeMode",         "boolean",              "false",     "Render rows as an adjacency-list tree. Each row needs an id (the identifier column) and a `parentId` (or whatever `treeParentField` points at). Mutually exclusive with `groupBy` — treeMode wins."],
  ["treeParentField",  "string",               "\"parentId\"", "Field name on each row that holds the parent's id."],
  ["treeIdField",      "string \\| null",       "null",      "Field name on each row that holds the row's id. `null` falls back to the identifier column."],
  ["treeIndentPx",     "number",               "24",        "Pixels of left-padding indentation per depth level."],
  ["treeColumn",       "string \\| null",       "null",      "Column id that should carry the caret. `null` → the column flagged with `data-tree-column=\"true\"`, then the first visible non-frozen column."],
  ["treeExpanded",     "\"all\" \\| \"none\" \\| Record", "\"all\"", "Initial expand state. Per-id Record (e.g. `{42: false}`) allows mixed defaults."],
  ["groupSubtotalsOnTop", "boolean",           "false",     "Render group footer rows ABOVE their member rows (the subtotal-first layout). Affects every grouping level uniformly."],
  ["columnReorder",    "boolean",              "true",      "Allow drag-rearranging column headers. Persists to v:3 state. Per-column opt-out via `Column.reorderable: false`."],
  ["onColumnReorder",  "(ids: string[]) => void", "null",   "Fires after a successful header reorder with the new id list."],
  ["columnResize",     "boolean",              "true",      "Allow drag-resizing the right edge of header cells. Persists `col.width` to v:3 state. Per-column opt-out via `Column.resizable: false`."],
  ["onColumnResize",   "(id, px) => void",     "null",      "Fires after a resize commits with the new width in pixels."],
  ["treeReparent",     "boolean",              "false",     "Allow drag-and-drop tree rows to a new parent. Opt-in because the move mutates `row[treeParentField]`."],
  ["onReparent",       "(child, newParent, oldParent) => bool \\| Promise", "null", "Fires before a reparent commits. Return `false` (or a Promise resolving to false) to abort the move."],
  ["rowDetail",        "(row) => string \\| HTMLElement \\| null", "null", "Render an expand chevron + detail panel under each row. Return `null` to skip the panel for that row (chevron stays inert)."],
  ["rowDetailExpanded", "\"all\" \\| \"none\" \\| Record",       "\"none\"", "Initial expand state for detail panels. Per-id `Record<id, boolean>` allows mixed defaults."],
  ["bulkActions",      "(selected) => string \\| HTMLElement",   "null",     "Render a sticky toolbar above the table whenever selection is non-empty. Boostgrid prepends an `N selected` counter and a `Clear` button."],
  ["loadingSkeleton",  "boolean \\| number",                     "true",     "Animated placeholder rows during ajax fetches. `true` matches `rowsPerPage` (capped at 10); a number sets the count; `false` disables."],
  ["cellSelection",    "boolean",                                "false",    "Spreadsheet-style range selection in the body. Click anchors, shift-click or drag extends, Ctrl/Cmd+C copies as TSV, Esc clears. Conflicts with `rowSelect`."],
  ["stickyHeader",     "boolean",                                "false",    "Pin the `<thead>` to the viewport top while the body scrolls past. Pure CSS. Override the offset with `--boostgrid-sticky-top: <Npx>` for fixed-nav layouts."],
  ["truncatedTooltips", "boolean",                               "true",     "Lazily set a `title` attribute on body cells whose content is clipped by overflow. Skips cells already carrying a title or `data-bg-no-tooltip`."],
  ["locale",           "string \\| null",                         "null",     "BCP-47 locale tag for the `Intl`-driven number formatting in the pagination summary. `null` lets the runtime decide."],
  ["labels",           "Labels",                                 "(en)",     "All UI strings in one bag — see the i18n example for the full key list. Override any subset; missing keys fall back to English."],
];
const METHODS = [
  ["append(rows)",         "this",          "Append rows; emits appended."],
  ["clear()",              "this",          "Remove all rows."],
  ["remove([ids])",        "this",          "Remove by id, or selected if no ids."],
  ["search([phrase])",     "this",          "Filter; pass nothing to clear."],
  ["sort([dictionary])",   "this",          "Apply { id: \"asc\" } sort descriptor."],
  ["select([ids])",        "this",          "Select by id, or all visible if omitted."],
  ["deselect([ids])",      "this",          "Inverse of select()."],
  ["scrollToRow(index)",   "this",          "Scroll the virtual viewport so the row at this filtered-data index is in view. Clamped to `[0, total - 1]`. No-op when `virtualScroll` is off."],
  ["reload()",             "this",          "Reset state and re-render."],
  ["destroy()",            "this",          "Tear down chrome and unwrap the table."],
  ["getCurrentPage()",     "number",        ""],
  ["getCurrentRows()",     "Row[]",         ""],
  ["getRowCount()",        "number",        "Rows per page."],
  ["getSearchPhrase()",    "string",        ""],
  ["getSelectedRows()",    "unknown[]",     ""],
  ["getSortDictionary()",  "Object",        ""],
  ["getTotalPageCount()",  "number",        ""],
  ["getTotalRowCount()",   "number",        ""],
  ["getFilteredRows()",    "Row[]",         "All rows after search/filter (across pages)."],
  ["getAllRows()",         "Row[]",         "Unfiltered dataset."],
  ["getFooterCell(id)",    "HTMLTableCellElement \\| null", "Footer cell for a column id; analog of DataTables `column().footer()`."],
  ["clearSavedState()",    "this",          "Wipe persisted state (no-op unless `stateSave` is on). Doesn't reset the live grid; chain `.reload()` for that."],
  ["toggleGroup(pathOrKey)",   "void",      "Flip expand/collapse for a group. Pass a single key for one-level groupBy, or a `//`-joined path string (e.g. `\"active//us\"`) for multi-level."],
  ["isGroupExpanded(pathOrKey)", "boolean", "True if the given group is currently expanded."],
  ["toggleTreeNode(id)",       "void",      "Flip expand/collapse for a tree node by id (only meaningful when `treeMode: true`)."],
  ["isTreeExpanded(id)",       "boolean",   "True if the given tree node is currently expanded."],
  ["expandAllTree()",          "void",      "Expand every tree node."],
  ["collapseAllTree()",        "void",      "Collapse every tree node."],
  ["reorderColumn(dragId, targetId, side)", "boolean", "Splice a column to a new position relative to `targetId`. `side: \"before\" \\| \"after\"`. Frozen-group constrained."],
  ["resetColumnState()",       "void",      "Restore column order, visibility, and widths to their authored baseline (captured at attach time)."],
  ["reparentTreeNode(childId, newParentId)", "boolean", "Move a tree row under a new parent (or `null` to make it a root). Returns `false` on cycle / unknown id / no-op."],
  ["getTreeDepth(id)",         "number \\| null", "Depth (0 for roots) of a tree row by id."],
  ["getTreeAncestors(id)",     "Row[] \\| null",  "Ancestor chain of a tree row in root-first order, excluding the row itself."],
  ["getTreeColumnId()",        "string \\| null", "Id of the caret-bearing column when in tree mode."],
  ["toggleRowDetail(id)",      "void",            "Flip a row's detail-panel state and re-render."],
  ["isRowDetailExpanded(id)",  "boolean",         "True if the given row's detail panel is rendered."],
  ["expandAllRowDetails()",    "void",            "Open every row's detail panel."],
  ["collapseAllRowDetails()",  "void",            "Close every row's detail panel."],
];
const EVENTS = [
  ["initialized", "—",            "Fired once after first load."],
  ["load",        "—",            "Just before data fetch / render begins."],
  ["loaded",      "—",            "After data is loaded and rendered."],
  ["appended",    "Row[]",        "Rows that were appended."],
  ["removed",     "Row[]",        "Rows that were removed."],
  ["cleared",     "Row[]",        "Snapshot of cleared rows."],
  ["selected",    "Row[]",        "Newly selected rows."],
  ["deselected",  "Row[]",        "Newly deselected rows."],
  ["sorted",      "SortDictionary","Active sort dictionary."],
  ["searched",    "string",       "Current search phrase."],
];

fillTable("optionsTable", OPTIONS);
fillTable("methodsTable", METHODS);
fillTable("eventsTable", EVENTS);

// ───── TOC rail with scroll-spy (generalized) ─────
function initTocRail(railId) {
  const links = Array.from(
    document.querySelectorAll(`#${railId} a[data-doc-target]`)
  );
  if (!links.length) return;
  const sections = links
    .map((a) => document.getElementById(a.dataset.docTarget))
    .filter(Boolean);

  const setActive = (id) => {
    links.forEach((a) =>
      a.classList.toggle("active", a.dataset.docTarget === id)
    );
  };
  setActive(links[0].dataset.docTarget);

  links.forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const tgt = document.getElementById(a.dataset.docTarget);
      if (!tgt) return;
      const top = tgt.getBoundingClientRect().top + window.scrollY - 140;
      window.scrollTo({ top, behavior: "smooth" });
      setActive(a.dataset.docTarget);
    });
  });

  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    },
    { rootMargin: "-150px 0px -55% 0px", threshold: 0 }
  );
  sections.forEach((s) => io.observe(s));
}

initTocRail("docsList");
initTocRail("changelogList");

function fillTable(id, rows) {
  const tbody = document.getElementById(id);
  if (!tbody) return;
  // Column class map: 4 columns (options) vs 3 columns (methods/events)
  const wide = rows[0]?.length === 4;
  const klasses = wide
    ? ["cell-key", "cell-type", "cell-def", "cell-desc"]
    : ["cell-key", "cell-type", "cell-desc"];
  const labels = wide
    ? ["Option", "Type", "Default", "Description"]
    : ["Name", "Type/Returns", "Description"];
  for (const cells of rows) {
    const tr = document.createElement("tr");
    cells.forEach((c, i) => {
      const td = document.createElement("td");
      td.className = klasses[i] ?? "";
      td.setAttribute("data-label", labels[i] ?? "");
      if (i < klasses.length - 1) {
        td.innerHTML = `<code>${escapeHtml(c)}</code>`;
      } else {
        // description: allow inline <code> markup but escape everything else
        td.innerHTML = renderDesc(c);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDesc(s) {
  // wrap things that look like code-tokens in <code>: backticks remain literal,
  // but tokens like fontAwesomeIcons or virtualScroll: true within the source
  // strings stay plain text.
  return escapeHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>');
}

// ───── Copy buttons (terminals) ─────
document.addEventListener("click", (e) => {
  const btn = e.target.closest?.("[data-copy]");
  if (!btn) return;
  const term = btn.closest(".terminal");
  const code = term?.querySelector("pre")?.innerText ?? "";
  navigator.clipboard?.writeText(code).then(() => {
    const original = btn.textContent;
    btn.classList.add("copied");
    btn.textContent = "copied";
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.textContent = original;
    }, 1400);
  }).catch(() => {
    btn.textContent = "—";
  });
});

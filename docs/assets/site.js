// Docs-site bootstrap: loads boostgrid (built ESM bundle) and wires up
// the Examples / Documentation tabs.
import { Boostgrid, attach as _attach } from "../../dist/boostgrid.js";

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
];
const METHODS = [
  ["append(rows)",         "this",          "Append rows; emits appended."],
  ["clear()",              "this",          "Remove all rows."],
  ["remove([ids])",        "this",          "Remove by id, or selected if no ids."],
  ["search([phrase])",     "this",          "Filter; pass nothing to clear."],
  ["sort([dictionary])",   "this",          "Apply { id: \"asc\" } sort descriptor."],
  ["select([ids])",        "this",          "Select by id, or all visible if omitted."],
  ["deselect([ids])",      "this",          "Inverse of select()."],
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

// ───── Documentation rail (TOC + scroll-spy) ─────
(function initDocsRail() {
  const links = Array.from(document.querySelectorAll("#docsList a[data-doc-target]"));
  if (!links.length) return;
  const sections = links
    .map((a) => document.getElementById(a.dataset.docTarget))
    .filter(Boolean);

  const setActive = (id) => {
    links.forEach((a) => a.classList.toggle("active", a.dataset.docTarget === id));
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
      // pick the entry closest to the top that is intersecting
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    },
    { rootMargin: "-150px 0px -55% 0px", threshold: 0 }
  );
  sections.forEach((s) => io.observe(s));
})();

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

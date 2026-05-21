import { Boostgrid } from "./core.js";
import type { BoostgridOptions, Row } from "./types.js";
import "./styles/boostgrid.scss";

export { Boostgrid };
export * from "./types.js";
export { bootstrapIcons, fontAwesomeIcons } from "./icons.js";

const REGISTRY = new WeakMap<HTMLTableElement, Boostgrid<Row>>();

export function attach<TRow extends Row = Row>(
  target: string | HTMLTableElement | NodeListOf<HTMLTableElement> | HTMLTableElement[],
  options?: Partial<BoostgridOptions<TRow>>,
): Boostgrid<TRow>[] {
  const tables = resolve(target);
  return tables.map((t) => {
    const existing = REGISTRY.get(t);
    // A destroyed instance still sits in the WeakMap until its element is
    // garbage-collected. Treat it as absent so re-attaching the same table
    // (e.g. example demos that swap options at runtime) creates a fresh grid.
    if (existing && !existing.destroyed) {
      // Warn when a caller passes options against a table that's already
      // attached (most commonly: `data-toggle="boostgrid"` auto-init ran at
      // DOMContentLoaded with defaults, and a later script calls `attach()`
      // expecting its options to apply). The returned instance is the
      // pre-existing one — caller's options are silently dropped without
      // this warning. Set in dev console:
      //   grid.options.someOpt = ... ; grid.reload();
      // ...or remove the auto-init attribute.
      if (options && Object.keys(options).length > 0) {
        const id = (t as HTMLTableElement).id || "(no id)";
        // eslint-disable-next-line no-console
        console.warn(
          `[boostgrid] attach() was called with options against an already-attached table (#${id}). ` +
          `The pre-existing instance is being returned and your options were not applied. ` +
          `If the table has data-toggle="boostgrid", auto-init ran first with defaults — ` +
          `remove the attribute and call attach(target, options) explicitly to configure it.`,
        );
      }
      return existing as unknown as Boostgrid<TRow>;
    }
    const g = new Boostgrid<TRow>(t, options);
    REGISTRY.set(t, g as unknown as Boostgrid<Row>);
    // Convenience handle for inline scripts / framework wrappers.
    (t as HTMLTableElement & { boostgridInstance?: Boostgrid<Row> }).boostgridInstance = g as unknown as Boostgrid<Row>;
    return g;
  });
}

export function instance<TRow extends Row = Row>(table: HTMLTableElement): Boostgrid<TRow> | undefined {
  return REGISTRY.get(table) as unknown as Boostgrid<TRow> | undefined;
}

function resolve(t: string | HTMLTableElement | NodeListOf<HTMLTableElement> | HTMLTableElement[]): HTMLTableElement[] {
  if (typeof t === "string") return Array.from(document.querySelectorAll<HTMLTableElement>(t));
  if (t instanceof HTMLTableElement) return [t];
  return Array.from(t);
}

// Auto-init: any <table data-toggle="boostgrid"> on DOMContentLoaded.
if (typeof document !== "undefined") {
  const init = () => attach('table[data-toggle="boostgrid"]');
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}

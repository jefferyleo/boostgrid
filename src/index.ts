import { Boostgrid } from "./core.js";
import type { BoostgridOptions } from "./types.js";
import "./styles/boostgrid.scss";

export { Boostgrid };
export * from "./types.js";
export { bootstrapIcons, fontAwesomeIcons } from "./icons.js";

const REGISTRY = new WeakMap<HTMLTableElement, Boostgrid>();

export function attach(
  target: string | HTMLTableElement | NodeListOf<HTMLTableElement> | HTMLTableElement[],
  options?: Partial<BoostgridOptions>,
): Boostgrid[] {
  const tables = resolve(target);
  return tables.map((t) => {
    const existing = REGISTRY.get(t);
    if (existing) return existing;
    const g = new Boostgrid(t, options);
    REGISTRY.set(t, g);
    // Convenience handle for inline scripts / framework wrappers.
    (t as HTMLTableElement & { boostgridInstance?: Boostgrid }).boostgridInstance = g;
    return g;
  });
}

export function instance(table: HTMLTableElement): Boostgrid | undefined {
  return REGISTRY.get(table);
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

// Tiny DOM helpers — replace jQuery usage in the core. No external deps.

export function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel);
}

export function $$<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | null | undefined> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = String(v);
    else if (k === "html") node.innerHTML = String(v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

/**
 * Delegated event listener. Returns an unsubscribe function.
 * One listener per grid root replaces v1's per-row bindings.
 */
export function delegate(
  root: Element,
  type: string,
  selector: string,
  handler: (e: Event, target: HTMLElement) => void,
): () => void {
  const listener = (e: Event) => {
    const target = e.target as Element | null;
    if (!target) return;
    const match = target.closest(selector) as HTMLElement | null;
    if (match && root.contains(match)) handler(e, match);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

export function debounce<T extends (...a: never[]) => void>(fn: T, ms: number): (...a: Parameters<T>) => void {
  let h: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (h) clearTimeout(h);
    h = setTimeout(() => fn(...args), ms);
  };
}

/** Read all data-* attributes on an element, kebab → camelCase, with primitive coercion. */
export function readData(elm: Element): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const attr of Array.from(elm.attributes)) {
    if (!attr.name.startsWith("data-")) continue;
    const key = attr.name
      .slice(5)
      .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[key] = coerce(attr.value);
  }
  return out;
}

function coerce(v: string): unknown {
  if (v === "" || v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("[") || v.startsWith("{")) {
    try { return JSON.parse(v); } catch { /* fall through */ }
  }
  return v;
}

export function clearChildren(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

import { evaluate, NormalizedPath } from '@swaggerexpert/jsonpath';
import { mergician } from 'mergician';

/** A JSON-like value handled by the overlay engine. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A JSON object (the shape of an OpenAPI document or an overlay node). */
export type JsonObject = { [key: string]: JsonValue };

/** A single OpenAPI Overlay 1.0.0 action. */
export interface OverlayAction {
  /** An RFC 9535 JSONPath selecting the target node(s). */
  target: string;
  /** When `true`, delete the matched node(s). */
  remove?: boolean;
  /** When present, deep-merge this value into the matched node(s). */
  update?: JsonValue;
}

/** An OpenAPI Overlay 1.0.0 document. */
export interface OverlayDocument {
  overlay?: string;
  info?: JsonObject;
  actions?: OverlayAction[];
}

/** A resolved selector path: an array of object keys / array indices. */
export type SelectorPath = (string | number)[];

/**
 * Deep-merge used by `update` actions. `appendArrays` matches the OpenAPI
 * Overlay convention of extending arrays rather than replacing them.
 */
const mergeUpdate = mergician({ appendArrays: true });

/**
 * Collect the normalized paths of every node matching a JSONPath target.
 * Returns an array of selector arrays, e.g. `[["paths", "/a", "get"], ...]`.
 *
 * The engine (`@swaggerexpert/jsonpath`, RFC 9535) is parser-based and does NOT
 * evaluate predicates as JavaScript, so there is no eval surface and strict
 * standard syntax is required (e.g. `@['$ref']`, `match()`, nested filters).
 */
export function matchPaths(doc: unknown, target: string): SelectorPath[] {
  const selectorPaths: SelectorPath[] = [];
  evaluate(doc, target, {
    callback: (_value: unknown, normalizedPath: string) => {
      selectorPaths.push(NormalizedPath.to(normalizedPath));
    },
  });
  return selectorPaths;
}

interface ParentRef {
  parent: Record<string, unknown> | unknown[];
  key: string | number;
}

/**
 * Walk a selector array to the PARENT container of the final key.
 * Returns `{ parent, key }` or `null` if the path cannot be resolved.
 */
function resolveParent(doc: unknown, selectors: SelectorPath): ParentRef | null {
  if (selectors.length === 0) return null; // cannot operate on the root itself
  let node: unknown = doc;
  for (let i = 0; i < selectors.length - 1; i += 1) {
    if (node == null || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[selectors[i] as string | number];
  }
  if (node == null || typeof node !== 'object') return null;
  return { parent: node as Record<string, unknown> | unknown[], key: selectors[selectors.length - 1]! };
}

/**
 * Apply a single `remove` action: delete every node matching the target.
 *
 * Array elements are removed by descending index within each parent array so an
 * earlier splice never shifts the index of a still-pending removal. Object
 * properties are deleted by key.
 */
function applyRemove(doc: unknown, target: string): void {
  const resolved = matchPaths(doc, target)
    .map((selectors) => resolveParent(doc, selectors))
    .filter((r): r is ParentRef => r !== null);

  const arrayRemovals = new Map<unknown[], Set<number>>();
  const objectRemovals: { parent: Record<string, unknown>; key: string }[] = [];

  for (const { parent, key } of resolved) {
    if (Array.isArray(parent) && typeof key === 'number') {
      let indices = arrayRemovals.get(parent);
      if (!indices) {
        indices = new Set<number>();
        arrayRemovals.set(parent, indices);
      }
      indices.add(key);
    } else {
      objectRemovals.push({ parent: parent as Record<string, unknown>, key: String(key) });
    }
  }

  for (const { parent, key } of objectRemovals) {
    if (Object.prototype.hasOwnProperty.call(parent, key)) {
      delete parent[key];
    }
  }

  for (const [arr, indices] of arrayRemovals) {
    const descending = [...indices].sort((a, b) => b - a);
    for (const idx of descending) arr.splice(idx, 1);
  }
}

/**
 * Apply a single `update` action: deep-merge the update value into every node
 * matching the target. Each target receives an independent clone of the value.
 */
function applyUpdate(doc: unknown, target: string, update: JsonValue): void {
  for (const selectors of matchPaths(doc, target)) {
    const resolved = resolveParent(doc, selectors);
    if (!resolved) continue;
    const { parent, key } = resolved;
    const container = parent as Record<string | number, unknown>;
    const current = container[key];
    if (current && typeof current === 'object') {
      container[key] = mergeUpdate(current as object, structuredClone(update) as object);
    } else {
      // Target resolved to a primitive (or missing): overwrite with a clone.
      container[key] = structuredClone(update);
    }
  }
}

/**
 * Apply an OpenAPI Overlay 1.0.0 document to a target document.
 *
 * Returns a deep clone of `doc` with the overlay applied; the input is never
 * modified. Supports `update` and `remove` actions per the Overlay 1.0.0 spec.
 */
export function applyOverlay<T = JsonObject>(doc: T, overlay: OverlayDocument): T {
  if (!overlay || typeof overlay !== 'object') {
    throw new TypeError('overlay must be an object');
  }
  const actions = Array.isArray(overlay.actions) ? overlay.actions : [];
  const result = structuredClone(doc);

  for (const action of actions) {
    if (!action || typeof action.target !== 'string') {
      throw new TypeError('each overlay action requires a string "target"');
    }
    if (action.remove === true) {
      applyRemove(result, action.target);
    } else if ('update' in action && action.update !== undefined) {
      applyUpdate(result, action.target, action.update);
    } else {
      throw new TypeError(
        `overlay action for target "${action.target}" has neither "update" nor "remove: true"`,
      );
    }
  }

  return result;
}

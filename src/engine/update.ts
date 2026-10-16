import { mergician } from 'mergician';
import { matchPaths } from './jsonpath.js';
import { resolveParent } from './resolve.js';
import type { JsonValue } from './types.js';

/**
 * Deep-merge used by `update` actions. `appendArrays` matches the OpenAPI
 * Overlay convention of extending arrays rather than replacing them.
 */
const mergeUpdate = mergician({ appendArrays: true });

/**
 * Apply a single `update` action: deep-merge the update value into every node
 * matching the target. Each target receives an independent clone of the value
 * (no shared references, so no YAML anchor/alias artifacts).
 */
export function applyUpdate(doc: unknown, target: string, update: JsonValue): void {
  for (const selectors of matchPaths(doc, target)) {
    const resolved = resolveParent(doc, selectors);
    if (!resolved) continue;
    const { parent, key } = resolved;
    const container = parent as Record<string | number, unknown>;
    const current = container[key];
    if (Array.isArray(current)) {
      // Overlay 1.0.0: updating an array target APPENDS to the array; it never
      // index-merges (mergician treats arrays as index-keyed objects, which
      // corrupts `[a, b]` + `[c]` into `{0: c, 1: b}`). An array update value
      // is concatenated (its elements appended); any other value is appended as
      // a single new element.
      const clone = structuredClone(update);
      if (Array.isArray(clone)) {
        current.push(...clone);
      } else {
        current.push(clone);
      }
    } else if (current && typeof current === 'object') {
      container[key] = mergeUpdate(current as object, structuredClone(update) as object);
    } else {
      // Target resolved to a primitive (or missing): overwrite with a clone.
      container[key] = structuredClone(update);
    }
  }
}

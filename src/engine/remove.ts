import { matchPaths } from './jsonpath.js';
import { resolveParent, type ParentRef } from './resolve.js';

/**
 * Apply a single `remove` action: delete every node matching the target.
 *
 * Array elements are removed by descending index within each parent array so an
 * earlier splice never shifts the index of a still-pending removal. Object
 * properties are deleted by key.
 */
export function applyRemove(doc: unknown, target: string): void {
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

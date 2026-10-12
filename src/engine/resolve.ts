import type { SelectorPath } from './types.js';

/** A matched node addressed as its parent container plus the final key. */
export interface ParentRef {
  parent: Record<string, unknown> | unknown[];
  key: string | number;
}

/**
 * Walk a selector array to the PARENT container of the final key.
 * Returns `{ parent, key }` or `null` if the path cannot be resolved
 * (e.g. the root itself, or a broken path).
 */
export function resolveParent(doc: unknown, selectors: SelectorPath): ParentRef | null {
  if (selectors.length === 0) return null; // cannot operate on the root itself
  let node: unknown = doc;
  for (let i = 0; i < selectors.length - 1; i += 1) {
    if (node == null || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[selectors[i] as string | number];
  }
  if (node == null || typeof node !== 'object') return null;
  return {
    parent: node as Record<string, unknown> | unknown[],
    key: selectors[selectors.length - 1]!,
  };
}

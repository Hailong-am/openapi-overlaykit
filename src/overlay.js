import { evaluate, NormalizedPath } from '@swaggerexpert/jsonpath';
import { mergician } from 'mergician';

/**
 * Deep-merge used by `update` actions. appendArrays matches the OpenAPI Overlay
 * convention of extending arrays rather than replacing them. Each target gets an
 * independent clone of the update value so no two targets share a reference
 * (prevents YAML anchor/alias artifacts and in-memory aliasing).
 */
const mergeUpdate = mergician({ appendArrays: true });

/**
 * Collect the normalized paths of every node matching a JSONPath target.
 * Returns an array of selector arrays, e.g. [["paths","/a","get"], ...].
 *
 * The engine (@swaggerexpert/jsonpath, RFC 9535) is parser-based and does NOT
 * evaluate predicates as JavaScript, so there is no eval surface and strict
 * standard syntax is required (e.g. @['$ref'], match(), nested filters).
 *
 * @param {object} doc  the document to query
 * @param {string} target  an RFC 9535 JSONPath query
 * @returns {Array<Array<string|number>>}
 */
export function matchPaths(doc, target) {
  const selectorPaths = [];
  evaluate(doc, target, {
    callback: (_value, normalizedPath) => {
      selectorPaths.push(NormalizedPath.to(normalizedPath));
    },
  });
  return selectorPaths;
}

/**
 * Walk a selector array to the PARENT container of the final key.
 * Returns { parent, key } or null if the path cannot be resolved.
 */
function resolveParent(doc, selectors) {
  if (selectors.length === 0) return null; // cannot operate on the root itself
  let node = doc;
  for (let i = 0; i < selectors.length - 1; i += 1) {
    if (node == null || typeof node !== 'object') return null;
    node = node[selectors[i]];
  }
  if (node == null || typeof node !== 'object') return null;
  return { parent: node, key: selectors[selectors.length - 1] };
}

/**
 * Apply a single `remove` action: delete every node matching the target.
 *
 * Array elements are removed by descending index within each parent array so an
 * earlier splice never shifts the index of a still-pending removal. Object
 * properties are deleted by key.
 */
function applyRemove(doc, target) {
  const paths = matchPaths(doc, target);
  // Group array-index removals by their parent array so we can splice safely.
  const resolved = paths
    .map((selectors) => resolveParent(doc, selectors))
    .filter(Boolean);

  // Partition into array-index removals and object-key removals.
  const arrayRemovals = new Map(); // parentArray -> Set<number>
  const objectRemovals = []; // { parent, key }

  for (const { parent, key } of resolved) {
    if (Array.isArray(parent) && typeof key === 'number') {
      if (!arrayRemovals.has(parent)) arrayRemovals.set(parent, new Set());
      arrayRemovals.get(parent).add(key);
    } else {
      objectRemovals.push({ parent, key });
    }
  }

  for (const { parent, key } of objectRemovals) {
    if (parent && Object.prototype.hasOwnProperty.call(parent, key)) {
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
function applyUpdate(doc, target, update) {
  const paths = matchPaths(doc, target);
  for (const selectors of paths) {
    const resolved = resolveParent(doc, selectors);
    if (!resolved) continue;
    const { parent, key } = resolved;
    const current = parent[key];
    if (current && typeof current === 'object') {
      parent[key] = mergeUpdate(current, structuredClone(update));
    } else {
      // Target resolved to a primitive (or missing): overwrite with a clone.
      parent[key] = structuredClone(update);
    }
  }
}

/**
 * Apply an OpenAPI Overlay 1.0.0 document to a target document.
 *
 * Mutates and returns a deep clone of `doc` (the input is never modified).
 * Supports `update` and `remove` actions per the Overlay 1.0.0 spec.
 *
 * @param {object} doc  the target OpenAPI document
 * @param {object} overlay  an Overlay 1.0.0 document ({ overlay, info, actions })
 * @returns {object} the overlaid document
 */
export function applyOverlay(doc, overlay) {
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
    } else if ('update' in action) {
      applyUpdate(result, action.target, action.update);
    } else {
      throw new TypeError(
        `overlay action for target "${action.target}" has neither "update" nor "remove: true"`,
      );
    }
  }

  return result;
}

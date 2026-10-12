import { evaluate, NormalizedPath } from '@swaggerexpert/jsonpath';
import type { SelectorPath } from './types.js';

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

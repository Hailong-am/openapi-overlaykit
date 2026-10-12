import { applyRemove } from './remove.js';
import { applyUpdate } from './update.js';
import type { JsonObject, OverlayDocument } from './types.js';

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

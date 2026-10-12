export { applyOverlay, matchPaths } from './engine/index.js';
export type {
  JsonValue,
  JsonObject,
  OverlayAction,
  OverlayDocument,
  SelectorPath,
} from './engine/index.js';

export {
  parseDocument,
  stringifyDocument,
  applyOverlayFiles,
  applyOverlayToFile,
} from './io.js';
export type { OutputFormat } from './io.js';

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
  DEFAULT_YAML_OPTIONS,
} from './io.js';
export type { OutputFormat, YamlOptions } from './io.js';

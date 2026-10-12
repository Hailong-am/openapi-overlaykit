import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import { applyOverlay, matchPaths } from './overlay.js';
import type { JsonObject, OverlayDocument } from './overlay.js';

export { applyOverlay, matchPaths };
export type {
  JsonValue,
  JsonObject,
  OverlayAction,
  OverlayDocument,
  SelectorPath,
} from './overlay.js';

/** Output serialization format. */
export type OutputFormat = 'yaml' | 'json';

/**
 * Parse a document string as YAML (a superset of JSON), so both `.yaml` and
 * `.json` inputs are accepted transparently.
 */
export function parseDocument(text: string): JsonObject {
  return YAML.parse(text) as JsonObject;
}

/** Serialize a document. `format` defaults to `'yaml'`. */
export function stringifyDocument(doc: unknown, format: OutputFormat = 'yaml'): string {
  if (format === 'json') return `${JSON.stringify(doc, null, 2)}\n`;
  return YAML.stringify(doc);
}

/**
 * Read an OpenAPI document and an overlay from files, apply the overlay, and
 * return the overlaid document object.
 */
export async function applyOverlayFiles(
  docPath: string,
  overlayPath: string,
): Promise<JsonObject> {
  const [docText, overlayText] = await Promise.all([
    readFile(docPath, 'utf8'),
    readFile(overlayPath, 'utf8'),
  ]);
  const doc = parseDocument(docText);
  const overlay = parseDocument(overlayText) as OverlayDocument;
  return applyOverlay(doc, overlay);
}

/**
 * Convenience: apply an overlay from files and write the result to `outPath`.
 * Output format is inferred from the output extension (`.json` -> JSON, else
 * YAML).
 */
export async function applyOverlayToFile(
  docPath: string,
  overlayPath: string,
  outPath: string,
): Promise<JsonObject> {
  const result = await applyOverlayFiles(docPath, overlayPath);
  const format: OutputFormat = outPath.endsWith('.json') ? 'json' : 'yaml';
  await writeFile(outPath, stringifyDocument(result, format), 'utf8');
  return result;
}

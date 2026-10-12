import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import { applyOverlay, matchPaths } from './overlay.js';

export { applyOverlay, matchPaths };

/**
 * Parse a document string as YAML (a superset of JSON), so both .yaml and .json
 * inputs are accepted transparently.
 */
export function parseDocument(text) {
  return YAML.parse(text);
}

/**
 * Serialize a document. format: 'yaml' (default) or 'json'.
 */
export function stringifyDocument(doc, format = 'yaml') {
  if (format === 'json') return `${JSON.stringify(doc, null, 2)}\n`;
  return YAML.stringify(doc);
}

/**
 * Read an OpenAPI document and an overlay from files, apply the overlay, and
 * return the overlaid document object.
 */
export async function applyOverlayFiles(docPath, overlayPath) {
  const [docText, overlayText] = await Promise.all([
    readFile(docPath, 'utf8'),
    readFile(overlayPath, 'utf8'),
  ]);
  const doc = parseDocument(docText);
  const overlay = parseDocument(overlayText);
  return applyOverlay(doc, overlay);
}

/**
 * Convenience: apply an overlay from files and write the result to outPath.
 * Output format is inferred from the output extension (.json -> JSON, else YAML).
 */
export async function applyOverlayToFile(docPath, overlayPath, outPath) {
  const result = await applyOverlayFiles(docPath, overlayPath);
  const format = outPath.endsWith('.json') ? 'json' : 'yaml';
  await writeFile(outPath, stringifyDocument(result, format), 'utf8');
  return result;
}

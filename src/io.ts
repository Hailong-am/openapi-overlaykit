import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import type { ToStringOptions } from 'yaml';
import { applyOverlay } from './engine/index.js';
import type { JsonObject, OverlayDocument } from './engine/index.js';

/** Output serialization format. */
export type OutputFormat = 'yaml' | 'json';

/**
 * YAML serialization options, passed straight through to the `yaml` library's
 * `stringify`. Omitted keys fall back to the faithful defaults below.
 */
export type YamlOptions = ToStringOptions;

/**
 * Faithful defaults for emitting a spec: do not reflow long lines, and keep
 * multi-line strings as literal (|-) blocks rather than folded (>-), so the
 * output round-trips Markdown-bearing fields (like `description`) unchanged.
 * A caller that wants a different house style (quote style, wrapping) overrides
 * these per call -- they are defaults, not policy.
 */
export const DEFAULT_YAML_OPTIONS: YamlOptions = { lineWidth: 0, blockQuote: 'literal' };

/**
 * Parse a document string as YAML (a superset of JSON), so both `.yaml` and
 * `.json` inputs are accepted transparently.
 */
export function parseDocument(text: string): JsonObject {
  return YAML.parse(text) as JsonObject;
}

/**
 * Serialize a document. `format` defaults to `'yaml'`. For YAML, `yamlOptions`
 * is merged over DEFAULT_YAML_OPTIONS and handed to the `yaml` library, so the
 * caller controls wrapping, quote style, and block style.
 */
export function stringifyDocument(
  doc: unknown,
  format: OutputFormat = 'yaml',
  yamlOptions: YamlOptions = {},
): string {
  if (format === 'json') return `${JSON.stringify(doc, null, 2)}\n`;
  return YAML.stringify(doc, { ...DEFAULT_YAML_OPTIONS, ...yamlOptions });
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
  yamlOptions: YamlOptions = {},
): Promise<JsonObject> {
  const result = await applyOverlayFiles(docPath, overlayPath);
  const format: OutputFormat = outPath.endsWith('.json') ? 'json' : 'yaml';
  await writeFile(outPath, stringifyDocument(result, format, yamlOptions), 'utf8');
  return result;
}

import { readFile, writeFile } from 'node:fs/promises';
import { applyOverlay } from '../engine/index.js';
import type { OverlayDocument } from '../engine/index.js';
import { parseDocument, stringifyDocument, type OutputFormat } from '../io.js';
import { parseArgs, USAGE, type CliArgs } from './args.js';

/**
 * Execute the CLI with the given argv (process.argv.slice(2)).
 * Resolves normally on success; calls process.exit on usage/arg errors.
 */
export async function run(argv: string[]): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }

  if (args.help || (!args.openapi && !args.overlay)) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 2);
  }
  if (!args.openapi || !args.overlay) {
    process.stderr.write(`both --openapi and --overlay are required\n\n${USAGE}`);
    process.exit(2);
  }

  const [docText, overlayText] = await Promise.all([
    readFile(args.openapi, 'utf8'),
    readFile(args.overlay, 'utf8'),
  ]);
  const result = applyOverlay(parseDocument(docText), parseDocument(overlayText) as OverlayDocument);

  const format: OutputFormat =
    args.format ?? (args.output?.endsWith('.json') ? 'json' : 'yaml');
  const out = stringifyDocument(result, format, args.yaml);

  if (args.output) {
    await writeFile(args.output, out, 'utf8');
  } else {
    process.stdout.write(out);
  }
}

#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseDocument, stringifyDocument, applyOverlay } from './index.js';
import type { OutputFormat, OverlayDocument } from './index.js';

const USAGE = `openapi-overlaykit - apply an OpenAPI Overlay 1.0.0 document

Usage:
  openapi-overlaykit --openapi <doc> --overlay <overlay> [--output <file>] [--format yaml|json]

Options:
  --openapi, -i   path to the target OpenAPI document (YAML or JSON)   [required]
  --overlay, -o   path to the Overlay 1.0.0 document (YAML or JSON)    [required]
  --output, -f    write result to a file (default: stdout)
  --format        output format: yaml (default) or json
  --help, -h      show this help
`;

interface CliArgs {
  openapi?: string;
  overlay?: string;
  output?: string;
  format?: OutputFormat;
  help?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = (): string | undefined => argv[(i += 1)];
    switch (a) {
      case '--openapi':
      case '-i':
        args.openapi = next();
        break;
      case '--overlay':
      case '-o':
        args.overlay = next();
        break;
      case '--output':
      case '-f':
        args.output = next();
        break;
      case '--format': {
        const f = next();
        if (f !== 'yaml' && f !== 'json') throw new Error(`--format must be yaml or json`);
        args.format = f;
        break;
      }
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
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
  const out = stringifyDocument(result, format);

  if (args.output) {
    await writeFile(args.output, out, 'utf8');
  } else {
    process.stdout.write(out);
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`error: ${(e as Error).message}\n`);
  process.exit(1);
});

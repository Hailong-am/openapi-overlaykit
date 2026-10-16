import type { OutputFormat, YamlOptions } from '../io.js';

export const USAGE = `openapi-overlaykit - apply an OpenAPI Overlay 1.0.0 document

Usage:
  openapi-overlaykit --openapi <doc> --overlay <overlay> [--output <file>] [--format yaml|json]

Options:
  --openapi, -i       path to the target OpenAPI document (YAML or JSON)   [required]
  --overlay, -o       path to the Overlay 1.0.0 document (YAML or JSON)    [required]
  --output, -f        write result to a file (default: stdout)
  --format            output format: yaml (default) or json
  --yaml-line-width   wrap column for YAML output; 0 disables wrapping (default: 0)
  --yaml-quote        scalar quote style for YAML output: single or double (default: single)
  --help, -h          show this help
`;

export interface CliArgs {
  openapi?: string;
  overlay?: string;
  output?: string;
  format?: OutputFormat;
  yaml?: YamlOptions;
  help?: boolean;
}

/** Parse CLI argv into structured arguments. Throws on unknown/invalid flags. */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  const yaml: YamlOptions = {};
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
        if (f !== 'yaml' && f !== 'json') throw new Error('--format must be yaml or json');
        args.format = f;
        break;
      }
      case '--yaml-line-width': {
        const n = Number(next());
        if (!Number.isInteger(n) || n < 0) throw new Error('--yaml-line-width must be a non-negative integer');
        yaml.lineWidth = n;
        break;
      }
      case '--yaml-quote': {
        const q = next();
        if (q !== 'single' && q !== 'double') throw new Error('--yaml-quote must be single or double');
        yaml.singleQuote = q === 'single';
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
  if (Object.keys(yaml).length > 0) args.yaml = yaml;
  return args;
}

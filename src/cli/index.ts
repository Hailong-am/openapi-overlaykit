#!/usr/bin/env node
import { run } from './run.js';

run(process.argv.slice(2)).catch((e: unknown) => {
  process.stderr.write(`error: ${(e as Error).message}\n`);
  process.exit(1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/cli/args.js';

test('parseArgs: core flags', () => {
  const a = parseArgs(['--openapi', 'd.yaml', '--overlay', 'o.yaml', '--output', 'out.yaml']);
  assert.equal(a.openapi, 'd.yaml');
  assert.equal(a.overlay, 'o.yaml');
  assert.equal(a.output, 'out.yaml');
  assert.equal(a.yaml, undefined, 'no yaml options unless a style flag is passed');
});

test('parseArgs: --yaml-line-width sets lineWidth', () => {
  const a = parseArgs(['-i', 'd.yaml', '-o', 'o.yaml', '--yaml-line-width', '80']);
  assert.deepEqual(a.yaml, { lineWidth: 80 });
});

test('parseArgs: --yaml-quote double sets singleQuote false', () => {
  const a = parseArgs(['-i', 'd.yaml', '-o', 'o.yaml', '--yaml-quote', 'double']);
  assert.deepEqual(a.yaml, { singleQuote: false });
});

test('parseArgs: --yaml-quote single sets singleQuote true', () => {
  const a = parseArgs(['-i', 'd.yaml', '-o', 'o.yaml', '--yaml-quote', 'single']);
  assert.deepEqual(a.yaml, { singleQuote: true });
});

test('parseArgs: both style flags combine', () => {
  const a = parseArgs(['-i', 'd.yaml', '-o', 'o.yaml', '--yaml-line-width', '0', '--yaml-quote', 'double']);
  assert.deepEqual(a.yaml, { lineWidth: 0, singleQuote: false });
});

test('parseArgs: rejects a negative line width', () => {
  assert.throws(() => parseArgs(['-i', 'd', '-o', 'o', '--yaml-line-width', '-5']), /non-negative integer/);
});

test('parseArgs: rejects a bad quote style', () => {
  assert.throws(() => parseArgs(['-i', 'd', '-o', 'o', '--yaml-quote', 'curly']), /single or double/);
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import {
  parseDocument,
  stringifyDocument,
  applyOverlayFiles,
  applyOverlayToFile,
} from '../src/index.js';

let dir: string;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'overlaykit-io-'));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('parseDocument: parses YAML', () => {
  const doc = parseDocument('openapi: 3.1.0\npaths: {}\n');
  assert.deepEqual(doc, { openapi: '3.1.0', paths: {} });
});

test('parseDocument: parses JSON (YAML is a JSON superset)', () => {
  const doc = parseDocument('{"openapi":"3.1.0","paths":{}}');
  assert.deepEqual(doc, { openapi: '3.1.0', paths: {} });
});

test('stringifyDocument: defaults to YAML', () => {
  const out = stringifyDocument({ a: 1, b: ['x'] });
  assert.equal(out, YAML.stringify({ a: 1, b: ['x'] }));
  assert.deepEqual(parseDocument(out), { a: 1, b: ['x'] });
});

test('stringifyDocument: json format emits pretty JSON with a trailing newline', () => {
  const out = stringifyDocument({ a: 1 }, 'json');
  assert.equal(out, '{\n  "a": 1\n}\n');
});

test('stringifyDocument: yaml and json round-trip to the same object', () => {
  const value = { openapi: '3.1.0', paths: { '/a': { get: { tags: ['t'] } } } };
  assert.deepEqual(parseDocument(stringifyDocument(value, 'yaml')), value);
  assert.deepEqual(parseDocument(stringifyDocument(value, 'json')), value);
});

test('applyOverlayFiles: reads doc + overlay from disk and applies', async () => {
  const docPath = join(dir, 'doc.yaml');
  const overlayPath = join(dir, 'overlay.yaml');
  await writeFile(docPath, 'openapi: 3.1.0\npaths:\n  /a:\n    get: {}\n');
  await writeFile(
    overlayPath,
    "overlay: 1.0.0\ninfo:\n  title: o\n  version: 1.0.0\nactions:\n  - target: $.paths['/a'].get\n    update:\n      x-added: true\n",
  );
  const result = (await applyOverlayFiles(docPath, overlayPath)) as {
    paths: { '/a': { get: { 'x-added': boolean } } };
  };
  assert.equal(result.paths['/a'].get['x-added'], true);
});

test('applyOverlayFiles: accepts a JSON doc and a YAML overlay transparently', async () => {
  const docPath = join(dir, 'doc.json');
  const overlayPath = join(dir, 'overlay2.yaml');
  await writeFile(docPath, JSON.stringify({ openapi: '3.1.0', paths: { '/a': { get: {} } } }));
  await writeFile(
    overlayPath,
    "overlay: 1.0.0\ninfo:\n  title: o\n  version: 1.0.0\nactions:\n  - target: $.paths['/a'].get\n    remove: true\n",
  );
  const result = (await applyOverlayFiles(docPath, overlayPath)) as {
    paths: { '/a': Record<string, unknown> };
  };
  assert.equal(result.paths['/a'].get, undefined);
});

test('applyOverlayToFile: infers YAML output from a .yaml extension', async () => {
  const docPath = join(dir, 'd1.yaml');
  const overlayPath = join(dir, 'o1.yaml');
  const outPath = join(dir, 'out.yaml');
  await writeFile(docPath, 'openapi: 3.1.0\ninfo:\n  title: d\n  version: 1.0.0\npaths: {}\n');
  await writeFile(
    overlayPath,
    'overlay: 1.0.0\ninfo:\n  title: o\n  version: 1.0.0\nactions:\n  - target: $.info\n    update:\n      x-ok: true\n',
  );
  await applyOverlayToFile(docPath, overlayPath, outPath);
  const written = await readFile(outPath, 'utf8');
  // YAML output is not JSON-braced and round-trips.
  assert.ok(!written.trimStart().startsWith('{'), 'output is YAML, not JSON');
  assert.deepEqual((parseDocument(written) as { info: { 'x-ok': boolean } }).info['x-ok'], true);
});

test('applyOverlayToFile: infers JSON output from a .json extension', async () => {
  const docPath = join(dir, 'd2.yaml');
  const overlayPath = join(dir, 'o2.yaml');
  const outPath = join(dir, 'out.json');
  await writeFile(docPath, 'openapi: 3.1.0\ninfo:\n  title: d\n  version: 1.0.0\npaths: {}\n');
  await writeFile(
    overlayPath,
    'overlay: 1.0.0\ninfo:\n  title: o\n  version: 1.0.0\nactions:\n  - target: $.info\n    update:\n      x-ok: true\n',
  );
  await applyOverlayToFile(docPath, overlayPath, outPath);
  const written = await readFile(outPath, 'utf8');
  assert.ok(written.startsWith('{'), 'output is JSON');
  assert.equal(written.endsWith('}\n'), true, 'JSON ends with a trailing newline');
  assert.deepEqual(JSON.parse(written).info['x-ok'], true);
});

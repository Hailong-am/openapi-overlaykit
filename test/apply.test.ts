import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOverlay } from '../src/index.js';

/** Loosely-typed view for ergonomic deep property access in assertions. */
interface Rec {
  [key: string]: Rec;
}

/** Build a minimal valid overlay around a list of actions. */
const overlay = (actions: unknown[]) => ({
  overlay: '1.0.0',
  info: { title: 'u', version: '1.0.0' },
  actions: actions as { target: string }[],
});

test('apply: a single overlay mixes update and remove actions', () => {
  const doc = { paths: { '/a': { get: {}, post: {} }, '/b': { get: {} } } };
  const result = applyOverlay(
    doc,
    overlay([
      { target: "$.paths['/a'].get", update: { 'x-u': true } },
      { target: "$.paths['/b']", remove: true },
    ]),
  ) as Rec;

  assert.equal(result.paths['/a'].get['x-u'] as unknown as boolean, true);
  assert.ok(result.paths['/a'].post, 'untargeted sibling operation is untouched');
  assert.equal(result.paths['/b'], undefined, 'removed path is gone');
});

test('apply: update deep-merges nested objects, preserving existing siblings', () => {
  const doc = { comp: { schemas: { A: { type: 'object' }, B: { type: 'string' } } } };
  const result = applyOverlay(
    doc,
    overlay([{ target: '$.comp.schemas', update: { A: { description: 'the A schema' } } }]),
  ) as Rec;

  // A gains description but keeps its original type; B is untouched.
  assert.equal(result.comp.schemas.A.type as unknown as string, 'object');
  assert.equal(result.comp.schemas.A.description as unknown as string, 'the A schema');
  assert.equal(result.comp.schemas.B.type as unknown as string, 'string');
});

test('apply: update creates a key that did not exist on the target', () => {
  const doc = { info: { title: 't', version: '1.0.0' } };
  const result = applyOverlay(
    doc,
    overlay([{ target: '$.info', update: { description: 'added', contact: { name: 'n' } } }]),
  ) as Rec;

  assert.equal(result.info.description as unknown as string, 'added');
  assert.equal(result.info.contact.name as unknown as string, 'n');
  assert.equal(result.info.title as unknown as string, 't', 'existing keys survive');
});

test('apply: a null update value overwrites the key to null', () => {
  const doc = { a: { keep: 1, drop: 2 } };
  const result = applyOverlay(doc, overlay([{ target: '$.a', update: { drop: null } }])) as Rec;

  assert.equal(result.a.keep as unknown as number, 1);
  assert.equal(result.a.drop as unknown as null, null);
});

test('apply: appendArrays creates the array when the key is missing', () => {
  const doc = { op: {} };
  const result = applyOverlay(doc, overlay([{ target: '$.op', update: { tags: ['added'] } }])) as Rec;

  assert.deepEqual(result.op.tags, ['added'] as unknown as Rec);
});

test('apply: appendArrays extends rather than replaces an existing array', () => {
  const doc = { op: { tags: ['a', 'b'] } };
  const result = applyOverlay(doc, overlay([{ target: '$.op', update: { tags: ['c'] } }])) as Rec;

  assert.deepEqual(result.op.tags, ['a', 'b', 'c'] as unknown as Rec);
});

test('apply: recursive descent updates matching nodes at every depth', () => {
  const doc = { a: { v: 1, b: { v: 1 }, c: { v: 2 } } };
  const result = applyOverlay(
    doc,
    overlay([{ target: '$..[?@.v == 1]', update: { seen: true } }]),
  ) as Rec;

  assert.equal(result.a.seen as unknown as boolean, true, 'outer node (v==1) matched');
  assert.equal(result.a.b.seen as unknown as boolean, true, 'nested node (v==1) matched');
  assert.equal(result.a.c.seen, undefined, 'non-matching node (v==2) untouched');
});

test('apply: a wildcard update fans out to every match in one action', () => {
  const doc = { paths: { '/a': { get: {} }, '/b': { get: {} }, '/c': { get: {} } } };
  const result = applyOverlay(
    doc,
    overlay([{ target: '$.paths.*.get', update: { 'x-all': true } }]),
  ) as Rec;

  for (const p of ['/a', '/b', '/c']) {
    assert.equal(result.paths[p].get['x-all'] as unknown as boolean, true, `${p} updated`);
  }
});

test('apply: a remove earlier in the overlay invalidates a later update target', () => {
  const doc = { paths: { '/a': { get: {} } } };
  const result = applyOverlay(
    doc,
    overlay([
      { target: "$.paths['/a']", remove: true },
      // target no longer exists after the remove -> silently matches nothing
      { target: "$.paths['/a'].get", update: { x: 1 } },
    ]),
  ) as Rec;

  assert.deepEqual(result.paths, {} as unknown as Rec, 'path removed, later update is a no-op');
});

test('apply: multiple update actions accumulate onto the same node', () => {
  const doc = { info: {} };
  const result = applyOverlay(
    doc,
    overlay([
      { target: '$.info', update: { title: 't' } },
      { target: '$.info', update: { version: '1.0.0' } },
      { target: '$.info', update: { 'x-flag': true } },
    ]),
  ) as Rec;

  assert.deepEqual(result.info, {
    title: 't',
    version: '1.0.0',
    'x-flag': true,
  } as unknown as Rec);
});

test('apply: realistic overlay — tag, annotate, and prune in one pass', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 'API', version: '1.0.0' },
    paths: {
      '/public': { get: { summary: 'public' } },
      '/internal': { get: { summary: 'internal', tags: ['Internal'] } },
      '/debug': { get: { summary: 'debug', tags: ['Internal'] } },
    },
  };
  const result = applyOverlay(
    doc,
    overlay([
      // annotate the whole document
      { target: '$.info', update: { 'x-overlaid': true } },
      // mark every Internal-tagged operation as internal
      { target: "$.paths.*[?@.tags[?@ == 'Internal']]", update: { 'x-internal': true } },
      // drop the debug path entirely
      { target: "$.paths['/debug']", remove: true },
    ]),
  ) as Rec;

  assert.equal(result.info['x-overlaid'] as unknown as boolean, true);
  assert.equal(result.paths['/internal'].get['x-internal'] as unknown as boolean, true);
  assert.equal(result.paths['/public'].get['x-internal'], undefined, 'public not marked');
  assert.equal(result.paths['/debug'], undefined, 'debug path pruned');
});

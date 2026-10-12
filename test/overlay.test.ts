import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import YAML from 'yaml';
import { applyOverlay, matchPaths } from '../src/index.js';
import type { JsonObject } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const townDoc = (): JsonObject =>
  YAML.parse(readFileSync(join(here, 'fixtures/town.yaml'), 'utf8')) as JsonObject;

/** Loosely-typed view for ergonomic deep property access in assertions. */
interface Rec {
  [key: string]: Rec;
}

test('update: deep-merges into every matched node (nested filter + &&, #42 example 1)', () => {
  const doc = townDoc();
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [
      {
        // #42 example 1, verbatim RFC 9535 syntax (nested filter combined with &&)
        target: "$.paths..[?@.tags && @.tags[?@ == 'Enterprise-Only']]",
        update: { 'x-internal': true },
      },
    ],
  }) as Rec;

  // Only the Enterprise-Only operation gets x-internal.
  assert.equal(result.paths['/buildings'].get['x-internal'], true);
  assert.equal(result.paths['/buildings/{buildingId}'].get['x-internal'], undefined);
  assert.equal(result.paths['/ping'].post['x-internal'], undefined);
});

test('remove: deletes the $ref node directly (object + array parents, descending splice)', () => {
  const doc = townDoc();
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [
      // Standard RFC 9535: bracket member access selects the $ref node itself.
      { target: "$..['$ref']", remove: true },
    ],
  }) as Rec;

  // Both $ref nodes are gone; the Building schema DEFINITION remains (not a $ref).
  const asText = JSON.stringify(result);
  assert.ok(!asText.includes('#/components/schemas/Building'), 'all $ref occurrences removed');
  assert.ok(result.components.schemas.Building, 'schema definition is untouched');

  // The array `items` that held a $ref is now an empty object (its only key removed).
  const arrSchema =
    result.paths['/buildings'].get.responses['200'].content['application/json'].schema.items;
  assert.deepEqual(arrSchema, {});
});

test('remove: match() selects the CONTAINER of a matching $ref (RFC 9535 node semantics)', () => {
  const doc = townDoc();
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [
      // The predicate is tested against each node; a node "having" a matching
      // $ref is the containing object, so removing it deletes the whole wrapper.
      { target: "$..[?match(@['$ref'], '.*Building')]", remove: true },
    ],
  }) as Rec;

  // The object schema wrapper (which held the $ref) is gone entirely.
  const objContent =
    result.paths['/buildings/{buildingId}'].get.responses['200'].content['application/json'];
  assert.equal(objContent.schema, undefined, 'the $ref-containing schema object is removed');
});

test('remove: negation selects the path item lacking get (#42 example 2)', () => {
  const doc = townDoc();
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [
      // #42 example 2, verbatim RFC 9535 negation syntax.
      { target: '$.paths[?!@.get]', remove: true },
    ],
  }) as Rec;

  // /ping (post only, no get) is removed; the two get-bearing paths remain.
  assert.equal(result.paths['/ping'], undefined);
  assert.ok(result.paths['/buildings']);
  assert.ok(result.paths['/buildings/{buildingId}']);
});

test('matchPaths: RFC 9535 bracket selector returns normalized selector arrays', () => {
  const doc = townDoc();
  const paths = matchPaths(doc, "$..['$ref']");
  assert.equal(paths.length, 2);
  for (const p of paths) {
    assert.ok(Array.isArray(p));
    assert.equal(p[p.length - 1], '$ref');
  }
});

test('update: each target receives an independent clone (no shared reference)', () => {
  const doc = {
    paths: { '/a': { get: {} }, '/b': { get: {} } },
  };
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [{ target: '$.paths.*.get', update: { 'x-added': { nested: true } } }],
  }) as Rec;

  const a = result.paths['/a'].get['x-added'];
  const b = result.paths['/b'].get['x-added'];
  assert.deepEqual(a, { nested: true });
  assert.deepEqual(b, { nested: true });
  // Mutating one target's injected value must not affect the other.
  a.nested = 'changed';
  assert.equal(b.nested, true, 'targets must not share the same object reference');
});

test('applyOverlay does not mutate the input document', () => {
  const doc = townDoc();
  const snapshot = JSON.stringify(doc);
  applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [{ target: '$.paths.*.get', update: { 'x-added': true } }],
  });
  assert.equal(JSON.stringify(doc), snapshot, 'input doc is unchanged (operates on a clone)');
});

test('throws on an action with neither update nor remove', () => {
  assert.throws(
    () =>
      applyOverlay(
        { paths: {} },
        { overlay: '1.0.0', info: { title: 'u', version: '1.0.0' }, actions: [{ target: '$' }] },
      ),
    /neither "update" nor "remove: true"/,
  );
});

test('remove: multiple elements in the same array splice descending (no index shift)', () => {
  const doc = {
    list: ['keep0', 'drop1', 'keep2', 'drop3', 'drop4', 'keep5'],
  };
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    // match every element whose value starts with "drop"
    actions: [{ target: "$.list[?match(@, 'drop.*')]", remove: true }],
  }) as unknown as { list: string[] };

  assert.deepEqual(result.list, ['keep0', 'keep2', 'keep5']);
});

test('remove: deletes an entire path item (object property by key)', () => {
  const doc = townDoc();
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [{ target: "$.paths['/ping']", remove: true }],
  }) as Rec;

  assert.equal(result.paths['/ping'], undefined);
  assert.ok(result.paths['/buildings'], 'sibling paths are untouched');
});

test('remove: a target matching the document root is a no-op (cannot delete root)', () => {
  const doc = townDoc();
  const before = JSON.stringify(doc);
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [{ target: '$', remove: true }],
  });
  assert.equal(JSON.stringify(result), before, 'root removal does nothing');
});

test('remove: a target that matches nothing is a silent no-op', () => {
  const doc = townDoc();
  const before = JSON.stringify(doc);
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [{ target: "$.paths['/does-not-exist']", remove: true }],
  });
  assert.equal(JSON.stringify(result), before, 'no match leaves the doc unchanged');
});

test('update: appendArrays extends an existing array (Overlay convention)', () => {
  const doc = { paths: { '/a': { get: { tags: ['x'] } } } };
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [{ target: "$.paths['/a'].get", update: { tags: ['y'] } }],
  }) as Rec;

  assert.deepEqual(result.paths['/a'].get.tags, ['x', 'y'] as unknown as Rec);
});

test('update: overwrites when the target resolves to a primitive', () => {
  const doc = { info: { version: '1.0.0' } };
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [{ target: '$.info.version', update: '2.0.0' as unknown as never }],
  }) as Rec;

  assert.equal(result.info.version as unknown as string, '2.0.0');
});

test('apply: actions run in order, later actions see earlier results', () => {
  const doc = { paths: { '/a': { get: {} }, '/b': { get: { tags: ['pre'] } } } };
  const result = applyOverlay(doc, {
    overlay: '1.0.0',
    info: { title: 'u', version: '1.0.0' },
    actions: [
      // 1) tag /a.get — before this runs, no operation has the 'added' tag
      { target: "$.paths['/a'].get", update: { tags: ['added'] } },
      // 2) select operations whose tags include 'added'; only matches because (1) ran first
      {
        target: "$.paths.*[?@.tags[?@ == 'added']]",
        update: { 'x-seen': true },
      },
    ],
  }) as Rec;

  // /a.get was tagged then marked; /b.get (tag 'pre') is never marked.
  assert.deepEqual(result.paths['/a'].get.tags, ['added'] as unknown as Rec);
  assert.equal(result.paths['/a'].get['x-seen'] as unknown as boolean, true);
  assert.equal(result.paths['/b'].get['x-seen'], undefined);
});

test('apply: an overlay with no actions returns an unchanged clone', () => {
  const doc = townDoc();
  const before = JSON.stringify(doc);
  const result = applyOverlay(doc, { overlay: '1.0.0', info: { title: 'u', version: '1.0.0' } });
  assert.equal(JSON.stringify(result), before);
  assert.notEqual(result, doc, 'result is a distinct clone, not the same reference');
});

test('apply: throws on a non-object overlay', () => {
  assert.throws(
    () => applyOverlay({ paths: {} }, null as unknown as never),
    /overlay must be an object/,
  );
});

test('apply: throws when an action is missing a string target', () => {
  assert.throws(
    () =>
      applyOverlay(
        { paths: {} },
        {
          overlay: '1.0.0',
          info: { title: 'u', version: '1.0.0' },
          actions: [{ update: { x: 1 } } as unknown as { target: string }],
        },
      ),
    /requires a string "target"/,
  );
});

test('matchPaths: a non-matching target returns an empty array', () => {
  const doc = townDoc();
  assert.deepEqual(matchPaths(doc, "$.paths['/nope']"), []);
});

test('matchPaths: wildcard over paths returns one selector per path item', () => {
  const doc = townDoc();
  const paths = matchPaths(doc, '$.paths.*');
  assert.equal(paths.length, 3);
  for (const p of paths) assert.equal(p[0], 'paths');
});

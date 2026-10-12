import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import YAML from 'yaml';
import { applyOverlay, matchPaths } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const townDoc = () => YAML.parse(readFileSync(join(here, 'fixtures/town.yaml'), 'utf8'));

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
  });

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
  });

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
  });

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
  });

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
  });

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

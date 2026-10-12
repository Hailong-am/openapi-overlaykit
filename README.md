# openapi-overlaykit

Apply [OpenAPI Overlay 1.0.0](https://spec.openapis.org/overlay/v1.0.0.html)
documents to an OpenAPI (or any JSON/YAML) document, using a strict,
**RFC 9535-compliant** JSONPath engine with **no `eval`**.

## Why another overlay tool

Existing overlay tools build on JSONPath engines that either reject or silently
mishandle common targeting needs:

- predicates on `$`-prefixed keys (`$ref`, `$id`),
- regex matching,
- nested filters combined with `&&`,
- negation.

openapi-overlaykit uses [`@swaggerexpert/jsonpath`](https://github.com/swagger-api/swaggerexpert-jsonpath),
a parser-based **RFC 9535** implementation that does **not** turn query text into
JavaScript. Targets are evaluated against the standard grammar, so there is no
`eval`/`static-eval` surface, and standard filter features work as specified.

## Install

```sh
npm install openapi-overlaykit
```

Requires Node.js 18+.

## CLI

```sh
openapi-overlaykit --openapi api.yaml --overlay overlay.yaml --output out.yaml
```

| Option | Description |
|---|---|
| `--openapi`, `-i` | target OpenAPI document (YAML or JSON) — **required** |
| `--overlay`, `-o` | Overlay 1.0.0 document (YAML or JSON) — **required** |
| `--output`, `-f` | write result to a file (default: stdout) |
| `--format` | output format: `yaml` (default) or `json` |

Output format is inferred from the output file extension when `--format` is omitted.

## Library

```js
import { applyOverlay, applyOverlayFiles, matchPaths } from 'openapi-overlaykit';

// From objects (input is never mutated; a clone is returned):
const result = applyOverlay(doc, overlay);

// From files:
const result = await applyOverlayFiles('api.yaml', 'overlay.yaml');

// Just query normalized paths:
const paths = matchPaths(doc, "$.paths..[?@.tags && @.tags[?@ == 'public']]");
```

## Supported actions

Per Overlay 1.0.0, each action has a `target` (a JSONPath) and either:

- **`update`** — deep-merges the given value into every matched node. Arrays are
  appended. Each matched node receives an independent clone (no shared
  references, so no YAML anchor/alias artifacts).
- **`remove: true`** — deletes every matched node. Array elements are spliced in
  descending index order so removals never shift pending indices.

```yaml
overlay: 1.0.0
info:
  title: Example
  version: 1.0.0
actions:
  - target: "$.paths..[?@.tags && @.tags[?@ == 'Enterprise-Only']]"
    update:
      x-internal: true
  - target: "$.paths[?!@.get]"
    remove: true
```

## JSONPath syntax (RFC 9535)

Targets are **strict RFC 9535**. A few consequences worth knowing:

- Access a `$`-prefixed member with bracket notation: `@['$ref']`, not `@.$ref`.
- Regex uses the standard functions `match(node, "regex")` (full match) and
  `search(node, "regex")` (substring), not Perl-style `=~` or JS `.match()`.
- A filter `[?...]` selects the node the predicate is tested against. A predicate
  like `[?match(@['$ref'], '.*Building')]` selects the object that *has* a
  matching `$ref`, not the `$ref` string itself. To target the `$ref` node
  directly, use `$..['$ref']`.

## License

[Apache-2.0](./LICENSE)

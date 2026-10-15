# Ticket 04: Vue source and explicit local assets

Ticket #16 adds Vue single-file components and explicit local assets to the
existing snapshot graph. Each committed snapshot is parsed independently and
all extracted references enter the same dependency graph used by JavaScript
and TypeScript imports.

The analyzer uses tool-owned, pinned `@vue/compiler-sfc` and
`@vue/compiler-dom` parsers. It parses ordinary and setup JS/TS script blocks
with the shipped TypeScript parser, retaining imports, type imports, re-exports,
literal dynamic imports, and literal CommonJS requires. External script,
template, and style `src` references belong to the owning SFC. Valid
scriptless components are accepted; malformed SFCs, templates, and script
blocks produce an analysis gap that identifies the committed file and
revision.

CSS `@import` references and actual `url()` function nodes are read from the
PostCSS value AST; quoted declaration strings that merely contain `url(...)`
do not create edges. Static asset attributes on Vue templates are resolved
relative to the file that contains them. Existing
committed TypeScript path aliases are also honored, with their configuration
files retained as provenance edges. Required local references must resolve to
tracked files or analysis fails. Remote URLs, data URLs, and in-document
fragments produce no repository edge. Non-literal dynamic template asset
bindings fail explicitly. The supported template attributes are `img:src`,
`source:src`, `video:poster`, `audio:src`, `track:src`, and SVG `image:href` /
`image:xlink:href`.

The CLI package declares exact runtime dependencies for compiler-sfc and
TypeScript. The executable leaves compiler-sfc external to avoid embedding its
CommonJS entry point and its optional template-engine lookups; compiler-dom
and PostCSS plus the CSS value parser are bundled. The package test installs conflicting consumer
versions and confirms the packed CLI uses its shipped SFC and TypeScript
parsers, while a real Vue/CSS Git fixture exercises its bundled template and
CSS parsers. The fixture confirms that a changed image reaches the owning Vue
component and that an invalid SFC exits with a diagnostic and no partial file
list.

Automatic component imports and runtime Vue application behavior belong to
later tickets. A component available only through auto-import configuration
does not gain a guessed edge here.

## Verification

`pnpm verify:full` passed:

- Format, ESLint/static metrics, TypeScript typecheck, and unit tests.
- Integration tests against the built CLI.
- Isolated npm and strict pnpm packed consumers, including the Vue asset and
  invalid-SFC Git fixtures and the conflicting-parser-version npm consumer.
- Knip.

Manual QA of the application surface is assigned to the separate QA job.

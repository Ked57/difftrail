# Ticket 05: static auto-import mappings and complete gaps

Ticket #17 connects Vue component and script API usages to static auto-import
identities from each committed endpoint. The analyzer reads configuration and
generated declarations with the shipped TypeScript parser; it never evaluates
project configuration, plugin resolvers, presets, or generators.

The recognized configuration sources are static imports of
`unplugin-vue-components` and `unplugin-auto-import`. Component metadata comes
from the exact configured `dts` string or the plugin's `components.d.ts`
default. API metadata comes from its exact configured `dts` string or
`auto-imports.d.ts`. A declaration contributes a mapping only when a
`GlobalComponents` property or `declare global` variable has one literal
`typeof import()` identity. A static `imports` array of literal module names
and symbol names is also accepted. Dynamic `imports` expressions fail with a
config-file gap; a required configured metadata file missing from the selected
snapshot fails with its exact path.

Vue template component tags resolve by normalized symbol identity. Local SFC
imports take precedence. Script APIs resolve only when TypeScript's checker
identifies a free reference to a generated declaration; parameters and local
bindings are not mistaken for auto-imports. Relative identities must resolve
to exactly one tracked source file in that endpoint. Static TypeScript path
aliases use the importer's effective inherited config and retain every config
file read. Workspace package identities use the import or require export
condition through a static resolver rooted at that endpoint's consumer
directory. `.mjs` and `.mts` select `import`; `.cjs` and `.cts` select `require`;
`.vue`, `.jsx`, and `.tsx` use `import`; `.js` and `.ts` follow the nearest
committed consumer manifest's `type` field. That manifest is retained as a
metadata edge. Tool-install paths do not participate. The graph retains
workspace membership, package, and consuming manifest edges. External package
identities require matching endpoint manifest, lockfile, and installed package
evidence and remain terminal package dependencies. Same-basename files do not
participate in resolution.

Each consumer links to the exact generated metadata and plugin config that
supplied its identity. A changed declaration, config, alias, workspace
manifest, package manifest, or lockfile therefore reaches the actual consumer
through ordinary graph closure. Historical extraction reads only that
endpoint's committed mappings. A missing target, multiple targets, conflicting
identities, unsupported dynamic mapping, or runtime-only component use produces
an actionable analysis gap at the consuming file and revision. A component
plugin with `dts: false` or a runtime resolver is accepted only when the
committed static mapping supplies the used component. Projects without a
recognized auto-import setup remain unaffected. Missing component candidates
follow Vue's native-tag and built-in component semantics; only non-native,
non-built-in tags under an applicable component resolver require a static
mapping.

The parser has four approved seams. The endpoint selector supplies the exact
committed snapshots, but does not test parser behavior or output bytes. The
auto-import extractor tests usage-to-identity resolution, shadowing, ambiguity,
and provenance, but not CLI atomicity. The Git history fixtures prove
mapping-only changes use endpoint-owned metadata and exclude unrelated files,
but do not test package installation. The packed CLI subprocess verifies exit
status and empty stdout for a gap at either endpoint, but does not validate
browser behavior or exercise every application integration.

## Verification

`pnpm verify:full` passed unchanged: formatting, ESLint and complexity audit,
TypeScript, 47 unit tests, 30 CLI integration tests, isolated npm and strict
pnpm packed-package installation and CLI checks, and knip. The focused analyzer
suite also passed 16 tests with global coverage thresholds disabled for
diagnosis; this filtered run is supplementary and does not replace the full
gate.

The focused analyzer suite covers static component and script APIs, external
package evidence, workspace export conditions, inherited aliases, local
shadowing, same-basename exclusion, historical mapping-only changes, exact
configured metadata paths, missing/runtime-only mappings, dynamic config
gaps, Vue native and built-in tags, workspace `.js` conditions from nearest
package manifests, and conflicting mappings. The packed CLI
fixture checks mapping-only consumer selection, snapshot-rooted ESM and
CommonJS workspace export branches selected for `.js` consumers by their
nearest package `type` despite a conflicting package beside the installed CLI,
and no-partial-output kebab-case component failures at base and head. Manual QA
of the CLI remains with the separate QA job.

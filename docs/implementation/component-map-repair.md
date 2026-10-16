# Component-map Vite entrypoint repair

## Cause and behavior

The analyzer recognized only the bare `unplugin-vue-components` and
`unplugin-auto-import` module specifiers. The example app imports each plugin
through its documented `/vite` entrypoint, so the static scanner skipped the
actual Vite configuration. That left the generated `GlobalComponents` map and
its implicit SFC consumer disconnected. A change to only the map and config
therefore returned only those seeds instead of reaching the consumer and its
ordinary source importers.

The scanner now accepts exactly these four known entrypoints: the two bare
module names and their `/vite` entrypoints. It still reads only literal source
and generated metadata from each committed snapshot; it does not load or run a
Vite plugin, config, or generator. Mapping, metadata, and configuration edges
retain the consumer as their importer, so normal reverse traversal propagates
map-only and config-only changes through the real source graph.

Recognizing the real plugin also exposed the Vue `<slot>` outlet in mapped
components. Vue's compiler AST labels it with `ElementTypes.SLOT`; template
component extraction now excludes that node kind while preserving the existing
unknown-component gap behavior.

## Regression seams

- `packages/analyzer/src/auto-imports-history.test.ts` uses committed
  `GlobalComponents` metadata, the `/vite` config import, and a real Vue SFC.
  It checks map-only and config-only changes against literal path sets, along
  with missing metadata at either comparison endpoint and the `/vite`
  auto-import API mapping.
- `tools/test-package.mjs` installs and invokes the packed CLI against an
  isolated Git repository. Its map-only change must reach the SFC, `App.vue`,
  and `main.ts`; its config-only change must reach those consumers and the
  config. Exact lists exclude the unrelated settings page. The mapped Vue
  component contains a `<slot />` outlet.
- The Ticket07 real history was replayed with base
  `55ed0a97079fed278ba60c73f9fb671779ab2a8d` and head
  `f894652cbafa09e5bc1bd02c098708810b7b0651`. The rebuilt CLI returned the
  changed map and config, `ReportsPage.vue`, `App.vue`, and `main.ts`, with
  explanations through the map-to-page-to-app-to-entrypoint chain.

## Checks and limits

The repository full gate is `pnpm verify:full`, covering format, lint,
typecheck, all unit tests, build, integration tests, packed-package scenarios,
and Knip. The fix changes only the static scanner's recognized import
specifiers and the Vue AST handling for slot outlets. Unknown package
subpaths, runtime resolver functions, non-literal plugin options, and missing
snapshot mappings remain analysis gaps. This CLI replay verifies committed
history analysis; browser rendering/manual app QA remains a separate Ticket07
acceptance step.

# Difftrail example app

This three-page Vue application exercises ordinary and setup scripts, local aliases, a shared workspace package, type-only re-exports, a literal dynamic import, CSS and template assets, external SFC blocks, and statically generated component auto-import metadata. File routes come from `unplugin-vue-router`. Icons come from `unplugin-icons` (`@iconify-json/lucide` and a custom SVG collection). Settings uses `vee-validate` through `unplugin-auto-import` and a TanStack Router root route id. Global utilities come from Tailwind.

From the repository root, install the workspace and run the app:

```sh
pnpm install --frozen-lockfile
pnpm --filter @difftrail/test-app dev
```

Open the local Vite URL, then use Dashboard, Reports, and Settings in the top navigation. Build the production assets with `pnpm --filter @difftrail/test-app build`. The Vite plugins write `components.d.ts`, `auto-imports.d.ts`, and `typed-router.d.ts`. Those committed files are the static mappings used by historical analysis. Difftrail resolves `~icons/<collection>/<name>` to a custom collection SVG or the installed `@iconify-json/<collection>` package, `vue-router/auto-routes` to the configured route files, and a bare CSS `@import` such as `tailwindcss` to its installed package.

Run the real-Git CLI acceptance scenarios from the root with `pnpm test:example-history`. This builds the workspace, then creates disposable full-workspace clones and exercises shared utility, page-only, template asset, CSS URL asset, alias, and auto-import mapping commits, plus isolated deletion, rename, and invalid-source histories. The fixture calls the built CLI; it does not run setup commands from inside Difftrail.

The app's own runner is Vitest. `pnpm --filter @difftrail/test-app test` runs the unit, component, and end-to-end style files under `tests/`. `pnpm --filter @difftrail/test-app test:affected` asks the built CLI for impacted `*.test.ts` and `*.e2e.ts` files and passes only those paths to Vitest. An empty selection does not fall back to the full suite. Difftrail itself still only prints impacted paths. `pnpm test:affected` from the repository root commits disposable fixture changes and checks that command. `pnpm test:mutation:app` runs Stryker against the example utilities. Per-test coverage runs only the Vitest files that cover each mutant. `pnpm test:mutation:examples` runs that suite together with the React and Effect example suites.

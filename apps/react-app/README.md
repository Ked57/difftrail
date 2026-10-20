# Difftrail React example

This three-page React application exercises a Vite root, file routes, a shared workspace package, Tailwind, icon collections, and a settings form. File routes come from `@tanstack/router-plugin`, which writes `src/routeTree.gen.ts` with normal relative imports. Icons come from `unplugin-icons` (`@iconify-json/lucide` and a custom SVG collection). Settings uses `react-hook-form` through `unplugin-auto-import`. Global utilities come from Tailwind. `src/styles/tailwind.css` keeps the bare `@import 'tailwindcss'` so Difftrail treats it as package metadata.

From the repository root, install the workspace and run the app:

```sh
pnpm install --frozen-lockfile
pnpm --filter @difftrail/react-app dev
```

Open the local Vite URL, then use Dashboard, Reports, and Settings in the top navigation. Build the production assets with `pnpm --filter @difftrail/react-app build`. The Vite plugins write `auto-imports.d.ts` and `src/routeTree.gen.ts`. Those committed files are the static mappings used by historical analysis. Difftrail resolves `~icons/<collection>/<name>` to a custom collection SVG or the installed `@iconify-json/<collection>` package.

The app's own runner is Vitest. `pnpm --filter @difftrail/react-app test` runs the unit, component, and end-to-end style files under `tests/`. `pnpm --filter @difftrail/react-app test:affected` asks the built CLI for impacted `*.test.ts` and `*.e2e.ts` files and passes only those paths to Vitest. An empty selection does not fall back to the full suite. Difftrail itself still only prints impacted paths. `pnpm test:react-affected` from the repository root commits disposable fixture changes and checks that command. `pnpm test:mutation:react` runs Stryker against the example utilities.

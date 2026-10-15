# Ticket 07: runnable Vue example and Git histories

`apps/test-app` is a Vite/Vue 3 application with Dashboard, Reports, and Settings routes. It imports a shared workspace package, uses local TypeScript aliases, and includes shared and page-specific modules. The source covers ordinary and setup SFC scripts, JavaScript and TypeScript, type-only re-export, literal dynamic import, external script/template/style blocks, CSS imports and URLs, static SVG references, and a Vite-generated `GlobalComponents` declaration for template auto-imports.

The example is intentionally small and direct: its navigation uses ordinary links, and Vite serves each route through its SPA fallback. Run `pnpm install --frozen-lockfile`, `pnpm --filter @difftrail/test-app dev`, and `pnpm --filter @difftrail/test-app build` from the workspace root. `pnpm --filter @difftrail/test-app typecheck` checks the SFC scripts and templates with `vue-tsc`.

`tools/test-example-history.mjs` clones the committed monorepo to temporary repositories, adds real follow-up commits, runs the built CLI, and checks complete literal path arrays. It covers shared utility propagation, a page-only change, a static asset, a type-alias configuration change without page edits, a generated auto-import map change, deletion, rename, and malformed Vue input. The fixture performs a normal Vite build only to regenerate the auto-import declaration before that history is committed; Difftrail itself receives no setup command. The temporary repositories are removed after the run.

The packaged-CLI history seam catches integration among Git snapshots, actual source/configuration evidence, and result paths. It does not replace focused parser/resolver tests or the separate browser manual-QA job. The app build and `vue-tsc` checks verify compilation and typing; actual page navigation and visible interaction remain to be recorded by manual QA.

## Verification

- `pnpm --filter @difftrail/test-app build` passed with 38 modules transformed and generated `components.d.ts` from `unplugin-vue-components`.
- `pnpm --filter @difftrail/test-app typecheck` passed.
- `pnpm build` passed for all workspaces.
- `pnpm verify:fast` passed, including the app typecheck, repository lint/metrics, and 47 unit tests.
- Real Git history results and full verification are pending the history harness run.

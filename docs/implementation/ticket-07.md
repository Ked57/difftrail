# Ticket 07: runnable Vue example and Git histories

`apps/test-app` is a Vite/Vue 3 application with Dashboard, Reports, and Settings routes. It imports a shared workspace package, uses local TypeScript aliases, and includes shared and page-specific modules. The source covers ordinary and setup SFC scripts, JavaScript and TypeScript, type-only re-export, literal dynamic import, external script/template/style blocks, CSS imports and URLs, static SVG references, and a Vite-generated `GlobalComponents` declaration for template auto-imports. The external GreetingCard script uses the shared `useGreeting` composable.

The example is intentionally small and direct: its navigation uses ordinary links, and Vite serves each route through its SPA fallback. Run `pnpm install --frozen-lockfile`, `pnpm --filter @difftrail/test-app dev`, and `pnpm --filter @difftrail/test-app build` from the workspace root. `pnpm --filter @difftrail/test-app typecheck` checks the SFC scripts and templates with `vue-tsc`.

Run `pnpm test:example-history` from the workspace root to build the packages and execute `tools/test-example-history.mjs`. The fixture clones the committed monorepo to temporary repositories, adds real follow-up commits, runs the CLI, and checks complete literal path arrays. It covers shared utility propagation, a page-only change, template and stylesheet assets, a type-alias configuration change without page edits, a generated auto-import map change, deletion, rename, and malformed Vue input. The shared-utility result includes `useGreeting.ts` because it imports the changed `greetingFor` export; the template asset result includes both pages because each references the edited SVG. The CSS asset history follows `card-texture.svg` through `greeting-card.css`, `GreetingCard.vue`, DashboardPage, App, and main. Changing the app `tsconfig.json` includes all 19 files configured by that app, including generated/component sources and the Vite configuration used by the group; the literal assertion still excludes files outside `apps/test-app` and the shared package. The fixture performs a normal Vite build only to regenerate the auto-import declaration before that history is committed; Difftrail itself receives no setup command. The temporary repositories are removed after the run.

The packaged-CLI history seam catches integration among Git snapshots, actual source/configuration evidence, and result paths. It does not replace focused parser/resolver tests or the separate browser manual-QA job. The app build and `vue-tsc` checks verify compilation and typing; actual page navigation and visible interaction remain to be recorded by manual QA.

## Verification

- `pnpm --filter @difftrail/test-app build` passed with 39 modules transformed and generated `components.d.ts` from `unplugin-vue-components`.
- `pnpm --filter @difftrail/test-app typecheck` passed.
- `pnpm build` passed for all workspaces.
- `pnpm verify:full` passed after Ticket 06 integration, including formatting, lint and metrics, typechecks, 60 unit tests, 39 integration tests, all 9 real-Git histories, package tarball tests, and Knip.
- Browser page navigation and interaction remain assigned to the separate manual-QA job.

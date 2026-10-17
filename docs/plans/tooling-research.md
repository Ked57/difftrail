# Difftrail tooling research

Read-only investigation, 2026-10-15. Scope: tooling/distribution/evidence only; authoritative product scope is the separate discovery job's GitHub issue map. Read user routing, RTK, TypeScript policy, research/fullstack-typescript-quality/manual-qa owner instructions. No repository/auth files changed and no tooling installed.

## Environment and remote access

- Installed: Node `22.23.1`, npm `10.9.8`, Git `2.39.5`, gh `2.97.0`. pnpm command is a Corepack shim at `/Users/clementfassot/.nvm/versions/node/v22.21.0/bin/pnpm`; no package manager pin exists yet, so `pnpm --version` attempts registry lookup.
- Plain sandbox network calls fail DNS (`ENOTFOUND registry.npmjs.org`; `gh repo view` reports connection error). This is an environment permission boundary, not demonstrated bad credentials.
- Read-only `gh repo view --json nameWithOwner,url,defaultBranchRef` with `require_escalated` succeeded: `Ked57/difftrail`, https://github.com/Ked57/difftrail, default branch `master`. Discovery agent informed directly. Remote is `git@github.com:Ked57/difftrail.git`.
- Read-only `npm view` with escalation succeeds. `npm view difftrail name version --json` returned E404: name currently absent from public registry; this is neither reservation nor proof the publishing account can claim it.

## Constrained compatible toolchain recommendation

Pin exact versions, commit a lockfile, set root `packageManager`, and avoid `latest`. These exact versions were confirmed by official npm registry metadata using `npm view` today:

| Tool | Recommended pin | Reason |
|---|---|---|
| Node | minimum `>=22.13`, CI Node22/24 | Present Node22.23.1 works; ESLint10 minimum22.13 |
| pnpm | `10.34.7` | Latest patch of mature10 line; engines>=18.12; avoids unrelated12 changes |
| turbo | `2.11.8` | Current published version |
| typescript | `6.0.3` | Latest6 patch; compiler API described by upstream; TS7 uses a different trajectory |
| eslint | `10.12.0` | Current published; Node22.13/24 supported |
| typescript-eslint | `8.71.2` | Peer supports ESLint8.57/9/10 and TypeScript>=4.8.4,<6.1 |
| vitest | `4.1.11` | Latest4 patch; supports Node20/22/24; avoids new5 without need |
| esbuild | `0.28.2` | Current; engines>=18 |
| prettier | `3.9.10` | Current; engines>=14 |

Latest versions exist (`pnpm12.11.2`, TS7.0.2, Vitest5.0.4), but latest TS falls outside current typescript-eslint peer support. Pick versions once in scaffold; do not have agents independently install incompatible latest tools. Registry primary endpoints: https://registry.npmjs.org/typescript/6.0.3 , https://registry.npmjs.org/typescript-eslint/8.71.2 , https://registry.npmjs.org/turbo/2.11.8 , https://registry.npmjs.org/pnpm/10.34.7 , https://registry.npmjs.org/vitest/4.1.11 , https://registry.npmjs.org/esbuild/0.28.2 , https://registry.npmjs.org/eslint/10.12.0 .

## Workspace and distribution

Recommendation (architecture judgment; adapt names to issue-derived scope):

- `packages/core`: pure immutable graph traversal and result model, no Git/process/filesystem.
- `packages/git`: Git comparison/snapshots through constrained child-process boundary.
- `packages/analyzer`: static parsing/module resolution, snapshot virtual filesystem, graph creation.
- `packages/cli`: sole public package named `difftrail`, arguments/format/errors/orchestration.
- `apps/test-app`: private representative repository fixture/consumer exercising supported references and CLI end-to-end.
- Reserve `apps/docs` in workspace pattern/documentation; avoid building a speculative docs site before requested. No UI library needed for a CLI.

Root pnpm workspace patterns `packages/*`, `apps/*`. Root private. Pin turbo as root devDependency; package dependencies define workspace graph; `build` depends on `^build`, with dist outputs declared. Turborepo is task orchestration layered on package-manager workspaces. Sources: [Turbo installation](https://turborepo.dev/docs/getting-started/installation), [tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks).

Publish one npm CLI tarball. Build a Node-targeted ESM executable (`dist/cli.js`, package type=module, explicit shebang) with esbuild, bundling internal workspace code. Internal workspace packages stay private. Keep heavyweight TypeScript compiler and any parser package which reads adjacent assets as explicit external runtime dependencies; never use `packages:'external'` indiscriminately because that would leave unpublished private workspace imports in the CLI. esbuild's Node platform leaves built-ins external and supports explicit external packages. Source: [esbuild platform/packages/external](https://esbuild.github.io/api/).

Use CLI workspace dependencies as `workspace:*` devDependencies when bundled exclusively; any remaining public runtime externals belong in dependencies. Validate packed manifest and inspect build imports. pnpm replaces workspace ranges with versions when packing; it does **not** make those packages exist on npm. This is why private internal runtime dependencies must be bundled. [pnpm workspace publication](https://pnpm.io/workspaces).

Manifest: `bin:{difftrail:'dist/cli.js'}`, `files:['dist','README.md','LICENSE']`, description/license/repository/engines, explicit version. npm creates platform executable shims and requires `#!/usr/bin/env node`. Source: [npm package manifest](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

`prepack` builds release output (do not require consumers to compile); use `pnpm --filter difftrail pack --pack-destination <temp> --json`, inspect actual tarball, then install that tarball in an unrelated temporary directory and invoke its installed bin. `pnpm pack` executes prepack/prepare/postpack; use real pack, not only dry-run. [pack](https://pnpm.io/cli/pack). `pnpm deploy` creates an application directory with isolated node_modules, useful for deployable apps; it is not the npm tarball contract and is unnecessary here. [deploy](https://pnpm.io/cli/deploy).

## Issue-authoritative analyzer recommendation (supersedes preliminary AST-only idea)

Read source pointers `/private/tmp/difftrail-source/issue-5.md`, `issue-6.md`, `issue-9.md`, `issue-10.md`. Canonical graph acquisition is **dependency-cruiser programmatic API**, with Difftrail-owned supplemental Vue/asset/auto-import extraction; TypeScript AST alone does not satisfy the agreed architecture. Independently materialize base/head committed snapshots, cruise each, compute independent reverse closures, then union. No installed target-project parsers/build/config execution and no merged historical edges.

Pin `dependency-cruiser18.6.0` (registry engines `^22||^24||>=26`) and tool-controlled `@vue/compiler-sfc3.5.44`. Dependency-cruiser18.6 has ESM-only public exports, so make CLI ESM, bundle private workspace code, and keep dependency-cruiser, TypeScript6.0.3 and Vue compiler as published runtime dependencies. Its upstream supported-transpilers range is TypeScript>=2,<7 and compiler-sfc>=3,<4, confirming6.0.3/3.5.44 fit. Primary [tagged manifest](https://raw.githubusercontent.com/sverweij/dependency-cruiser/v18.6.0/package.json). Set advertised engine to validated Node22/24 ranges, not untested future majors; CI needs Windows/macOS/Linux × advertised Node22/24. Local host proves only macOS22.

Programmatic `cruise(paths, options)` returns reporter output. Set TS pre-compilation dependency extraction true so type-only/unused imports remain edges; pass appropriate per-package tsconfig and explicit snapshot base context. Do not execute webpack/babel config extraction utilities. Cruise relevant tracked files without inherited source/test/directory exclusions; retain unresolved and parse diagnostics. API may recursively follow installed packages unless controlled. [API](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/doc/api.md), [options](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/doc/options-reference.md), [FAQ](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/doc/faq.md).

Supplement Vue with parser-owned SFC descriptor/AST: preserve both scripts, script setup, type relationships, explicit script/template/style `src`, SFC parse diagnostics and valid scriptless distinction. Normalize all edges onto owning .vue path. Tool-controlled TypeScript AST pass detects variable imports and gaps the extractor omits, and supports static JS/TS/JSX/TSX/CJS/ESM forms. Native TypeScript6 AST APIs remain useful in this **supplemental** role, and guide warns7.1 changes APIs: [Microsoft compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API).

Add explicit local CSS @import/url edges, static Vue template assets and actual AST symbol/component usage resolved through committed source/config/generated metadata mappings. Auto-imports are required when statically resolvable, not a blanket unsupported category. Existing unplugin documentation exposes generated .d.ts/JSON import metadata and directory/config mappings; consume those as evidence without executing resolver functions. Never choose a supplier merely from a matching basename, and never substitute today's generated metadata for a historical snapshot. [unplugin-auto-import configuration](https://github.com/unplugin/unplugin-auto-import#configuration), [unplugin-vue-components](https://github.com/unplugin/unplugin-vue-components#configuration).

Per-package aliases/workspace resolution and config/metadata consumption must establish corresponding edges; unresolved evidence is a fatal analysis gap under issue7 (read it during implementation). CSS, assets, tracked ignored paths and non-source files remain eligible graph nodes. Actual multi-page Vue TypeScript example is required by issue10, so apps/test-app must be a buildable/runnable app and receive browser manual QA; reserve future apps/docs without inventing a docs product. No universal arbitrary-runtime dependency claim is justified.

## Quality and subprocess/manual smoke strategy

Scaffold one shared quality environment first so every implementation agent inherits identical scripts, conventions and module seams. Applicable owner requires fullstack-typescript-static/tests/mutation loaded before installing tooling; parent/scaffold must read these owners for exact thresholds. Root commands: `format:check`, `lint`, `typecheck`, `test:unit`, CLI integration/e2e, `build`, `knip`, `verify:fast`, `verify:full`, selected domain mutation command. `.agents/agent-config.json` routes source, tests, tooling and baseline files to real scripts. Issue10 requires a real multi-page Vue app, so route its build/typecheck/component/e2e requirements and browser manual QA through the applicable owners. Strict tsc covers source **and test/config file kinds**; esbuild alone does not typecheck. CI includes full gate and actual tarball smoke.

Test the pure graph seam for transitivity/cycles/deletes/renames/filter determinism; analyzer seam using in-memory snapshots for syntax/resolution/config edge cases; Git seam with disposable initialized repos and commits; CLI seam by spawning built executable, checking exit code/stdout/stderr (JSON stdout must remain parseable), success/no-changes/failures. These seams catch independent logic errors and integration mismatches; only installed-tarball invocation proves distribution does not accidentally rely on workspace source/dependencies.

Constrain child processes: `execFile`/`spawn` with argument arrays, `shell:false`, explicit cwd, bounded output/timeout; use `git` without executing user-configured hooks/build scripts. Use NUL Git output for paths with whitespace/newline and explicit revision validation/options separation. Never interpolate repository content in shell strings. Source: [Node child process](https://nodejs.org/api/child_process.html).

After implementation, independent manual-QA job must directly invoke installed `difftrail` on disposable fixtures: help/version; a known changed dependency returning direct+transitive consumers; renamed/deleted inputs; empty change; invalid revision/outside-repo; malformed/unsupported analysis input; JSON and filtering. Record exact command, expected, actual, status, evidence and build SHA. Automated test success is not manual QA. Create temporary install/fixtures under approved tmp paths, clean only those fixtures. No source modifications or test runs occurred in this research job.

# Ticket 01 implementation handoff

Approved scope: [spec #12](https://github.com/Ked57/difftrail/issues/12), [ticket #13](https://github.com/Ked57/difftrail/issues/13). Based on plan commit `23da217` on the integration branch. Review and manual QA are separate jobs; this implementer report does not claim either has happened.

## Delivered

Pinned pnpm/Turborepo workspace with private `@difftrail/core`, `@difftrail/git`, `@difftrail/analyzer`, the bundled ESM `difftrail` npm executable, and reserved `apps/test-app` / `apps/docs` workspaces. Existing Apache-2.0 license and ignore protections are preserved. Runtime dependencies are explicit published packages; private workspace imports are bundled out of the tarball.

The initial CLI compares committed HEAD with its first parent, materializes both endpoints in canonical tool-owned temporary directories, extracts real JavaScript dependencies with dependency-cruiser, computes seed-inclusive reverse closure separately at each endpoint, then unions and partitions by head existence. Dirty working files are not analysis input. Snapshot directories are removed on success and failure. A genuine root has an empty base. Full root/merge/range/shallow/history coverage belongs to Ticket 02.

`difftrail` produces exact sorted line output; `--json` returns `{root,base,head,scope:'static',files,removed}` plus LF. `--help` and `--version` are available. The CLI assembles all output before one stdout write; repository/parse/dynamic/unresolved/unsupported required input failures exit 1, argument/output incompatibility exits 2. The initial scope rejects TypeScript/Vue/CSS explicitly until their implementation tickets; it never substitutes a successful seeds-only result.

## Internal interfaces

- Core: `DependencyEdge`, `impactedPaths(seeds, edges)` and `selectImpact(seeds, baseEdges, headEdges, headPaths)`. Pure selection/domain logic; no process/filesystem dependencies.
- Git: `Snapshot {revision,directory,paths}`, `Comparison {root,base,head,seeds,baseSnapshot,headSnapshot}`, and `withComparison(cwd, async callback)`. The callback owns no snapshot cleanup responsibility.
- Analyzer: `extractGraph(snapshot) -> {revision,edges}`; original specifiers and revision identity are retained. Endpoint calls are serial because upstream caches are shared. Tracked recognized source paths are explicit entries with recursive following disabled, so tracked ignored/dependency-directory files participate while no unintended installed tree is traversed.
- CLI is the only supported external interface. Workspace module exports are internal seams, not a promised SDK.

## Verification

`pnpm verify:full` passes: formatting, ESLint and mandatory Difficulty audit, strict typecheck (source, tests, TS config, tooling JS), seven graph/extractor tests, five built-CLI subprocess scenarios, isolated tarball npm install/executable/parser smoke, and Knip. Pure domain/application coverage is 100% on statements/branches/functions/lines; CRAP threshold is explicitly 25. Git/extractor/CLI I/O adapters are covered through actual source/Git/subprocess fixtures, with this coverage scope documented in CODING_STANDARDS.md.

Regression fixtures verify cycles, dedupe, isolated/empty seeds, no cross-snapshot chain stitching, deterministic ordering, real imports, tracked ignored/dependency-directory inputs, temporary cleanup, exact dirty-checkout text/JSON, either-endpoint missing imports/dynamic dependencies/invalid JavaScript, empty commits, and invalid flags. The installed parser fixture uses real TypeScript type-only extraction to prove tool parser delivery; the initial CLI itself still rejects TS pending Ticket 03.

Controlled temporary violations were executed and removed: formatting, strict compiler errors, explicit any, file/function limits, cyclomatic/cognitive complexity, Halstead Volume/Effort and Difficulty >=80, uncovered domain coverage, CRAP, and unused exports. Each corresponding gate rejected its violation. Core Stryker mutation testing is wired to a manual CI job and passes locally at 100% (22 killed, two timeout kills, zero survived). A frozen-lockfile install and git diff whitespace check also pass.

Executed environment: macOS arm64, Node 22.23.1, pnpm 10.34.7. The full advertised Node/OS matrix remains Ticket 08; this local result is not Linux/Windows or Node 24 evidence. No real Vue app/browser behavior exists yet (Ticket 07), and no npm registry publication occurred. Distinct pinned review and direct CLI manual QA remain required before integration.

## Extractor findings for following tickets

Use dependency-cruiser 18.6 programmatic `cruise(relativePaths,{baseDir:canonicalSnapshot,...})` with no outputType for an object result. JSON reporter returns serialized text. Absolute entries are normalized against process cwd before baseDir and are unsuitable here. On macOS canonicalize temporary directories to avoid `/var` versus `/private/var` resolver mismatch.

The real malformed-JS red fixture demonstrated that upstream extraction can succeed while omitting syntax errors. The tool now uses its own TypeScript `Program.getSyntacticDiagnostics(source)` before extraction and scans variable import/require calls; do not use the private `SourceFile.parseDiagnostics` field or trust exitCode 0. `noLib`/`noResolve` apply only to syntax validation and do not typecheck the consumer.

Explicit recognized tracked entries plus `doNotFollow:{path:'.*'}` preserve direct edges for every entry. `maxDepth:1` is unsafe: a module first seen as another module's dependency can lose its outgoing edges even when also an explicit entry. Upstream may emit duplicate empty target stubs; retain real outgoing edges. Type-only relationships are observable in `dependencyTypes` (`type-only`).

Follow-up probe evidence established: default resolver exportsFields disables package exports; inherited TS paths without baseUrl need the effective paths base; per-package context must apply to each importer; config reads and resolver-used manifests need consumer provenance; parser optional lookup needs packed tests with conflicting target TS/Vue versions. No present implementation claim is made for those later-ticket features. Primary source: [dependency-cruiser tagged API/source](https://github.com/sverweij/dependency-cruiser/tree/v18.6.0).

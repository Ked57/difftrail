# Difftrail canonical acceptance audit

Prepared from canonical GitHub issue resolutions #1–#11 linked below and repository `GLOSSARY.md`. Read-only specification review job; this document is an independent reviewer checklist, not an alternate product specification. No product code changed or runtime check executed by this job.

## Canonical source index and precedence

- [#1 map](https://github.com/Ked57/difftrail/issues/1): closed planning map; JS/TS with mandatory Vue; runner-agnostic CLI; GitHub canonical tracker; no unresolved product/architecture decisions remain.
- [#2 comparison](https://github.com/Ked57/difftrail/issues/2#issuecomment-6188002310): committed comparison semantics and seeds.
- [#3 impact](https://github.com/Ked57/difftrail/issues/3#issuecomment-6188224760): universal seed-inclusive reverse reachability, file granularity, eligibility/ignores.
- [#4 research](https://github.com/Ked57/difftrail/issues/4#issuecomment-6187811809): evidence only; never merge research branch.
- [#5 graph](https://github.com/Ked57/difftrail/issues/5#issuecomment-6188560563): final resolution supersedes its earlier checkpoint; dependency-cruiser programmatic API, independent snapshots/closures, mandatory syntax/configuration coverage.
- [#6 non-import relationships](https://github.com/Ked57/difftrail/issues/6#issuecomment-6188733028): explicit assets and established auto-import mappings; no handwritten Difftrail dependency map.
- [#7 gaps](https://github.com/Ked57/difftrail/issues/7#issuecomment-6188857275): failure for detected required gaps at either endpoint, single policy, static scope, recognized terminals.
- [#8 CLI](https://github.com/Ked57/difftrail/issues/8#issuecomment-6189018643): exact flags/output/filter/explanation/status contract.
- [#9 delivery](https://github.com/Ked57/difftrail/issues/9#issuecomment-6189147954): npm Node CLI, tool-owned parsers, project configuration discovery, OS/runtime support, isolated/stateless/no writes.
- [#10 handoff](https://github.com/Ked57/difftrail/issues/10#issuecomment-6189439230): final acceptance index; configuration-consumer provenance; runnable Vue app; seams, timing and completion evidence. Canonical behavior stays with linked resolutions.
- [#11 Vue research](https://github.com/Ked57/difftrail/issues/11#issuecomment-6188459353): source evidence only, known silent extractor omissions; never merge research branch.

Current user additionally requires Turborepo, split module packages, test/example app, future documentation site boundary, one subagent per code/review/manual-QA job, and a PR containing tested working npm-ready CLI. Actual registry publication/PR merge is not required.

## 1. Git comparisons and acquisition

- [ ] **Default** `difftrail`: compare checked-out `HEAD` to its first parent, not main/default branch/remote newest; merge commit uses first parent only. Source #2/#8. Observe real linear and merge histories with fixed seed/result sets.
- [ ] Genuine root: empty base snapshot, all root tracked paths added; JSON `base: null`. Distinguish a real root from a shallow boundary. Source #2/#8. Observe root succeeds; shallow missing parent fails with no stdout; no fetch.
- [ ] `--base A`: compare A directly to HEAD. `--base A --head B`: compare A/B endpoint trees, net changes only. `--merge-base` explicitly substitutes common ancestor for supplied base. `--head` or `--merge-base` without `--base` invalid. Source #8. Observe distinct endpoint and merge-base results and real resolved SHAs; edit+revert range gives empty seeds.
- [ ] Retain additions/modifications, old deleted path, both rename paths; heuristic rename detection not mandated because delete+add is valid. Include arbitrary-extension isolated seeds. Source #2/#3. Observe file sets and removed paths for additions/deletions/renames.
- [ ] Ignore all staged, unstaged, untracked changes when comparing committed snapshots. Source #2/#9. Observe dirty checkout produces same result as clean selected commits; unchanged user data/index/refs/configuration.
- [ ] Invalid refs, missing history/merge-base, unavailable historical inputs produce actionable failure, never baseline substitution, auto-fetch, automatic install/generation. Source #2/#5/#7/#9. Observe exit 1, zero stdout, meaningful revision/snapshot stderr.
- [ ] Discover enclosing Git root from root/subdirectories using Git; handle `.git` file/worktree roots. IDs/output remain repository-root-relative, not invocation-directory-relative. Source #9. Observe root/subdirectory equivalence in installed CLI.
- [ ] Isolate selected source/config snapshots in temporary storage, clean on success and error. No checkout/index/refs/files/config mutation; no hooks/CI setup side effects; no persistent graph cache/watch/daemon. Source #5/#9. Observe status/index/ref/file hashes and temp cleanup before/after both outcomes.

## 2. Impact computation and snapshot provenance

- [ ] Seed-inclusive direct/transitive reverse dependency closure with uniqueness/cycle termination. Changing importer must not select unchanged imports merely as its dependencies. File purpose, extension, tests, pages, workspace boundaries do not control traversal. Comment-only changes have ordinary file granularity. Source #3. Observe independent expected sets and absent unrelated files.
- [ ] Extract base/head independently, using each endpoint's committed source and relevant configuration. Traverse each graph independently, THEN union impacted path sets. Never merge endpoint edges before traversal. Source #5. Observe trap fixture: base A→B, head B→C (dependency arrows into importer as appropriate) must not invent a cross-snapshot A→B→C witness/impact.
- [ ] Retain normalized importer/dependency edges, relationship kinds, original specifiers versus resolved paths, revisions, statuses, tracked bytes/paths, effective config context, detected gaps and snapshot provenance. Source #5/#10. Observe explanation chains and config-dependency provenance remain endpoint-correct.
- [ ] Track config/metadata **actually used** by each consuming file as ordinary dependencies in that endpoint graph, including inherited config and alias/auto-import mappings. Source #10. Observe config-only change reaches unchanged actual consumers and their dependents; unrelated package stays absent. No root-config-only assumption; no filename-based all-files widening.
- [ ] Config/manifest/lockfile/generated/global-setup changes with no established relation remain seeds, not repo-wide magic. Source #6. Recognized non-code terminal files and external resources do not fail merely for lacking outgoing edges (#7); unsupported required analyzable syntax cannot be silently relabeled terminal (#5/#7).
- [ ] Only Gitignore automatic ignore; tracked files remain eligible even matching ignore. No extractor defaults pruning tests, generated files, dependency dirs, arbitrary extensions. No graph-exclusion configuration approved. Source #3/#5. Observe tracked ignored/node_modules/generated/test path participates; untracked working files do not.

## 3. Source extraction, resolution, assets and auto-imports

- [ ] Use dependency-cruiser programmatic extraction interface, supplemented only where required; no alternative-backend/plugin framework/new general-purpose resolver. Source #5. Review shipped extraction implementation and invoke real parsers rather than mocked graphs.
- [ ] JS/TS/JSX/TSX/CommonJS ordinary imports, type-only imports/re-exports, re-exports, literal dynamic imports. Source #3/#5/#10. Observe each through actual fixture extraction and representative CLI integration; avoid emitted JS dropping type edges.
- [ ] Detect variable/expression imports and other supported required constructs that extractor may omit. Custom bundler-only aliases/unsupported syntax requiring unknown resolution are gaps, not guessed matches. Source #5/#7. Observe failure even if output filter excludes originating file.
- [ ] Required Vue graph entry AND target support: ordinary script, script setup, JS/TS, both valid script blocks as applicable, type-only/re-export/literal-dynamic edges; valid scriptless SFC accepted; invalid SFC fails. Source #5/#11/#10. Observe actual tool-owned compatible SFC parser in packed install; no silent empty parse fallback or accidental host optional compiler dependency.
- [ ] External literal `<script src>`, `<template src>`, `<style src>` edges belong to original owning SFC with correct endpoint/package context; preserve every applicable script import and src edge. Referenced outside-analyzable file remains referenced terminal where appropriate, not falsely claimed analyzed. Source #5.
- [ ] Resolve per-package effective project configuration, inherited config, TS aliases, workspace relationships/exports; no duplicate user aliases/custom mandatory Difftrail config/init. Source #5/#9/#10. Observe multiple package tsconfigs and cross-workspace imports with exact expected consumers.
- [ ] Historical resolution environment must be justified from endpoint-consistent evidence; today's node_modules or generated map not automatically historical proof. Missing required historical packages/generated/config inputs are gaps. Source #5/#6/#9. Observe old metadata unavailable fails clearly, rather than borrowing current untracked mapping.
- [ ] CSS `@import`, CSS `url(...)`, static Vue template assets create local edges when resolvable. Remote URLs and arbitrary strings merely resembling paths do not. Source #6. Observe image→stylesheet→component→page and static template asset consumer; unresolved required local target fails.
- [ ] Auto-imports are supported when AST usage plus existing configuration/source/generated metadata establishes actual target; not name coincidence or a hand-maintained Difftrail graph. Source #6. Observe actual component setup, configuration/map-only changes, two same-name components disambiguated by evidence; missing map/runtime-only custom resolver fails without executing it.
- [ ] No arbitrary project code/config plugin/resolver function/build/generator/script execution to supply evidence, no network/install/fetch. Source #5/#6/#9. Observe marker-producing malicious project script remains unrun.

## 4. Failure policy

- [ ] Required parse/analyze/resolve gaps at **either** endpoint prevent success, including broken import in deletion variants. Source #7/#10. No omission, partial result/error suppression/warn mode/all-files fallback/downstream checks. Diagnostics identify file, snapshot/revision and actionable reason; source #8.
- [ ] Output filters cannot hide required analysis gaps. Validate all required analysis, filtering/output format before emitting stdout. Source #7/#8. Observe failure after an otherwise discoverable result yields exactly zero stdout bytes.
- [ ] Scope success to supported static dependency analysis; not universal runtime/external-behavior completeness. Do not invent speculative runtime dependencies or gaps. Recognized external/terminal inputs are valid without outgoing graph. Source #7.
- [ ] Preserve consuming project's mandatory checks; CLI only supplies impacted-file selection and does not execute runners or bypass gates. Source #1/#7/#10.

## 5. Exact public output and status (#8)

- [ ] Default line output: sorted unique head-existing impacted filtered files, one raw path + LF each; empty = **zero bytes**. Paths root-relative with `/`, exact spelling/case, no `./`, no quoting/shell escaping, locale-independent path-string sorting.
- [ ] `--null`: raw path + NUL including last; empty = zero bytes; preserve CR/LF/spaces inside paths. `--json` and `--null` mutually exclusive.
- [ ] Line mode selected file containing CR or LF: exit 2, zero stdout, stderr recommends JSON/NUL. Check byte behavior before any line emission; removed paths alone do not enter line results.
- [ ] `--json`: one object + trailing LF, exact required fields `{root, base, head, scope:'static', files, removed}`; base/head resolved SHAs; base null only genuine root; root absolute repo root. No unapproved version/seeds/diagnostics substitute schema.
- [ ] `files` = impacted paths present at selected head; `removed` = impacted paths absent head, including former rename path when absent. Both normalized sorted unique and filtered by same rules. Presence is path-based, no public rename identity claim.
- [ ] No filters returns all eligible paths. Repeated `--filter` positive patterns OR across entire normalized path, for files and removed, after traversal/validation. `*` within segment; `?` one in segment; `**` zero/more segments; dotfiles ordinary; bare `*.test.ts` root-only; no exclusion/negation options. Observe matching removed paths and nonmatching intermediates remain graph/explanation evidence.
- [ ] `--explain` requires `--json`; otherwise exit 2. Without flag omit explanations field. With flag one `{file,snapshot:'base'|'head',chain}` per returned or removed path; seed self-chain; whole chain belongs to chosen one endpoint; intermediate filtered paths visible. Shortest witness; equal length prefer head, then deterministic path-string order; entry order by file. Test both endpoint and within-endpoint ties, direct seed vs longer witness, removed paths.
- [ ] Exit 0 success including empty; 1 analysis/repository/history/operational failure; 2 arguments/combinations/output incompatibility. Human-readable stderr even with JSON; successful data only on stdout; zero partial result bytes on all errors. Diagnostic exact prose not a stable machine interface.
- [ ] Byte/schema assertions, not just contains-one-path: empty/text/NUL/JSON; spaces/non-ASCII/dot/newline names supported by host FS; stable ordering; line-format rejection; invalid flag combinations; CLI root and subdirectory.

## 6. Package, platforms and repository preservation

- [ ] npm-distributed Node package exposing executable `difftrail`, normal use as pinned dev dependency. CLI only supported consumer interface; workspace module APIs are internal seams, not required public SDK. Source #9 plus user split packages.
- [ ] Required extraction/JS/TS/Vue parsers delivered as tool dependencies and verified in **isolated packed consumer**, not borrowed from development workspace or target package optional dependency. Source #9/#10. Validate tarball bin/shebang/permissions/files/license/metadata and all runtime imports/deps.
- [ ] Select actual compatible versions, declare Node engines to match, validate every advertised runtime, verify registry-name availability at packaging stage. No npm publication itself required. Source #9.
- [ ] macOS, Linux, Windows support with same flags/status/path format and Git; no POSIX-only shell/utility chain for snapshots, process execution or path handling. Source #9. Record real matrix runs; CI configuration alone does not mean remote platforms passed. State unavailable matrix evidence explicitly.
- [ ] Tool requires Git and ordinarily installed project deps, then offline analysis with no project execution or automatic setup. Preserve checkout/index/refs/tracked/untracked/configuration; temp cleanup success/failure. Source #9/#10. Test packed root/subdirectory execution and preservation against dirty fixture.
- [ ] No persistent caching, daemon, watch, arbitrary resource-size truncation, runtime promises or invented performance target. Source #9/#10.

## 7. Runnable example app (#10 plus user's Turborepo)

- [ ] Genuine buildable/runnable Vue/TS app, >=3 navigable pages, shared and deliberately independent source; shared Vue components/composables/utilities; shared workspace package; real aliases/package boundaries.
- [ ] Valid script/script-setup JS/TS examples, type-only edges, re-exports, literal dynamic imports distributed across valid components. Images/styles/CSS imports/URLs/static Vue assets and all explicit external script/template/style src forms.
- [ ] Working statically resolvable auto-import setup with selected-commit configuration/metadata; no untracked current map substituted for history.
- [ ] Normal install/build/dev scripts and reproduction docs; app builds and **renders pages**, not just parser snippets. One monorepo Git history, no nested .git. Invalid syntax/gap variants live in isolated test repos so committed example isn't poisoned.
- [ ] Isolated real monorepo copy: baseline + actual commits changing shared utility, page-only dependency, stylesheet asset, alias/component mapping. Invoke packaged CLI default/range root/subdir; fixed expected file sets and explicit unrelated absences. Separate deletion/rename/error histories preserve original checkout.
- [ ] Browser manual QA visits all pages, and actual packaged CLI commands are executed against real histories, with observed outputs/statuses recorded. Relevant automated app gate remains mandatory.
- [ ] Turborepo orchestrates cohesive split module packages, example/test app, future docs-site workspace boundary. Future hosted docs site is not required by current wording.

## 8. Required seams and completion evidence (#10)

- [ ] Focused impact graph tests: transitive closure, cycles, dedupe, independent endpoints, valid deterministic explanations. Catches traversal, not source parsing/resolution.
- [ ] Actual source extractor/resolver fixture tests including Vue and config/metadata provenance. Catches missing/misdirected edges and silent fallbacks; precomputed mocked graphs cannot substitute.
- [ ] Built/packed CLI subprocess in real temporary Git repos and isolated example monorepo copies: byte/schema/status/stderr, packaging/Git/repo-preservation tests. Do not use selector itself to calculate expected fixtures.
- [ ] Real app + packaged CLI manual QA, recorded actual outcomes; compliments rather than replaces automated tests.
- [ ] Follow existing routed TDD/quality process at agreed seams; no new product/seam interview necessary: #10 records approval. Each implementation task requires distinct review and QA jobs per current user request; findings repaired and gates rerun before integration.
- [ ] Record **complete cold invocation** timing including snapshot preparation and both endpoint graph extractions; representative example changes, file/edge/selected-file counts, runtime/platform, whether deps preinstalled; repeat runs without persistent cache. No arbitrary ms target or assertion reduced selection proves reduced total test time.
- [ ] Final full automated quality gates + representative packed CLI scenarios + buildable/running example + independent review + actual manual QA + PR + stated limitations/platform unverified paths. Ready-for-npm evidence is packed external install/run, not actual registry publication.

## Planning audit result

The canonical specification and approved eight-ticket graph retain the required behavior and verification coverage. The audit precision correction concerning unavailable required history (rather than every shallow repository) was applied before final publication. This checklist is implementation acceptance guidance; no code/build/test/manual-QA or platform/runtime evidence is claimed here.

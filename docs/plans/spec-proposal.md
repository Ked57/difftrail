# Difftrail implementation spec

Status: approved for implementation. Synthesized from approved wayfinder decisions; the user approved the exact eight-ticket graph and blocking edges on 2026-10-15. Product scope and four verification seams are already approved. Published as [implementation spec #12](https://github.com/Ked57/difftrail/issues/12).

Canonical source: [completed map #1](https://github.com/Ked57/difftrail/issues/1). Full fetched bodies/comments: `/private/tmp/difftrail-source/issue-<number>.md`. Linked resolutions remain authoritative. Research branches are references and must never be merged.

## Problem Statement

Developers and LLMs need the files potentially impacted by the latest commit or an explicit range, so they can feed correct file sets into their chosen tools. Changed files miss consumers; silently missing dependencies or mixing historical/current edges gives misleading results.

## Solution

Deliver an npm Node.js CLI, `difftrail`, that computes file-level impact from committed Git snapshots using the supported static dependency model. Include changed-file seeds and direct/transitive dependents, distinguish returned head-existing files from removed impacted paths, provide deterministic machine output and explanations, and fail on detected analysis gaps.

Use Turborepo and cohesive module packages, a runnable multi-page Vue/TypeScript example/test app, and a future documentation-site workspace boundary. Deliver a reviewed PR with automated, manual-QA, package, platform, and timing evidence. Actual npm publication is separate.

## User Stories

1. As a developer, I want latest checked-out commit analysis by default, so I can understand my last committed change.
2. As a developer, I want explicit endpoints and optional explicit merge-base selection, so comparison policy is reproducible.
3. As a developer, I want genuine root and first-parent merge handling, so defaults remain meaningful across history shapes.
4. As a developer, I want net endpoint differences, so fully reverted changes do not become false seeds.
5. As a developer, I want dirty local changes ignored, so committed analysis never mixes uncommitted evidence.
6. As a developer, I want deleted old paths and both rename paths retained as seeds, so historical relationships remain discoverable.
7. As a developer, I want seeds plus reverse transitive dependents, so changing an importer does not select its unchanged dependencies.
8. As a developer, I want cycles and duplicates handled deterministically, so results terminate and contain unique paths.
9. As a developer, I want tracked files eligible regardless of extension, role or directory, so all repository files follow the same impact rule.
10. As a developer, I want independent base/head traversal, so neither impact nor explanation chains stitch incompatible snapshots.
11. As a developer, I want JS/TS/JSX/TSX/CommonJS, type-only, re-export and literal dynamic relationships supported, so real code participates.
12. As a Vue developer, I want ordinary/setup scripts, scriptless SFCs, external script/template/style references and parser errors handled, so Vue is reliable.
13. As a developer, I want per-package aliases, inherited configs and workspace relationships resolved from selected snapshots, so boundaries do not hide consumers.
14. As a developer, I want CSS imports/URLs and static Vue template assets analyzed, so asset changes reach consumers.
15. As a developer, I want established static auto-import mappings resolved from source/configuration/metadata, so implicit use works without basename guesses.
16. As a developer, I want configurations actually used by analysis connected to consumers, so config-only changes propagate without global filename-based widening.
17. As a developer, I want detected parsing/resolution/dynamic/historical gaps to fail clearly, so unknown cannot masquerade as empty.
18. As a CI author, I want line/NUL/JSON outputs and stable normalized paths, so scripts consume results safely.
19. As a CI author, I want positive OR glob filters after traversal/validation, so filters preserve evidence and cannot hide errors.
20. As a developer, I want shortest deterministic endpoint-specific explanation chains, so each result is understandable.
21. As a developer, I want root/subdirectory invocation and unchanged repository state, so analysis integrates safely.
22. As a consumer, I want required parsers included in npm and validated macOS/Linux/Windows/Node support, so installation is dependable.
23. As a maintainer, I want a real multi-page test app with shared and independent source, so CLI correctness uses buildable application code.
24. As a maintainer, I want enforced quality gates, regressions, review and actual manual QA, so the PR is release-ready.
25. As a maintainer, I want complete invocation timings, so performance claims include snapshots and both extractions.
26. As a maintainer, I want a future docs workspace boundary, so documentation can join without restructuring modules.

## Implementation Decisions

### Comparison and impact

Implement [comparison #2](https://github.com/Ked57/difftrail/issues/2#issuecomment-6188002310) and [impact/ignores #3](https://github.com/Ked57/difftrail/issues/3#issuecomment-6188224760):

- Default first parent of HEAD to HEAD; first-parent merge; genuine root uses empty base. Explicit endpoints use net differences; merge-base is opt-in. Ignore staged/unstaged/untracked changes.
- Invalid refs and unavailable required history, including a shallow boundary hiding the required parent, are errors. Never fetch or substitute another baseline.
- Seeds include additions/modifications, deleted old paths and both rename names. Reverse closure includes each seed and every direct/transitive dependent once. Changing an importer never automatically selects unchanged imports. File-level changes include comments/formatting.
- Gitignore is the only automatic ignore mechanism. Tracked files remain eligible despite matching ignore patterns. No inherited extractor pruning by file kind, extension, test/generated/dependency status or directory. Filters apply after traversal.

### Graph ownership, snapshots, extraction and resolution

Implement [graph #5](https://github.com/Ked57/difftrail/issues/5#issuecomment-6188560563), [non-import #6](https://github.com/Ked57/difftrail/issues/6#issuecomment-6188733028), and [configuration consumers #10](https://github.com/Ked57/difftrail/issues/10#issuecomment-6189439230):

- Reuse dependency-cruiser's programmatic interface. Difftrail owns Git selection, snapshot preparation, normalization, reverse traversal, path/status reconciliation and output. No public SDK/plugin/alternative-backend framework or new general resolver.
- Materialize isolated committed snapshots; extract and traverse each endpoint independently, then union impacted paths. NEVER union historical/current edges before traversal. Root comparison has empty base graph. Preserve snapshot context and normalize repository identity across packages.
- Retain original specifiers separately from resolved paths, relationship kinds, endpoint revisions, tracked paths/bytes, old/new statuses, configuration provenance and gaps.
- Support JS/TS/JSX/TSX/CommonJS, ordinary/type-only imports, re-exports and literal dynamic imports. Detect unsupported variable dependencies even when extractor omits them.
- Tool-controlled compatible Vue SFC/AST parsing supplements dependency-cruiser. Preserve all applicable ordinary/setup JS/TS imports and type edges; add external script/template/style src edges; preserve parser diagnostics; distinguish valid scriptless components from failure. Normalize relationships onto owning SFC. Do not depend on accidental optional compiler lookup or emitted JS that drops type edges.
- Add local CSS @import/url and static Vue template asset dependencies. Remote resources/terminal inputs need no invented outgoing edges. A referenced target outside supported analyzable syntax remains an edge without a false claim that its outgoing dependencies were analyzed. Arbitrary path-like strings do not establish dependencies.
- Resolve auto-import AST usage through actual snapshot-consistent source/config/generated mappings. Same basename alone is insufficient. No arbitrary resolver/plugin/generator/project execution to create missing evidence; current generated mappings cannot prove historical dependencies.
- Reuse effective per-package/inherited aliases and workspace config; do not assume one root tsconfig. Configuration/metadata actually used to analyze/resolve a consuming file is a dependency of that file in that endpoint. Preserve provenance for explanations; changing config propagates by ordinary closure. A particular filename alone never creates repo-wide impact.

### Gap policy

Implement [safety #7](https://github.com/Ked57/difftrail/issues/7#issuecomment-6188857275): detected required parse/extraction/resolution/configuration/historical-input gaps at either endpoint prevent success. No partial-success/error-suppression/fail-warn modes or automatic all-files fallback. Filters cannot conceal gaps. Success means completed supported static analysis, not universal runtime/API completeness. Report actual detected gaps rather than hypothetical unknown behavior.

### Exact CLI/output

Implement [public contract #8](https://github.com/Ked57/difftrail/issues/8#issuecomment-6189018643):

- `difftrail`: latest commit. `--base A [--head B]`: direct endpoints with head default HEAD. Add `--merge-base` to replace base with common ancestor. Head/merge-base without base is invalid.
- Default line output: each raw returned path plus LF; empty zero bytes. `--null`: each raw path plus NUL, including last; empty zero bytes. `--json`: one object plus LF. JSON/NUL mutually exclusive.
- Root-relative forward-slash paths, preserve spelling/case, no leading `./`; deduplicate and sort by normalized path string independent of locale. Same identity from subdirectories.
- Line/NUL and JSON `files` contain impacted paths present at head. JSON `removed` contains impacted paths absent at head. Apply the same filters to both arrays.
- JSON fields: `root` absolute repository root; `base` actual resolved SHA or null for genuine root empty base; `head` resolved SHA; `scope: "static"`; `files`; `removed`. Do not invent a mandatory seeds/version field.
- Repeated positive `--filter` globs are OR and match whole normalized paths. `*`/`?` within segments; `**` zero or more segments; dot paths normal; bare pattern root-only. No negation or graph exclusion option.
- `--explain` requires JSON and adds `explanations`, one entry per files/removed path: `file`, `snapshot` base/head, `chain` from changed seed through dependents. Prefer shortest, then head at equal length, then path-string order. Sort entries by file. Preserve filtered intermediate paths. Entire chain belongs to one endpoint.
- Exit 0 success including empty; 1 analysis/repository/history/operational failure; 2 invalid flags/combinations/output. Diagnostics stderr; failure stdout zero bytes. Complete analysis/filter/output validation before emission. Selected CR/LF filenames in line mode fail with advice to use JSON/NUL; preserve them in those modes.
- No progress/explanation/diagnostic contamination of stdout and no downstream runner execution. Include help/version.

### Delivery/workspace/example

Implement [distribution #9](https://github.com/Ked57/difftrail/issues/9#issuecomment-6189147954), [handoff #10](https://github.com/Ked57/difftrail/issues/10#issuecomment-6189439230), and current user requirements:

- npm Node executable `difftrail`, normal consumer project dev dependency; ship all required extraction/JS/TS/Vue parsers. Verify package-name availability and dependency-compatible supported Node range; validate advertised runtime/platform matrix.
- macOS/Linux/Windows plus Git. Use portable Node APIs/subprocess argument arrays, no required Unix shell chains.
- Git root discovery from root/subdirectories/worktrees, including `.git` files. Existing configuration discovery; no mandatory init/Difftrail config/duplicate aliases/handwritten map.
- No installs/fetches/project scripts/persistent graph cache/daemon during analysis. Historical missing packages/artifacts remain gaps; current installation is not automatically historical proof.
- Clean isolated temporary snapshots on success/failure; preserve checkout/index/refs/tracked/untracked files/project config. Normal fixture install/build may occur before CLI invocation.
- Strict TypeScript Turborepo with cohesive snapshot, extraction/resolution, generic impact, CLI packages. Exact package naming/layout follows simplest convention; avoid forwarding wrappers. Prepare future docs-site boundary without building a hosted docs site.
- Genuine Vue/TS example app: at least three navigable pages; shared and independent components/composables/utilities; shared workspace package and aliases; ordinary/setup JS/TS, type-only/re-export/literal-dynamic relationships; styles/images/CSS URLs/imports/static template assets; external block references; working snapshot-consistent static auto-import setup. App installs/builds/renders with documented reproduction. One monorepo Git history, no nested git; invalid variants stay isolated.
- Enforced build/typecheck/lint/test/CI scripts. npm metadata, README/license, executable, explicit published files, release instructions and isolated tarball consumer evidence establish readiness. No automatic npm publication or PR merge.

## Testing Decisions

Four seams already approved in #10:

1. Impact graph API: reverse reachability/cycles/deduplication, independent endpoints and valid explanation chains. Catches traversal; misses parser/resolver correctness.
2. Real source extraction/resolution API: actual parsers with Vue/config provenance fixtures. Catches missing/misdirected edges and silent fallback; mocked graphs cannot replace it. Misses packaging/Git/process integration.
3. Packaged executable subprocess: actual temporary Git histories/isolated example copies; exact bytes/schema/status/stderr and repository effects. Catches Git/output/package integration; misses app rendering and unexecuted platforms.
4. Manual app/CLI: run app and visit pages; invoke packaged CLI against isolated real histories; record observed outcomes. Complements automated coverage.

TDD at these boundaries, one red/green behavior per slice, with literal independent expected paths/graphs. No prior tests exist. Required cases are exhaustively mapped to tickets in `ticket-proposal.md` and canonical #10: Git/history/root/merge/range/dirty; generic reverse impact; separate endpoints; all JS/TS/Vue forms; assets/auto-import evidence; config-only consumers; tracked-ignore policy; failures; exact outputs/globs/explanations; isolated package/platform/state cleanup.

Use real example copies with actual baseline/follow-up utility, page-only, asset, alias/map commits; root/subdir and latest/range invocations; independent-file exclusions; separate deletion/rename/error histories. Quality scripts remain enforced. Each code job receives independent standards/spec review, repairs, actual manual QA and verified integration. Final review audits every acceptance row.

Record full cold invocation timings including snapshots and both extractions; file/edge/selected counts, runtime/platform/dependency status; repeated invocation without persistent caching. No invented speed/scale threshold. A configured CI matrix alone is not proof of execution; explicitly report unverified platforms/paths.

## Out of Scope

Downstream runner/E2E orchestration; symbol/runtime pruning or universal completeness; public SDK/plugin/backend frameworks; mandatory initialization/handwritten maps; arbitrary project execution/auto installation/fetch; persistent cache/daemon; partial success/error suppression/all-files fallback; other ecosystems; hosted docs site; actual npm publication; automatic PR merge; merging research branches.

## Further Notes

Planning declares no remaining product/architecture question. Exact dependency pins, npm name, scripts, fixtures and measured performance are implementation choices. Surface concrete contradictions found by fixtures rather than weakening the contract. Current evidence is planning/source discovery only: no implementation, runtime check, app rendering, timing, or manual QA yet.

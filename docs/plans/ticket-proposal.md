# Approved implementation tickets

Status: approved. The user approved this exact eight-ticket graph and blocking edges on 2026-10-15; no further planning confirmation is needed. Product scope and four seams are approved in [handoff #10](https://github.com/Ked57/difftrail/issues/10#issuecomment-6189439230). Read `spec-proposal.md` and `/private/tmp/difftrail-source/issue-<number>.md` for canonical comments.

## Approved graph

| # | Ticket | Blocked by | What it delivers |
|---|---|---|---|
| 01 | Governed Turborepo and first packaged impact CLI | None | Install/build/run a simple latest-commit JS impact command using real dependency-cruiser and temporary snapshots, exact initial text/JSON result and gap failures. Establish constrained module packages, quality scripts, test-app workspace and future docs boundary. |
| 02 | Complete independent endpoint impact and Git comparison semantics | 01 | Real root/first-parent merge/range/merge-base/deletion/rename/removed-edge histories follow the contract, separate closures never invent chains, and dirty/shallow/invalid history and cleanup are verified. |
| 03 | Resolve aliases, workspaces and configuration consumers | 02 | Full JS/TS/JSX/TSX/CommonJS/type/re-export/literal-dynamic coverage, package/inherited configs and workspaces; config-only changes reach actual consumers; required unresolved/dynamic/historical evidence fails. |
| 04 | Support Vue SFCs and explicit local assets | 03 | Actual ordinary/setup JS/TS/scriptless/type-only SFC parsing; external script/template/style src; CSS import/url and static template assets; tool-owned compatible parsers and actionable errors. |
| 05 | Resolve static auto-imports and enforce complete gap policy | 04 | Real established component mappings and their config changes affect consumers; no basename guessing/current historical substitution/project execution; failures at either endpoint never become partial success. |
| 06 | Complete exact output, filters and explanations | 05 | Full line/NUL/JSON bytes/schema/status, positive OR glob semantics, unusual paths, removed filtering, deterministic shortest endpoint-specific explanations; filtering cannot hide gaps. |
| 07 | Build the runnable multi-page Vue test app and real histories | 03, 04, 05 | Three pages build/render with shared/independent source, shared workspace package, representative scripts/types/assets/external blocks/static auto-imports, documented reproduction and isolated actual-Git CLI acceptance histories. |
| 08 | Prove npm release readiness and complete the PR | 06, 07 | Isolated tarball consumer and parser checks; full quality and platform/Node CI; app+CLI manual QA; complete timing/count evidence; release/support/docs; final independent review and fixes; PR ready for review. |

07 can run alongside 06 after its blockers: app build/render and real fixture preparation are independently verifiable. Final acceptance composes both in 08. Earlier slices fail on detected unsupported required constructs rather than silently claiming final coverage. No successful seeds-only substitute command or public SDK is needed.

## Job and verification process

One implementation ticket = one implementer subagent job, in a worktree based on integration. Read TDD, state confirmed seam coverage/limits, follow red/green per behavior, and merge latest integration before reporting. Follow with a separate pinned review job (standards/spec reviewers), repairs by implementer, a separate actual manual-QA job, repair/retest, and a separate merger job. Main coordinates via context pointers. Final integration gets independent review/repair and managed worktree cleanup.

01 establishes tool-enforced correctness before broad features: strict TypeScript, documented standards, constrained package contracts, dependency lock, runnable lint/typecheck/build/test/pack gates, actual subprocess acceptance and packed runtime-dependency smoke. Preserve/incorporate the user's existing glossary deliberately. All four approved seams apply as relevant; app/browser verification starts with runnable app behavior.

## Acceptance requirement matrix

| Canonical requirement | Ticket(s) | Required evidence |
|---|---|---|
| Turborepo/module packages/quality scripts/npm executable/test app/future docs boundary | 01, 07, 08 | Clean install/build/typecheck/lint/test; packed executable; runnable app |
| Latest commit/root/first-parent merge/endpoints/merge-base/net revert | 01, 02 | Actual Git histories with exact seed/result sets |
| Dirty isolation/invalid refs/shallow history/no fetch | 02 | Status/zero stdout and unchanged checkout |
| Added/deleted/both rename names/removed paths | 02 | Exact files/removed and real deletion/rename histories |
| Reverse closure/unchanged imports excluded/isolated seeds/cycles/dedup | 01, 02 | Graph fixtures plus real CLI expected paths |
| Independent endpoint closures/no invented cross-snapshot chains | 01, 02 | Adversarial graph/source histories |
| JS/TS/JSX/TSX/CommonJS/type/re-export/literal-dynamic | 03 | Real dependency-cruiser extraction and CLI fixtures |
| Per-package/workspace/inherited aliases/config-only consumers/provenance | 03, 05 | Snapshot-specific config changes and unrelated-consumer exclusions |
| Vue entries/targets/scripts/setup/JS/TS/scriptless/type/src | 04 | Real parser/resolver and installed CLI fixtures |
| Invalid Vue versus scriptless; shipped parser capability | 04, 08 | Invalid isolated variants and installed package smoke |
| CSS @import/url/static Vue assets/external blocks | 04 | Known source relationships, real CLI path sets |
| Static auto-import usage/mapping/config changes/same-name ambiguity | 05 | Actual snapshot-consistent source/config/metadata |
| Missing/runtime/historical mappings and required dynamic/parse gaps | 03, 04, 05 | Status 1, no stdout, actionable endpoint/file diagnostics |
| No file/directory pruning; tracked ignored/dot/generated/dependency/test paths eligible | 01, 03, 08 | Tracked representative path fixtures |
| Either-endpoint failure/no partial/widened fallback/filter-hidden gaps | 01–06 | Actual negative subprocess and API fixtures |
| Exact line/JSON/NUL/empty output/schema/root/subdirectory/stable paths | 01, 06, 08 | Byte/schema assertions, no substring-only proof |
| CR/LF/spaces/non-ASCII and invalid flags/output | 06 | Host-supported filename fixtures; status 2 and zero partial stdout |
| Positive OR globs/dot paths/removed filtering after traversal | 06 | Exact matched outputs and nonmatching intermediates |
| Explanation shortest/ties/head preference/provenance/order/filter intermediates | 02, 06 | Independently expected chains; no stitched endpoints |
| Three actual pages/shared-independent components/utilities/shared workspace | 07 | App build and actual browser page navigation |
| App assets/external blocks/auto-import setup/documented reproduction | 07 | Real build/render and known source relations |
| Example utility/page-only/asset/alias/map Git commits; root/subdir/latest/range | 07, 08 | Actual histories, exact paths and unrelated exclusions |
| Isolated tarball consumer/executable/runtime deps/npm name/Node policy | 01, 04, 08 | npm pack/install/direct invocation and metadata audit |
| macOS/Linux/Windows and declared Node range | 08 | Actual CI matrix results; explicit unverified limits |
| No project execution/install/fetch/persistent state; cleanup/repository effects | 01, 02, 05, 08 | Before/after checkout/index/refs/files/config; success/failure cleanup |
| Full cold timing/counts/runtime/platform/dependency status/repeat runs | 08 | Actual measurements including materialization and both extractions |
| Regressions/review/manual QA/release docs/final PR | All; final 08 | Relevant gates, pinned reviews, exact manual scenario results and PR URL |

## Publication

Published specification #12 and implementation tickets #13–#20 with ready-for-agent labels, native sub-issues and native blocking edges; see `implementation-tracker.md` for URLs and dependencies. Read tracker operation reference before mutations. Completed wayfinder map/decisions remain closed and unchanged. New draft integration PR opens after first merge and closes only new implementation spec/tickets. Final readiness requires all acceptance evidence, review and repairs.

The graph, edges, product scope and seams are approved. Proceed to publication and implementation.

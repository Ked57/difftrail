# Ticket 08 verification

The reviewed release implementation is integrated on `codex/difftrail-cli` at
`fd29b23ddadc629e1afb2683366321ba2206ba7a`. This merge includes reviewed
release pin `07679254b837fdf127681a59cfb7561e64aecea4` and the test-only
Windows package harness repair at `8786aa6134cba57600aa72eb87f855e25052931d`.
Runtime source is unchanged from the reviewed release pin. Ticket #20 remains
open and draft PR #21 remains draft until final-head CI and acceptance are
complete.

## Release candidate

Independent Standards and Spec reviews found no remaining findings. The CLI and
workspace declare Node `^22.18.0 || ^24.11.0`. The packed npm candidate was
installed and exercised in isolated npm and pnpm consumers, including parser
version conflicts; its package contents and executable metadata matched the
release allowlist. A read-only registry lookup returned E404 for `difftrail` on
2026-10-16. This result can change and does not reserve the package name or
prove publishing access. No package was published.

## Automated evidence

- `pnpm verify:fast` passed on the release-candidate workflow, covering format,
  lint and difficulty audit, TypeScript/Vue checks, and 60 unit tests with 100%
  core coverage. The final integration-head run is recorded below.
- Focused integration, nine example histories, package checks, and Knip passed
  as individual jobs on the release candidate. The original aggregate local
  `pnpm verify:full` exit status was not captured, so this record does not claim
  that aggregate result.
- Earlier Ubuntu Node 22 full-gate jobs passed in Actions runs
  [38884333935](https://github.com/Ked57/difftrail/actions/runs/38884333935)
  and
  [38885160976](https://github.com/Ked57/difftrail/actions/runs/38885160976).
  These are supporting evidence only; they were not run on this final
  integration head.
- Historical release-pin matrix run at `07679254b837fdf127681a59cfb7561e64aecea4`
  [38886346811](https://github.com/Ked57/difftrail/actions/runs/38886346811)
  passed all eight macOS and Linux OS/runtime cells and the mutation job. All
  four Windows OS/runtime cells failed in the package-test helper: it split a
  spaced Git commit argument when preparing an isolated fixture. The runtime,
  unit, integration, and example-history jobs passed in those Windows cells.
  The test-only helper repair is included at `8786aa6`; its local packed-package
  check passed with exit 0. This historical matrix result is not final
  integration-head platform evidence.
- The separate domain mutation job passed its 80% threshold with a score of
  91.67%.

On integration head `fd29b23ddadc629e1afb2683366321ba2206ba7a`,
`pnpm verify:fast` and `git diff --check` passed. The fast gate completed format,
lint and difficulty audit, TypeScript/Vue checks, and 64 unit tests with 100%
core coverage. The docs-only commit will be checked for formatting and
whitespace before push. The required platform matrix runs the full gate on macOS, Linux,
and Windows at the minimum and current Node 22 and 24 releases (12 OS/runtime
cells). Only completed final-head workflow results count as platform evidence.

## Manual QA and timing

Installed-package QA passed on macOS arm64 with Node 22.23.1 against the
reviewed runtime source. It covered the published artifact in unrelated
consumers, exact output modes, repository-root discovery, fail-closed analysis
gaps, selected path edge cases, pnpm virtual-store containment, symlink
relationships, and preservation of repository state. The unchanged Vue test
app passed browser QA on the same platform and Node line, including all three
pages, direct route refresh, keyboard interaction, responsive layouts, and axe
checks.

Four representative installed-CLI histories were each run twice with complete
invocation timing, including both snapshots and graph extraction. Each endpoint
had 130 tracked files and 428 dependency edges. All eight invocations matched
fixed expected results and took approximately 5.5–7.5 seconds. No performance
threshold or speed claim is made. The timing sample is separate from the
nine-history integration harness.

The final commit and completed CI matrix will be recorded in the
[Ticket 20 release-validation comment](https://github.com/Ked57/difftrail/issues/20#issuecomment-6215990357)
before PR #21 is marked ready. No npm publication or PR merge is part of this
ticket.

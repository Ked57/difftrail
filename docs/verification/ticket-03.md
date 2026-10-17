# Ticket 03 verification

Status: **complete** on integration branch `codex/difftrail-cli`, merge commit
[`f139f54`](https://github.com/Ked57/difftrail/commit/f139f547ddb84b60de61e96294dcdd8e35e2fdb6).
The repaired ticket branch pin was
[`e6a5aa6`](https://github.com/Ked57/difftrail/commit/e6a5aa633e9305a2c30f59e2f2fd4bfe3b0f079b).

## Automated gate

The implementation report records a passing `pnpm verify:full` at the repaired
pin: 22 unit tests, 30 CLI integration tests, fresh npm and strict pnpm packed
consumers, and Knip. The gate also includes formatting, lint, type checking,
the static difficulty audit, package metadata/executable/license checks, and
the shipped TypeScript parser smoke. The integration merge did not rerun this
unchanged gate. The report does not claim a mutation-suite pass.

## Reviews

The final standards review found no remaining actionable findings. The final
specification review found no remaining findings in the repair range. Both
reports are retained at `/private/tmp/ticket03-standards-review.md` and
`/private/tmp/ticket03-spec-review.md`.

## Manual CLI QA

The original pinned artifact at `ad8c6e2` failed on omitted TypeScript
import-equals and import-type-query consumers and on npm `devDependencies`
lock evidence. Those observations remain in the QA report as historical
failures; they were retested on the repaired pin, rather than treated as current
results.

Independent manual QA copied repaired commit `e6a5aa633e9305a2c30f59e2f2fd4bfe3b0f079b`
into an isolated directory, installed dependencies with a frozen lockfile,
packed a fresh tarball, and installed it into separate npm and strict pnpm
consumers. The packed CLI passed the formerly failing TypeScript relationship
cases, npm root and workspace `devDependencies` evidence, and the neighboring
alias, workspace-export, lock-mismatch, gap, root/subdirectory, dirty-state,
and snapshot-cleanup probes. The fresh retest tarball SHA-256 was
`293db3ab4593cb284cef695716f26b3a3e431b445c3e021278442a8640829b7c`.

The full report is `/private/tmp/ticket03-manual-qa-luna.md`; repaired-pin
stdout, stderr, and fixture records are under
`/private/tmp/ticket03-manual-qa-luna-repair/`. The integration merge itself
did not produce a new tarball or rerun manual QA.

## Limits

Executed evidence covers Node 22.23.1 on macOS. Linux, Windows, and Node 24
remain unverified. The scoped repaired-pin retest did not rerun every original
acceptance scenario, the Vue app/browser, or a workspace package with distinct
`import` and `require` export targets. These remain open verification limits;
later tickets cover Vue and the example application. Browser QA does not apply
to this ticket's CLI-only surface.

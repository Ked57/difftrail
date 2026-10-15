# pnpm workspace resolution repair verification

Status: **complete for the reviewed pnpm workspace scenarios** on integration
branch `codex/difftrail-cli`, merge commit
[`ec6efae`](https://github.com/Ked57/difftrail/commit/ec6efae92cb58bffc081560eec1258d11713fe96).
The validated feature pin is
[`e78e734`](https://github.com/Ked57/difftrail/commit/e78e734660a5fbf753f0bf629a3cf5a7baa07dfe).
The issue repairs pnpm external dependency evidence when workspaces install
separate versions or use an `npm:` alias, and ensures failures name the source
that actually requested the dependency.

## Standards review

The first review found no standards breach in the initial workspace repair. A
follow-up review then found that an evidence error could name the first source
in a package even when a later source requested the dependency that failed.
The implementation was repaired to attach sorted, dependency-specific source
context to each validation. The final review found the issue resolved, with a
regression where `a-good.js` requests a valid package and `z-bad.js` requests a
package with a mismatched installed identity. The error names `z-bad.js` and
its package manifest. No other standards or baseline-smell findings were
reported. Full reports are retained at
`/private/tmp/pnpm-workspace-standards-review-luna.md`.

## Specification review

The initial independent review found no mismatch in the workspace resolution
model: each source uses its nearest committed manifest, lock declaration, and
importer-local installed link; `npm:` aliases keep the declared alias as the
lookup key while the lock identity supplies the installed package identity.
A later scoped review independently found the same source-attribution defect as
the Standards review. The final narrow review verified that dependency checks
use the requesting source set, importer setup failures retain manifest context
without inventing a source, global lock failures keep lock-level context, and
analysis gaps retain the snapshot revision and original reason. No remaining
specification finding or scope creep was reported. Full reports are at
`/private/tmp/pnpm-workspace-spec-review-luna.md`.

## Automated gate

`pnpm verify:full` passed on the clean feature pin `e78e734` on 2026-10-15:
formatting, lint and difficulty audit, typecheck, 53 unit tests, 36 integration
tests, package checks for npm and pnpm consumers, and Knip. The integration
merge contains that exact feature commit and its integration parent; the local
full gate was not redundantly rerun for the merge. The final review and manual
QA jobs also did not rerun the broad gate. Mutation testing was not run and is
not claimed as passing.

After pushing integration head
[`9d75e74`](https://github.com/Ked57/difftrail/commit/9d75e74a59c6b991472875dff33052cb60ae81f5),
fresh Ubuntu push run [38782818828](https://github.com/Ked57/difftrail/actions/runs/38782818828)
and pull-request run [38782824884](https://github.com/Ked57/difftrail/actions/runs/38782824884)
both passed `pnpm verify:full`. The optional mutation job was skipped in both.

## Manual packed-package QA

The first fresh npm consumer run used the earlier package pin
`5e2f7545a8aabdb26e5b5833a176bdd0437ee350`. Normal resolution and most error
cases passed, but wrong installed identity produced no importer/source context.
That failure is preserved in the QA report. A scoped retest of `6dd9504`
verified importer context and several neighboring cases, then the final pin
`e78e734` was rebuilt, packed, and installed into a fresh npm consumer for the
exact two-source reviewer reproduction.

On macOS `darwin/arm64`, Node `22.23.1`, and pnpm `10.34.7`, the packed CLI
failed closed with exit 1 and zero stdout for a valid earlier request followed
by a later request whose installed identity was deliberately wrong. The
message named `apps/first/z-bad.js`, `apps/first/package.json`, the snapshot
revision, and the mismatch. A manifest-only importer setup failure also exited
1 with zero stdout and named the manifest and reason without attributing it to
a source. After restoring the valid installed package, the packed CLI ran from
an app subdirectory with exit 0, empty stderr, and exact output
`apps/first/z-bad.js`. The original resolution scenarios also passed with two
versions of one dependency, an `npm:` alias, a missing importer link, a
manifest/lock mismatch, and a clean restored resolution. Temporary snapshot
cleanup and importer link isolation were checked.

The QA report, including artifact SHA-256 values, original failures, preserved
real-Git fixtures, and exact output, is
`/private/tmp/pnpm-workspace-manual-qa-luna.md`.

## Limits

Executed manual evidence covers pnpm `10.34.7` on macOS arm64 with Node
`22.23.1`; CI covers Ubuntu. It does not establish support for other pnpm
versions, peer-context variants, custom virtual-store layouts, npm nested
layouts, Windows, macOS CI, or Node 24. The fixture install used `--prefer-offline` and
scripts disabled; Difftrail analysis itself performs no install, fetch, or
project-script execution. No browser QA applies to this analyzer and CLI
change. The package was packed and installed locally; no registry publication
was performed.

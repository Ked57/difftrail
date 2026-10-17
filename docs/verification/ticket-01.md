# Ticket 01 verification

Status: **complete** on integration branch `codex/difftrail-cli`, merge commit [`fa5fc20`](https://github.com/Ked57/difftrail/commit/fa5fc20ead54f52c6fde5d6473d9e68ed70bf0c1). The merged implementation is ticket branch commit [`87d76a0`](https://github.com/Ked57/difftrail/commit/87d76a08db9984a22ce4f1ae81727b4e84517432), reviewed against the approved Ticket #13 and specification.

## Automated gate

The implementation reported a passing `pnpm verify:full` run at `87d76a0`:

- `pnpm format:check`, ESLint and the difficulty audit passed; maximum Halstead difficulty was 23.1 against the limit of 80.
- TypeScript typecheck passed.
- Unit suite passed: 2 files, 9 tests. The core package reported 100% statements, branches, functions and lines for its 21 statements, 8 branches, 2 functions and 20 lines.
- Integration suite passed: 1 file, 15 tests.
- Isolated npm tarball install, executable, bundled modules, license, package metadata and shipped parser checks passed.
- Knip passed.

The implementation also reports the existing core mutation score at 100%; the final full-gate log does not rerun mutation testing. The full-gate log is retained in the implementation run at `/private/tmp/ticket01-factory-full-gate.log`.

## Manual CLI QA

Independent hands-on QA returned **PASS** for 18 direct scenarios on a fresh installed tarball built from `87d76a0`. The installed executable's bundled `dist/cli.js` SHA-256 matched the source artifact. The run used Node 22.23.1 on macOS arm64.

Scenarios covered reverse dependency closure and JSON output; dirty-worktree and subdirectory behavior; nested `createRequire` resolution; lexical `require` shadowing; atomic, actionable failures for unresolved, dynamic, unsupported and malformed inputs; TypeScript rejection; root and empty commits; deletion reporting; snapshot cleanup and repository-state preservation; and argument, version and help behavior. Each scenario passed with direct stdout, stderr, exit-status and state evidence recorded by the QA run.

The full report and individual execution evidence are retained at `/private/tmp/ticket01-manual-qa-luna.md` and `/private/tmp/ticket01-manual-qa-luna/`. Browser, app and HTTP checks do not apply because Ticket 01 adds a CLI surface only.

## Reviews and limits

The initial and repair standards reviews found no actionable issues. The final specification review of `87d76a0` also found no remaining findings against Ticket #13. Their reports are retained at `/private/tmp/ticket01-standards-review.md`, `/private/tmp/ticket01-repair2-standards-review.md` and `/private/tmp/ticket01-spec-luna-review.md`.

Verification covered Node 22 on macOS arm64 only. Node 24, Linux, Windows, unusual filename/newline behavior and the broader platform matrix remain unverified. History/range and shallow-repository semantics, explicit base/filter/explain flags, TypeScript/Vue/CSS extraction, package/config resolution, later CLI output features, the Ticket 07 app and npm publication remain assigned to later tickets or separate release work. The manual QA run did not repeat the automated suites.

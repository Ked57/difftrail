# Ticket 02 verification

Status: **complete** on integration branch `codex/difftrail-cli`, merge commit [`cb5a9ad`](https://github.com/Ked57/difftrail/commit/cb5a9ade3cf7e0174e45cad1b34f6c31f7f864b0). The reviewed ticket branch was `codex/ticket-02-history` at [`003ec59`](https://github.com/Ked57/difftrail/commit/003ec59e58600f03da4912d4e90d5f6518835441), based on the completed Ticket 01 integration.

## Automated gate

The implementation reported a passing `pnpm verify:full` run at `003ec59`. It covered formatting, ESLint and the mandatory Difficulty audit, strict typecheck, unit tests, the built-CLI real-Git integration suite, isolated tarball install/executable/parser checks, and Knip. The handoff records 9 unit tests and 26 CLI integration cases passing. The final verification and review jobs did not rerun the full gate. The mutation experiment was a targeted manual check of the independent-endpoint traversal test, not a mutation-suite run.

## Manual CLI QA

Independent executed QA returned **PASS** on a fresh packed install built from `003ec59`. The final installed executable SHA-256 (`18f728a1ed69c15209e1b1ba9d45a02e16aaf85bcaef244af86ca27bb68c907e`) matched the fresh build. The isolated npm consumer returned version `0.1.0`; the runtime was Node 22.23.1 on macOS arm64.

The broad history matrix was run against the initial pinned artifact at `88808fd`, and covered root and subdirectory behavior, endpoint and merge-base semantics, first-parent merge selection, reverted changes, deletion and rename seeds, shallow histories, dirty checkout preservation, snapshot cleanup and malformed source. That run exposed an invalid-reference diagnostic defect. After repair, the final artifact received focused retests for invalid base and head refs, a valid comparison, subdirectory invocation, dirty-state preservation, analysis-failure cleanup, and unavailable shallow first-parent handling. Both invalid-reference cases returned status 1 with empty stdout and stderr naming the endpoint role and requested ref, retaining Git's cause and giving an availability hint. The final report distinguishes initial-artifact observations from repaired-artifact retests; the entire broad matrix was not repeated after repair.

Raw observations and scenario drivers are retained under `/private/tmp/ticket02-manual-qa-luna/`; the combined executed report is `/private/tmp/ticket02-manual-qa-luna.md`. Browser, app, and HTTP checks do not apply because this ticket changes a CLI surface only.

## Reviews

The final standards review at `003ec59` found no actionable issues. The final specification re-review confirmed the prior findings were resolved: real Git histories exercise dependency cycles and independent endpoint traversal; the cross-endpoint trap fails under a temporary union-graph mutation; an operational blob-read failure checks snapshot cleanup; dirty checkout tests compare the bytes of modified tracked, staged, and untracked files as well as index, refs, config, and status; invalid base/head diagnostics identify the requested endpoint and ref. The review reports are retained at `/private/tmp/ticket02-standards-review.md` and `/private/tmp/ticket02-spec-review.md`.

## Limits

Executed runtime evidence covers Node 22 on macOS arm64 only. Linux, Windows, and Node 24 were not exercised. The final artifact received focused retests rather than a repeat of the full history matrix. The current analyzer remains JavaScript/CommonJS-only; Vue, TypeScript success behavior, later alias/configuration resolution, filters, NUL output, explanations, unusual line breaks, the example app, and npm publication remain outside this ticket or assigned to later work. The QA report does not claim manual explanation-chain inspection; that behavior belongs to Ticket 06.

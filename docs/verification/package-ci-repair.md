# Package CI repair verification

Status: **local and Ubuntu CI verification passed; Windows remains unverified**.
The repair commit is
[`07e3c3c`](https://github.com/Ked57/difftrail/commit/07e3c3c0a68c32720a3eea396d1bb2d51ca7d79).

## Failure and repair

Draft PR #21's push run [38745046957, job
116456391032](https://github.com/Ked57/difftrail/actions/runs/38745046957/job/116456391032)
and pull-request run [38745054034, job
116456413927](https://github.com/Ked57/difftrail/actions/runs/38745054034/job/116456413927)
were separate events on `ubuntu-latest` against base commit
`ef680a580e29801174ad8a6dcd05397a6e10e3e7`. Both
passed fast checks and 30 CLI integration tests, then the packed pnpm consumer
failed because offline mode could not find metadata for
`dependency-cruiser@18.6.0` (`ERR_PNPM_NO_OFFLINE_META`). These runs document the
original failure; they do not verify the repair.

Commit `07e3c3c` changes the fixture install to `--prefer-offline`, which uses
cached package data and permits pnpm to fetch missing metadata on a cold
runner. The packed tarball install, CLI and parser smoke checks, config-alias
scenario, and output assertions remain enabled.

## Automated verification

At the repair commit, local macOS verification with Node `v22.23.1` and pnpm
`10.34.7` passed `pnpm verify:full`: formatting, lint and difficulty audit,
type checking, 22 unit tests, build, 30 CLI integration tests, packed npm and
pnpm consumer checks, and Knip. A separate `pnpm test:package` run used a newly
created pnpm store at `/private/tmp/difftrail-pnpm-cold-20261015` and passed.
The separately packed artifact SHA-256 was
`293db3ab4593cb284cef695716f26b3a3e431b445c3e021278442a8640829b7c`.

## Reviews and manual QA

Standards and specification reviews passed with no findings. Manual QA passed
the package fixture against newly created npm and pnpm caches, then installed
the packed tarball into a separate pnpm consumer and ran its installed CLI on a
config-alias change. The CLI printed exactly `base.json`,
`packages/a/src/alternate/value.ts`, `packages/a/src/consumer.ts`, and
`packages/a/src/current/value.ts`, one path per line. Full reports are retained
at `/private/tmp/package-ci-standards-review.md`,
`/private/tmp/package-ci-spec-review.md`, and
`/private/tmp/package-ci-manual-qa-luna.md`.

## Fresh GitHub CI

The integrated commit
[`4e52dd1`](https://github.com/Ked57/difftrail/commit/4e52dd168a8a5379e90094d725bfb1c10485b913)
passed `pnpm verify:full` on Ubuntu in both the
[push run 38748003731](https://github.com/Ked57/difftrail/actions/runs/38748003731)
and [pull-request run 38748016338](https://github.com/Ked57/difftrail/actions/runs/38748016338).
Each run passed the required quality job; each skipped the manual-only mutation
job. These are two trigger events for the same Ubuntu workflow, not separate
platform results. The workflow defines only `ubuntu-latest`.

## Limits

The two historical Ubuntu failures above predate the repair. Fresh Ubuntu CI
passed as recorded above. Windows and macOS CI have no runner in the current
workflow and remain unverified; Node 24 is also unverified. Local evidence
covers macOS with Node 22.23.1. This is a package-fixture change and does not
add a new Difftrail runtime network path; network access is used only when pnpm
installs the test consumer's dependencies.

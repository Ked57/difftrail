# Package CI fixture repair

## Failure

Draft PR #21 was at `ef680a580e29801174ad8a6dcd05397a6e10e3e7` when both
quality jobs failed on 2026-10-15. The failed jobs were Linux run
[38745046957 / job 116456391032](https://github.com/Ked57/difftrail/actions/runs/38745046957/job/116456391032)
and Windows run
[38745054034 / job 116456413927](https://github.com/Ked57/difftrail/actions/runs/38745054034/job/116456413927).
Both passed the fast checks and the 30 CLI integration tests, then failed in
`tools/test-package.mjs` while installing the packed CLI into its pnpm
consumer:

```text
pnpm install --offline --ignore-scripts failed
ERR_PNPM_NO_OFFLINE_META Failed to resolve dependency-cruiser@18.6.0
```

## Cause and repair

The fixture's `--offline` flag required every registry metadata record to have
been cached before the job started. GitHub's fresh Linux and Windows runners
had the package tarballs needed by the fixture but lacked pnpm's metadata record
for `dependency-cruiser@18.6.0`. This was a fixture setup failure, not a package
resolution or CLI assertion failure.

The pnpm consumer install now uses `--prefer-offline --ignore-scripts`. Pnpm
uses cached package data when available and can obtain missing registry metadata
on a cold runner. The isolated tarball install, strict pnpm consumer, parser
smoke, config-alias scenario, and CLI output assertions remain in place. The
existing isolated npm consumer also remains unchanged.

## Verification

Commands and observed results on macOS, Node `v22.23.1`, at base commit
`ef680a580e29801174ad8a6dcd05397a6e10e3e7`:

| Command                                                                            | Result                                                                                                                                              |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gh pr checks 21 --repo Ked57/difftrail --watch=false`                             | Confirmed both quality jobs failed.                                                                                                                 |
| `gh run view 38745046957 --repo Ked57/difftrail --log-failed`                      | Reproduced the `ERR_PNPM_NO_OFFLINE_META` failure on Linux.                                                                                         |
| `gh run view 38745054034 --repo Ked57/difftrail --log-failed`                      | Reproduced the same failure on Windows.                                                                                                             |
| `npm_config_store_dir=/private/tmp/difftrail-pnpm-cold-20261015 pnpm test:package` | Passed using a fresh pnpm store; pnpm resolved the missing metadata and the packed CLI, alias, and parser assertions passed.                        |
| `pnpm verify:full`                                                                 | Passed formatting, lint and difficulty audit, typecheck, 22 unit tests, build, 30 CLI integration tests, packed npm/pnpm consumer checks, and Knip. |

The separately packed `difftrail-0.1.0.tgz` has SHA-256
`293db3ab4593cb284cef695716f26b3a3e431b445c3e021278442a8640829b7c`.

The two CI runs were at base commit
`ef680a580e29801174ad8a6dcd05397a6e10e3e7`; they do not verify this repair.
CI has not been rerun on the repair because the implementation commit has not
been pushed. No CI-green claim is made here.

## Limits

The cold-store fallback and full quality gate were run locally on macOS with
Node 22.23.1. This verifies registry fallback in this environment and the
repository's full local gate. Linux and Windows remain unverified on the repair
until CI reruns against its commit; this change does not add any new CLI runtime
behavior.

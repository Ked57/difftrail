# pnpm ancestor-provider repair verification

Status: **verified and merged** into `codex/difftrail-cli` at
[`d1ee50d`](https://github.com/Ked57/difftrail/commit/d1ee50dbd969a6bf4c8fce6a96179ca07b1103d7).
The source pin is `52cef820f09a449ec05d48574c3eadb8822b8296`, merged without
rewriting its history. This is an analyzer repair alongside Ticket 06; it does
not change the implementation tracker count or close a ticket.

## Failure and repair

The original provider lookup used only the nearest package manifest. A nested
source importing a dependency declared at the repository root therefore failed
under a normal pnpm install, which creates the root alias without an app-local
alias. The repair searches committed ancestor manifests from nearest to farthest,
selects the nearest declaration, and validates that provider's lock entry and
installed identity. A nearer declaration must pass its own checks and cannot
fall back to a different root version. Metadata edges point to the selected
provider manifest and lockfile.

Package-based TypeScript `extends` uses the same evidence checks. Its config host
reads only tracked snapshot paths and validated installed package roots; an
absolute include outside those roots returns an analysis gap without partial
stdout. The implementation rationale and regression seams are described in
[the implementation note](../implementation/pnpm-ancestor-provider-repair.md).

## Review evidence

- **Standards:** no hard violations. The final review accepted modest fixture
  setup duplication as a minor judgment call; no unrelated refactor was needed.
- **Specification:** final review found no residual findings. Its initial
  unbounded `readDirectory` finding was resolved by the host-boundary pin.
- **Host diagnosis:** the follow-up confirmed the exact config-parse path uses
  `readDirectory`; the reviewed `getDirectories` concern is unreachable on this
  path. The diagnosis could not independently run Vitest because Vite could not
  write `.vite-temp` (`EPERM`); runtime evidence below came from the implementer
  and packed CLI QA.

Reports are retained outside the repository. SHA-256 values identify their exact
contents:

| Evidence                                                                | Artifact                                                  | SHA-256                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Standards reviews, including final host-boundary review                 | `/private/tmp/ancestor-provider-standards-review-luna.md` | `31c61c8aad770de8c858e814b07abb283e2cab8ae8824b776995b8baee328cff` |
| Final specification review                                              | `/private/tmp/ancestor-provider-spec-review-luna.md`      | `e1f66b85677f8841e376716a6e8f22bab6febf40e693031f3fa1aab4d6fe01d1` |
| Packed CLI manual QA, including original failure and successful retests | `/private/tmp/ancestor-provider-manual-qa-luna.md`        | `d201f27a3cb56070320f778885b3fa36d19e32c6e3f6b8d46cf64cad1815e794` |
| Config-host boundary diagnosis                                          | `/private/tmp/config-host-diagnosis-luna.md`              | `536675c85b106d5f9474ecac14bc33ddf25041cd08390c730e0e6eda36a81551` |

## Automated and packed CLI evidence

`pnpm verify:full` passed on the final source pin: 58 unit tests, 39 CLI
integration tests, package smoke, pnpm packed-consumer checks, Knip, and the
repository's format, lint, type, and static checks. This integration was a clean
merge of that exact pin, so the local full gate was not redundantly rerun.
Mutation testing was skipped and is not claimed as passing.

Manual QA built and packed the pinned CLI, then installed it into fresh pnpm
consumers with scripts disabled. The final tarball SHA-256 was
`7dfdca64640d4680b9d3c83e8be982f6aaa5e6d58e5dca69b391b11d07242d81`; bundled
`dist/cli.js` SHA-256 was
`fa4b3bfd252c6cd0e93cc3ad10f43709819b6875501f5fd6f0e27a22399d61f0`. On
macOS, Node `22.23.1`, and pnpm `10.34.7`, the packed CLI passed the ordinary
root-only provider and inherited external-config scenarios, provider manifest
and lock impact checks, and safe snapshot-relative include. Missing or wrong
provider evidence and an absolute include outside the snapshot were rejected
with an analysis gap and zero stdout. Earlier packed runs exposed the inherited
config failure and then verified its repair; the final pin passed the added
host-boundary scenarios.

## Limits and CI

The executed manual matrix covers macOS with pnpm's current isolated layout.
Custom virtual-store settings, peer-context variants, npm ancestor layouts,
Linux, Windows, Node 24, and Ticket 07's separate app history remain unverified
by manual QA. The implementation branch's local full gate is not platform
evidence. Fresh Ubuntu push and PR workflow results are recorded below after
they complete; skipped mutation jobs remain skipped.

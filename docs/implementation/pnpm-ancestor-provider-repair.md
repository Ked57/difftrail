# pnpm ancestor-provider evidence repair

## Root cause

Difftrail associated every external import with the nearest committed package
manifest. That misses ordinary Node resolution when a workspace package imports
a development tool declared only by the repository root, such as test files
importing root-only `vitest`. A normal pnpm install links that root dependency
under root `node_modules`; it does not create an app-local link. Treating the
nearest manifest as the only possible provider therefore reported a false
missing-lock declaration before resolution could follow Node's ancestor lookup.

## Resolution model

For each external request in a committed source file, the analyzer walks the
source directory's committed package manifests from nearest to farthest and
selects the closest manifest that declares that dependency. It validates the
selected importer's committed lock declaration and its installed package link
and identity, then adds evidence edges to that provider manifest and lockfile.
The source remains the requesting consumer, while the provider manifest owns
the dependency declaration and installed alias.

If the nearest consumer manifest declares the dependency, it remains the
provider and must pass its own lock and installed-identity checks. A failing
local declaration cannot borrow a different root version. If no ancestor
declares the request, the analyzer reports a gap with the requesting source and
nearest manifest. Existing committed-versus-installed lock checks and history
endpoint checks remain strict. Difftrail does not install packages, fetch from
registries, or run project scripts.

## Regression seams

The analyzer fixture proves a root-only dependency for a nested source and
checks that graph metadata points to the root manifest and lock. Negative cases
remove the root link or mismatch its installed package identity. A separate
case declares a different version in the nearest workspace manifest while the
root provider remains valid; it must fail against the nearest importer's
evidence rather than silently use the root package.

The built CLI fixture creates a minimal pnpm v9 workspace lock, performs a
standard frozen pnpm install with scripts disabled, and confirms the root link
exists while the app-local link does not. It checks successful analysis,
missing and mismatched root-provider evidence, and rejection of a wrong
nearest-declared package identity. That last case uses a source-only history
change after install so both history endpoints share the same committed
manifest and lock; this isolates importer identity validation without relaxing
the independent historical lock comparison.

## Limits

The fixtures cover root-to-workspace ancestor lookup with pnpm 10 and the
repository's current isolated layout. They do not expand custom virtual-store
settings, peer-context variants, npm ancestor installs, or other package
manager layouts. Existing evidence rules remain responsible for those cases.

## Checks

`pnpm verify:full` is required for this analyzer and CLI change. Focused
analyzer and built CLI results are recorded in the final repair pin.

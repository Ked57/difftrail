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

Package-based TypeScript `extends` clauses are statically read from committed
JSONC configuration chains before the TypeScript config parser runs. Their
package requests use the same ancestor provider validation. Config parsing may
read files only beneath those validated installed package roots; other
untracked files remain unavailable. The source receives metadata edges to the
provider manifest and lock, and configuration edges to the tracked config files
that compose the chain. Directory enumeration is driven by tracked snapshot
paths or the validated package roots. TypeScript may probe only the exact
validated package aliases and their virtual parent directories; host
`readDirectory`, `directoryExists`, and `realpath` calls cannot inspect other
filesystem locations. An absolute or escaping config include fails with a
source, config path, and revision gap instead of reading host files.

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

A second CLI fixture performs a standard frozen pnpm install with root-only
`@tsconfig/node22`. Its app config inherits a tracked root config, while the
source imports only a builtin and a local file. It checks successful parsing,
missing provider-link rejection, and wrong installed config-package identity,
including source, tracked config, provider manifest, lock, and revision context.
An additional built-CLI fixture points a committed include at an untracked
absolute temporary directory and requires an actionable failure with zero
stdout; a safe tracked include and inherited provider config remain successful.

## Limits

The fixtures cover root-to-workspace ancestor lookup with pnpm 10 and the
repository's current isolated layout. They do not expand custom virtual-store
settings, peer-context variants, npm ancestor installs, or other package
manager layouts. Existing evidence rules remain responsible for those cases.

## Checks

`pnpm verify:full` passed on 2026-10-15: formatting, lint and difficulty audit,
typecheck, 56 unit tests, 37 integration tests, package smoke, and Knip. The
focused built CLI workspace fixture also passed with an ordinary frozen pnpm
install. The latest integration docs tip was merged after this gate; that merge
changed documentation only.

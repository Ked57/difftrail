# pnpm workspace external-resolution repair

## Root cause

External evidence already compared the selected snapshot's pnpm lock to the
installed virtual-store lock and checked the selected workspace importer's
manifest declaration. It then looked for the installed package under the
repository root `node_modules/<name>`. With pnpm's normal isolated layout, a
workspace package's direct dependency is linked under that package's own
`node_modules`, so the evidence read failed before source resolution. A single
synthetic root link would also be wrong when two importers install different
versions of the same package.

## Resolution model

For each committed source, the analyzer selects its nearest committed package
manifest. pnpm's matching importer entry must declare the source's dependency,
and the installed alias at that manifest directory must resolve to a package
whose identity matches the lock entry. The analyzer places a temporary link at
the same package-relative location inside the selected snapshot, pointing to
that importer's proven installed package. This lets the source resolver follow
the same consumer relationship while keeping separate importer versions
separate. npm's existing root-install evidence path is unchanged.

For pnpm `npm:` package aliases, the importer key remains the declared alias;
the resolved lock version supplies the installed package name and version.
Missing importer links, mismatched package identity, or mismatched installed
lock metadata remain analysis gaps. Importer validation failures name the
requiring source and package manifest; global lock evidence failures retain
their lock-level context. No install, fetch, or project script is run by
Difftrail.

## Regression seams

The analyzer fixture checks two workspace importers with different installed
versions of the same dependency name, plus a third importer using an `npm:`
alias. It checks the exact manifest and lock metadata edges, then removes an
importer link and points another importer at the wrong package identity to
verify both conditions fail with a gap. This does not exercise packaging or an
actual package-manager install. It also requires missing-link, wrong-identity,
and manifest/lock mismatch diagnostics to identify the requiring source and
importer manifest.

The built CLI fixture generates and commits a minimal pnpm v9 lock for two
versions of one app-only dependency and a third app-only `npm:` alias. It
performs a frozen workspace install with scripts disabled and verifies that
pnpm placed dependencies under the app importers without a root package link.
It then changes source in all three apps and runs the built CLI against the
committed history. Finally, it replaces one installed package with the other
app's version and verifies failure with no partial stdout.
The fixture setup uses `--prefer-offline` so a cold environment may retrieve
locked packages; CLI analysis itself does not install or access the network.

The fixture covers importer-specific direct dependencies and one pnpm `npm:`
alias on the current host. Other pnpm versions, peer-context variants, custom
virtual-store layouts, npm nested-install layouts, and operating systems still
depend on their existing compatibility evidence and are not expanded by this
repair.

## Checks

`pnpm verify:full` passed on 2026-10-15 after combining with the latest reviewed
integration branch: formatting, lint and difficulty audit, typecheck, 52 unit
tests, 36 integration tests, isolated npm and pnpm package checks, and Knip.
The normal-install CLI regression was also run independently while developing
the fix; it failed with the root `node_modules/chalk` ENOENT under the previous
lookup and passed with importer-scoped evidence.

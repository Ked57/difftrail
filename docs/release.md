# Release rehearsal

Difftrail supports Git on macOS, Linux, and Windows with Node `^22.18.0 ||
^24.11.0`. The CLI and workspace declare the same range. Babel 8 in the locked
development toolchain sets these minimums; CI runs both minimum versions and
the current Node 22 and 24 releases on all three operating systems. Node 22 and
24 are LTS lines in the [Node.js release schedule](https://nodejs.org/en/about/previous-releases/).

Before preparing a release candidate, use a clean checkout and run:

```sh
pnpm install --frozen-lockfile
pnpm verify:full
pnpm test:mutation:domain
pnpm test:package
```

The package test builds the CLI, packs it, checks the published file set and
metadata, and installs the tarball into isolated npm and pnpm consumers. It
also verifies the executable and parser dependencies with consumer packages
that install conflicting parser versions. The CI workflow supplies executed
macOS/Linux/Windows and Node minimum/current evidence; a configured matrix is
not itself a passing result.

Check that the registry name remains available before preparing a release:

```sh
npm view difftrail name version --json
```

On 2026-10-16 this read-only query returned `E404` for `difftrail`. That result
is time-sensitive and does not reserve the name or prove an account can publish
it. Recheck registry ownership and package access when publication is approved.

The release rehearsal does not publish the package or merge the integration
pull request. Those actions remain separate release decisions.

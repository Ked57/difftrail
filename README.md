# Difftrail

Find repository files impacted by committed changes through static reverse dependencies. Difftrail selects files; consuming projects keep their mandatory checks.

This Turborepo contains private `core`, `git`, and `analyzer` modules, the distributable `difftrail` CLI, a runnable Vue test app, and a reserved boundary for a future documentation site. Read [the implementation tracker](docs/plans/implementation-tracker.md) for delivery evidence.

```sh
corepack pnpm install --frozen-lockfile
pnpm verify:full
pnpm --filter difftrail pack --pack-destination .
node packages/cli/dist/cli.js --help
```

Use Node 22.18+ or Node 24.11+ and pnpm 10.34.7. The CLI package declares the same supported Node lines. See [CLI usage](packages/cli/README.md), [release rehearsal](docs/release.md), [standards](CODING_STANDARDS.md), and [terminology](GLOSSARY.md).

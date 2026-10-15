# Difftrail

Find repository files impacted by committed changes through static reverse dependencies. Difftrail selects files; consuming projects keep their mandatory checks.

This Turborepo contains private `core`, `git`, and `analyzer` modules, the distributable `difftrail` CLI, a reserved Vue test-app workspace (Ticket 07), and a future documentation-site boundary. Read [the approved implementation tracker](docs/plans/implementation-tracker.md) for the remaining delivery scope.

```sh
corepack pnpm install --frozen-lockfile
pnpm verify:full
pnpm --filter difftrail pack --pack-destination .
node packages/cli/dist/cli.js --help
```

Use Node 22.13+ or Node 24 and pnpm 10.34.7. [CLI usage and current scope](packages/cli/README.md), [standards](CODING_STANDARDS.md), and [terminology](GLOSSARY.md) describe the interface. Current Ticket 01 implements latest-commit JavaScript impact with isolated committed snapshots, exact text/JSON output, and fatal detected gaps. Following tickets add full history, resolvers, TypeScript/Vue/assets, filters, explanations and the runnable app.

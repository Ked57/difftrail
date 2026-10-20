# Difftrail Effect API

Bun, Elysia, and Effect serve the same dashboard domain as the Vue example: health, report metrics, and a settings email check.

From this directory, with Bun installed:

```sh
bun src/index.ts
```

That listens on port 3000. Tests do not start that process.

Vitest runs the suite on Node:

```sh
pnpm test
```

`pnpm test:affected` asks the built Difftrail CLI for impacted `*.test.ts` and `*.e2e.ts` files and prints only those paths. When the selection is not empty it runs that Vitest subset. An empty selection does not start Vitest. Difftrail does not execute the server. End-to-end tests call `app.handle` and do not bind a port.

`pnpm smoke` imports the app with `bun --bun -e` when `bun` is on `PATH`, still without listening. It skips when Bun is absent.

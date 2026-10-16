# Issue 23 implementation evidence

## Change

Alias resolution now prefers TypeScript's effective parsed `baseUrl` for both source imports and explicit Vue/CSS local references. When no `baseUrl` exists, resolution still uses `pathsBasePath`, preserving existing aliases and inherited-path behavior. This also retains the declaring config's resolved base when a consumer extends that config.

## Regression evidence

- Before the fix, real-source extraction failed on an aliased Vue image (`cannot resolve required local reference @/image.svg`) and on an inherited explicit-base source import (`cannot resolve @/value`).
- After the fix, extractor tests assert literal source and asset edges, original specifiers, and configuration provenance for a direct explicit base and an inherited explicit base. Existing suites retain inherited aliases without `baseUrl` and asset aliases without `baseUrl`.
- Built CLI histories assert exact changed source and asset results, literal endpoint explanation chains, and exclusion of same-named configuration-directory decoys when those decoys alone change.
- A config-only `baseUrl` change asserts the union uses each endpoint's own mapping and reports the config-to-consumer explanation from the head graph.
- The packed npm and strict pnpm consumer checks both run a real explicit-`baseUrl` provider-change history through the installed executable.

## Validation

- `pnpm install --frozen-lockfile` — passed with pnpm 10.34.7 via Corepack.
- `pnpm verify:fast` — passed: formatting, lint and difficulty audit, typecheck, 75 unit tests, and 100% measured pure-core coverage.
- `pnpm verify:full` — passed: fast gate, build, 52 built-CLI integration tests, nine isolated example histories, packed npm and strict pnpm consumer checks, and Knip.
- Narrow regression runs after the final decoy control — extractor and built-CLI issue tests passed.

## Separate follow-up

The independent code review and installed-CLI manual QA are separate jobs and have not been performed in this implementation worktree. Runtime/platform evidence is Node 24.13.1 on Linux; Windows and other supported runtimes were not run here.

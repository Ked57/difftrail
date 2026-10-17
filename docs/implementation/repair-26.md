# Repair 26: auto-import shorthand values

The analyzer now resolves the value symbol of an object shorthand before deciding whether a name is an auto-import. It checks each Vue script as its own module so a local binding in one component cannot shadow an unbound auto-import in another. These changes retain configured and generated-metadata provider edges for genuine shorthand value reads while honoring local variables, parameters, imports, and unrelated explicit property names.

## Evidence

- **Extractor seam:** `packages/analyzer/src/repair-26.test.ts` uses committed JS, TS, ordinary Vue, and setup Vue sources, generated declarations, and inline mappings. It catches missing provider, metadata, and configuration edges, real shadowing (including ordinary/setup Vue-local bindings), cross-component scope leaks, and endpoint ownership. It does not exercise Git CLI output or package installation.
- **Built CLI seam:** `tests/repair-26.test.ts` uses a committed Git history and asserts the full JSON result for a utility-only change. Before the fix, it returned the utility and direct-call consumer but omitted `src/pages/shorthand.ts`; after the fix it returns exactly `src/composables/usePrice.ts`, `src/pages/direct.ts`, and `src/pages/shorthand.ts`. It does not prove installed-package isolation.
- **Packed consumer seam:** `tools/test-package.mjs` exercises a shorthand provider history through the isolated npm tarball install, where runtime dependencies come from the consumer installation. It catches packaging and installed executable integration, but does not exercise every supported runtime or operating system.

Generated-metadata-only and inline-configuration-only history tests assert distinct base and head provider edges and complete impact sets. The extractor controls assert no mapping edge for a local declaration, parameter, import, or `{ usePrice: 1 }` property.

## Red and green

- `pnpm exec vitest run packages/analyzer/src/repair-26.test.ts` initially reported no auto-import provider edges for the four shorthand consumers; it passed after the fix.
- `pnpm exec vitest run --config vitest.integration.config.ts tests/repair-26.test.ts` initially returned a successful CLI status with the shorthand consumer missing from the exact result; it passed after the fix.
- Adding local `usePrice` bindings to ordinary and setup Vue scripts made the extractor regression red again: the shared checker treated an SFC script binding as global and suppressed every matching shorthand consumer. Marking each virtual SFC script as a module restored local scope; the regression passed with both shadow controls and unbound consumers present.
- `pnpm test:package` passed after updating the config-history expected set to include the actual shorthand and direct-call consumers.

## Verification

- `pnpm verify:fast` passed: format, lint, typecheck, 76 unit tests, and 100% configured coverage.
- `pnpm test:integration` passed: 50 integration tests and all 9 example histories.
- `pnpm test:package` passed: isolated npm and strict pnpm tarball checks, including the shorthand history.
- `pnpm verify:full` passed after the final Vue scope regression, packed-fixture expectation, and documentation updates.

Independent review and installed direct-invocation manual QA are handled separately by the parent task. No cross-platform run was performed in this worktree.

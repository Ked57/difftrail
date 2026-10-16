# Repair 25: Vue `createRequire` parity

## Change

Vue script extraction now keeps the names of recognized direct `createRequire(import.meta.url)` loaders so the existing resolver treats their literal calls as required static dependencies. The Vue parser applies the same factory provenance and base checks as standalone source analysis. A renamed loader resolves from the owning Vue component directory; unsupported bases and indirect factory values stop analysis with a gap.

## Regression evidence

- **Red:** the new extractor test returned no relationship for `nested/Widget.vue` → `nested/provider.cjs` even though the component called its renamed loader with `./provider.cjs`.
- **Green:** the extractor returned that edge from the nested component directory and excluded the same-named root provider. Additional extractor cases cover ordinary script and TypeScript script-setup blocks, named import aliases, namespace/default member access, direct CommonJS acquisition, ordinary helper controls, unrelated bases, indirect factory values, missing targets and nonliteral loader dependencies.
- **Built CLI:** real Git histories verify the exact impacted set (`Page.vue`, `nested/Widget.vue`, `nested/provider.cjs`), zero stdout and exit 1 for a filtered head gap, and zero stdout and exit 1 when the base has a gap that the head repairs.
- **Packed CLI:** isolated npm and pnpm tarball consumers verify renamed-loader success and unsupported-base failure with the bundled executable and installed parser dependencies.

## Verification

- Environment: Linux, Node v24.13.1, pnpm 10.34.7.
- `pnpm install --frozen-lockfile`: passed.
- `pnpm verify:fast`: passed (format check, ESLint and difficulty audit, TypeScript and Vue type checks, 82 unit tests; 100% pure-core coverage).
- `pnpm test:integration`: passed (52 real-Git CLI tests and nine isolated example histories).
- `pnpm test:package`: passed (isolated npm and pnpm installs; packed CLI scenarios included).
- `pnpm knip`: passed.
- Separate installed-executable manual QA: delegated to the parent job; result pending. Required independent scenarios include decoy selection, bad base, indirect factory, base-only gap despite filtering, and ordinary-helper control.

## Remaining coverage limits

The CLI regression checks endpoint gap handling, while the packed test checks the installed success and unsupported-base paths. Independent manual QA must still record actual installed-executable results for each required scenario. Other operating systems and Node 22 were not run in this worktree.

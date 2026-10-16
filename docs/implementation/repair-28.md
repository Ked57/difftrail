# Issue 28: scope auto-import evidence to its configuration

## Change

Auto-import and Vue component mappings now apply to consumers under the directory
of their originating configuration. Repository-root configurations still apply
to all descendants. Generated declaration mappings use the configuring call's
scope even when the declaration file is stored elsewhere. When TypeScript merges
same-name generated globals, the consumer resolves against all applicable mapping
evidence rather than whichever declaration TypeScript returns first. Conflicting
applicable targets remain analysis gaps, while equivalent targets retain the
configuration and metadata provenance that supplied them.

## Regression evidence

The extractor seam uses committed snapshots and real TypeScript/Vue parsers. It
catches directory applicability, generated declaration ownership and provenance,
component mappings, equivalent-target evidence, and overlapping ambiguity. It
does not establish Git seed selection or process output.

The built-CLI Git seam catches exact returned and removed paths, sibling
exclusion, and CLI status/output for symmetric app A and app B provider changes
and app-local config changes. It does not exercise the installed package.

Before the fix, the direct mapping extractor regression failed with:

```text
Analysis gap in apps/a/page.ts: auto-import mapping for useValue is ambiguous
```

The generated declaration regression also failed because TypeScript selected
app A's same-name global for app B, leaving no `apps/b/page.ts` →
`apps/b/useValue.ts` edge. After the fix, the extractor asserts both app-owned
edges and both app-owned generated Vue component edges, while declarations live
under the shared repository `types/` directory.

The built CLI regression now returns, for either app's provider-only change,
exactly that app's page and provider, with `removed: []`. An app-local config-only
change returns exactly its page and config. No sibling app path is returned.
Existing package coverage for ESM and CommonJS workspace export conditions now
uses a root auto-import config so those paths remain within applicable scope.

The packed-consumer check installs the tarball in an isolated npm consumer and
runs its executable on a sibling-app Git history. Changing app A's provider
returns exactly `apps/a/page.ts` and `apps/a/useValue.ts`.

## Verification

- `pnpm install --frozen-lockfile` (via Corepack's pinned pnpm 10.34.7): passed.
- `pnpm verify:fast`: passed; 78 unit tests, lint, formatting, typecheck, and
  function-difficulty audit.
- `pnpm test:package`: passed, including isolated npm and strict pnpm tarball
  consumers and the sibling-app history.
- `pnpm verify:full`: passed after correcting fixture lock metadata and
  restoring runtime-condition coverage through an applicable root config;
  includes 78 unit tests, 51 built-CLI tests, nine example histories, isolated
  npm/pnpm tarball checks, and Knip.

Environment: Linux, Node 24.13.1, pnpm 10.34.7.

## Remaining evidence

Independent code review and installed-CLI manual QA remain assigned to separate
jobs. Manual QA should exercise sibling isolation and a genuinely overlapping
root/app ambiguity. Other platforms are unverified.

## Canonical-root fixture correction

The first macOS and Windows CI runs exposed a test expectation that used the
fixture's temporary-path alias rather than its canonical absolute path. The CLI
returned the correct impacted sets and canonical root. The same mismatch was
reproduced on Linux by setting `TMPDIR` to a symbolic link: both sibling-history
tests failed before the correction and passed after the expected root used
`realpath(repo.root)`. Both exact JSON assertions remain in place. No production
code or output contract changed in this follow-up.

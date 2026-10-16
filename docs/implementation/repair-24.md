# Issue #24 implementation

Configured nonrelative imports could be attributed to the real file returned by
the resolver, losing the tracked source link named by the alias. The analyzer
now resolves configured imports with TypeScript's module resolver, using the
importing source's snapshot tsconfig with symlink preservation enabled, and
uses that exact tracked link as the dependency when it is a source symlink.
The existing endpoint symlink edge then retains each snapshot's own target and
any tracked link chain. No identity is inferred from shared realpaths.

The extractor regression first failed because `consumer.ts` pointed to
`first.ts`; it now points to `selected.ts` in both endpoint graphs, while each
endpoint retains its own `selected.ts` target. Built CLI histories cover exact
retarget and referent impact sets, shortest explanations through the selected
link, and a same-target unimported sibling control. The packed npm and strict
pnpm consumer check exercises the same alias retarget case on symlink-capable
hosts. The package check probes symlink creation on Windows and reports when the
runner's permissions prevent that case.

On Linux with Node 24.13.1, `pnpm verify:fast` passed formatting, lint and
difficulty audits, both TypeScript checks, and all 74 unit tests. `pnpm
verify:full` passed those checks plus the build, 50 built-CLI integration tests,
nine example histories, isolated npm and pnpm tarball checks (including the
aliased-link case), and Knip. The issue's separate installed-CLI manual QA and
independent review are handled by the parent integration task.

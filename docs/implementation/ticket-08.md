# Ticket 08 implementation

Status: implementation merged into `codex/difftrail-cli` at
`fd29b23ddadc629e1afb2683366321ba2206ba7a`, including reviewed release pin
`07679254b837fdf127681a59cfb7561e64aecea4` and reviewed test-only package
harness repair `8786aa6134cba57600aa72eb87f855e25052931d`. Final acceptance
status is maintained in the [Ticket 20 release-validation
comment](https://github.com/Ked57/difftrail/issues/20#issuecomment-6215990357)
and the linked PR checks.

## Changes

- Align workspace and published CLI Node engines at `^22.18.0 || ^24.11.0`,
  matching the Babel 8 floor in the locked development toolchain.
- Expand the quality workflow to execute the full gate on macOS, Linux, and
  Windows, at both minimum engine versions and the current Node 22/24 releases.
- Strengthen packed-consumer assertions for the engine range and exact npm
  file allowlist. Keep the existing isolated conflicting-parser consumer
  checks.
- Replace stale pre-Ticket-07 root README scope and document the release
  rehearsal and current registry-name check.
- Keep tracked Git symlink paths as seeds. Opaque links remain terminal without
  reading their targets; analyzable aliases resolve only through contained,
  tracked relative chains in the isolated endpoint snapshot. Submodule entries
  produce a separate no-fetch diagnostic.
- Final PR #21 repair candidate `51858005eb7cf0666578030febaa9f7a91c2345e`
  includes the Bugbot fixes for template-visible local Vue components and mapped
  components in committed external HTML templates. It also narrows Options API
  registration recognition to direct option objects or a `defineComponent`
  value imported from `vue`, following the Spec P2 on the prior candidate
  `6bce24e5a06b69d7bc06121da28ae6e4b670caa7`. The updated focused analyzer
  regressions and `pnpm verify:fast` passed with 67 unit tests. Standards review
  accepted `6bce24e`; review of `5185800`, installed-package QA, and CI results
  are pending.

## Evidence

- Red: `pnpm test:package` failed on the published engine metadata, which still
  declared `^22.13.0 || ^24.0.0`.
- Green: `pnpm test:package` passed after the manifests were aligned; it built
  and installed the tarball with npm and pnpm, ran the CLI, and exercised the
  packed parser dependencies against conflicting consumer parsers.
- Read-only `npm view difftrail name version --json` returned E404 on
  2026-10-16. This does not reserve the name.
- The initial remote OS/runtime matrix found that Windows checkout line
  endings made Prettier report every text file as unformatted before later
  gates ran. The follow-up `.gitattributes` repair sets LF for detected text
  files while preserving binary detection. A local checkout simulation with
  `core.autocrlf=true` passes the unchanged Prettier gate; a later matrix
  exposed a separate test-helper issue, recorded below.
- The Ubuntu Node 22 mutation job passed on the first dispatch. On macOS Node
  `22.23.1`, the recorded unit, CLI integration, example-history, package, and
  Knip components passed individually. The original aggregate
  `pnpm verify:full` exit status was not captured, so it is not claimed as an
  aggregate pass. The historical release-pin matrix passed macOS/Linux and mutation;
  its four Windows cells failed before the test-helper repair described below.
- The second matrix exposed Windows-only virtual-path and diagnostic separator
  failures. `path.posix` now handles the synthetic snapshot root, while
  configured path separators are normalized using the Windows host separator
  only; error display normalizes only native Windows separators. These repairs
  are included in the reviewed release pin. The Windows matrix at that pin
  reached and passed the runtime, unit, integration, and example-history jobs,
  then exposed a spaced-Git-argument issue in the package-test helper. The
  independently reviewed test-only repair is integrated at `8786aa6`, and its
  local package check passed. Results for integration head `fd29b23` are
  maintained in the Ticket 20 release-validation comment and linked PR checks.
- Regression coverage exercises dangling/external opaque-link root, add, and
  delete seeds; safe source-link chains as importer and target; fail-closed
  dangling/external/cyclic source aliases with atomic CLI output; and gitlinks
  without fetching. Focused analyzer and CLI regressions and `pnpm verify:fast`
  passed locally; the aggregate local `pnpm verify:full` exit status was not
  captured. Integration-head results for `fd29b23` are maintained in the Ticket 20
  release-validation comment and linked PR checks.

The integrated changes and measured evidence are recorded in
[`Ticket 08 verification`](../verification/ticket-08.md). The statement that no
runtime code changed after the reviewed release pin applies to integration head
`fd29b23ddadc629e1afb2683366321ba2206ba7a`; candidate `5185800` changes runtime
behavior for the final PR #21 findings and their Spec repair. Final acceptance
remains maintained in the Ticket 20 release-validation comment and linked PR
checks while candidate review, QA, and CI complete. No npm package was published.

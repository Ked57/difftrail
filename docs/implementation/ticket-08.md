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
  local package check passed. The final integration-head status is maintained
  in the Ticket 20 release-validation comment and linked PR checks.
- Regression coverage exercises dangling/external opaque-link root, add, and
  delete seeds; safe source-link chains as importer and target; fail-closed
  dangling/external/cyclic source aliases with atomic CLI output; and gitlinks
  without fetching. Focused analyzer and CLI regressions and `pnpm verify:fast`
  pass locally; the final `pnpm verify:full` and remote matrix remain pending.

The integrated changes and measured evidence are recorded in
[`Ticket 08 verification`](../verification/ticket-08.md). No runtime code changed
after the reviewed release pin. Final CI status is tracked in the Ticket 20
release-validation comment and linked PR checks. No npm package was published.

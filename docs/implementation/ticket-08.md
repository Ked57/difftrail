# Ticket 08 implementation

Status: implementation and local release checks in progress. Integration base:
`50e0329` (Ticket 07 app plus verification record). This work is isolated on
`codex/ticket-08-release`.

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
- Remote OS/runtime matrix at the first pin found that Windows checkout line
  endings made Prettier report every text file as unformatted before later
  gates ran. The follow-up `.gitattributes` repair sets LF for detected text
  files while preserving binary detection. A local checkout simulation with
  `core.autocrlf=true` passes the unchanged Prettier gate; the full remote
  matrix must be rerun after this repair.
- The Ubuntu Node 22 mutation job passed on the first dispatch. The local
  `pnpm verify:full` gate passed on macOS Node `22.23.1`, including 60 unit
  tests, 39 CLI integration tests, all 9 isolated example histories, isolated
  npm/pnpm packed consumers, and Knip. The OS/runtime matrix remains pending.
- The second matrix exposed Windows-only virtual-path and diagnostic separator
  failures. `path.posix` now handles the synthetic snapshot root, while
  configured path separators are normalized using the Windows host separator
  only; error display normalizes only native Windows separators. The following
  combined repair pin will rerun the entire remote matrix.
- Regression coverage exercises dangling/external opaque-link root, add, and
  delete seeds; safe source-link chains as importer and target; fail-closed
  dangling/external/cyclic source aliases with atomic CLI output; and gitlinks
  without fetching. Focused analyzer and CLI regressions and `pnpm verify:fast`
  pass locally; the final `pnpm verify:full` and remote matrix remain pending.

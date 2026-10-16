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

## Evidence

- Red: `pnpm test:package` failed on the published engine metadata, which still
  declared `^22.13.0 || ^24.0.0`.
- Green: `pnpm test:package` passed after the manifests were aligned; it built
  and installed the tarball with npm and pnpm, ran the CLI, and exercised the
  packed parser dependencies against conflicting consumer parsers.
- Read-only `npm view difftrail name version --json` returned E404 on
  2026-10-16. This does not reserve the name.
- Remote OS/runtime matrix and required full/mutation gates are still pending.

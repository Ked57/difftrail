# Repair 29: static Vue video sources

Difftrail now treats a static `video[src]` in a Vue inline or external template
as an explicit local asset relationship. Resolution uses the file containing
the element, including committed path aliases and query or fragment suffixes.
Remote, data, and in-document fragment URLs remain terminal. Missing local
targets and dynamic bindings produce revisioned analysis gaps. A dynamic source
in an external template is reported against that committed template instead
of escaping as an uncontextualized parser error.

The Vue template asset contract is documented in
[Ticket 04](ticket-04.md). Existing `video[poster]`, `source[src]`, image,
audio, and track references continue to use the same resolver.

## Regression evidence

The extractor regression uses committed snapshots and literal expected edges.
Before the fix, only the poster relationship appeared; adding the video
relationship exposed a fixture decoy and confirmed that `./media/movie.mp4` in
an external template resolves under that template's directory. The same suite
covers repository-root and committed alias references, suffixes, terminal
URLs, missing and dynamic local targets, and existing media attributes.

The actual-Git CLI regression goes red when `video[src]` is temporarily removed
from the recognized attributes: movie histories omit the owner and consumer,
and missing/dynamic sources incorrectly succeed. With the relationship
restored, inline movie, poster-control, unrelated asset, external-template
decoy, base-only filtered gap, external dynamic gap, and removal histories pass
with literal expected file sets and empty output on failures.

The isolated npm tarball test invokes the installed executable for a movie
impact and missing/dynamic source failures. It passed with the workspace's
shipped Vue parser dependencies.

## Verification status

- Environment: Node 24.13.1, pnpm 10.34.7, Linux.
- Focused extractor regressions: passed (6 tests).
- Focused built CLI regressions: passed (7 tests).
- Isolated packed npm/pnpm consumer: passed, including video success and
  missing/dynamic failures.
- `pnpm verify:fast`: passed (format, lint/difficulty audit, typecheck, and 79
  unit/extractor tests).
- `pnpm verify:full`: passed (fast gate, 56 built-CLI integration tests, 9
  example Git histories, isolated packed npm/pnpm consumer, and Knip).
- Separate installed-CLI manual QA and independent review: pending with the
  parent integration task; neither is claimed complete here.

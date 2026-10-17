# Component-map entrypoint repair verification

Status: **integrated** into `codex/difftrail-cli` at
`9ab9c0029bfabd38eb869d071f2ac1b55d7479bb`. This is an analyzer repair alongside
the implementation tickets; it does not change the tracker count or close a
ticket. Draft PR #21 remains open for Tickets 07–08.

## Review evidence

- **Standards:** no hard-rule findings. A minor duplication in test fixture
  setup was accepted; there were no production design issues.
- **Specification:** the first review identified that a history test did not
  distinguish base from head mappings. The repair now asserts endpoint-specific
  targets and reciprocal exclusions, plus each endpoint's metadata/config
  provenance. The follow-up review found no remaining findings.
- **Automated checks:** `pnpm verify:full` passed at the final pin. It covered
  60 unit tests, 39 integration tests, packed-package checks, Knip, and the
  repository's formatting, lint, type, and static checks. Mutation testing was
  skipped and is not claimed as passing.

## Packaged CLI manual QA

Manual QA built and packed the final pin, installed it offline into a fresh
consumer, and exercised it on macOS with Node `22.23.1` and pnpm `10.34.7`.
The tarball SHA-256 was
`01f4d65543f18f4bf6e541d8a3f5cfb44bdca112c5f87d5163e9bf89cdfa8fda`; the
installed CLI SHA-256 was
`ad10c7881101db7d0ba3f81524aee3c4997cf94d3bd67c1b696dcd664110167d`.

On the preserved Ticket 07 history, the map-plus-config change returned exactly
`components.d.ts`, `vite.config.ts`, `ReportsPage.vue`, `App.vue`, and `main.ts`.
Explanations followed the map through its actual page consumer and ordinary
importers; unrelated page and old/new target components stayed absent. Config-
only changes, base- and head-owned component changes, missing metadata at either
endpoint, runtime-only mappings, the documented bare and `/vite` APIs,
unimported Vue builtins, native tags, local bindings, dynamic components, and
`<slot />` were also exercised. Analysis gaps failed with empty stdout and
endpoint-specific diagnostics. The direct invocation preserved the fixture's
HEAD, refs, index, worktree status, and temporary-directory contents.

The analyzer runtime hash was unchanged between production pin `13ce5cf` and
the final test-only pin `9ab9c00`; the final pin adds endpoint-ownership
regression assertions. Browser rendering remains part of Ticket 07 QA and is
not covered by this packaged CLI run. Linux, Windows, and Node 24 were not
manually tested. Mutation testing was skipped.

The complete reports are retained outside the repository:

| Evidence                           | Artifact                                              | SHA-256                                                            |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Standards review and follow-up     | `/private/tmp/component-map-standards-review-luna.md` | `938cc3718c883c6eff21858402a346b5924fff61fba9e471e5823fd7a5873b1a` |
| Specification review and follow-up | `/private/tmp/component-map-spec-review-luna.md`      | `92f1d3e212736da9c5877122f4a2d0611026292e1edabf1def95ad5d85498443` |
| Packaged CLI manual QA             | `/private/tmp/component-map-manual-qa-luna.md`        | `40acfa55761613917758456c036ae78a82e5f952660f6ce0cc80124d0941fc71` |

## CI

Fresh Ubuntu push run [38871379923](https://github.com/Ked57/difftrail/actions/runs/38871379923)
and PR run [38871386291](https://github.com/Ked57/difftrail/actions/runs/38871386291)
both passed `pnpm verify:full` on integration head `fd1d3b0`. The optional
mutation job was skipped in both runs and is not claimed as passing evidence.

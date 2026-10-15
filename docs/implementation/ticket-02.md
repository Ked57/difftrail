# Ticket 02 implementation handoff

Approved scope: [spec #12](https://github.com/Ked57/difftrail/issues/12), [ticket #14](https://github.com/Ked57/difftrail/issues/14). This handoff covers Git comparison selection and seed extraction. Independent review and manual CLI QA are separate jobs and are not claimed here.

## Delivered

The CLI now accepts `--base A`, optional `--head B` (default `HEAD`), and optional `--merge-base`; comparison flags without `--base`, repeated flags, and missing revisions are argument errors. It resolves the chosen endpoints to commit IDs before making snapshots. Default comparison uses `HEAD` and its first parent, with an empty base only for a commit that has no parent. A referenced but unavailable parent, including a shallow boundary, fails with an actionable error. Explicit endpoint comparison does not require intervening history when both endpoints are present. Merge-base selection is opt-in and errors if Git cannot establish a common ancestor.

Changed-file seeds come from the net tree difference between the selected endpoints. The comparison disables rename detection so a rename supplies both its old and new paths; deleted paths stay as seeds. This also means a change later reverted before the selected head produces no seed. Git reads committed trees only, so staged, unstaged, and untracked changes do not affect analysis. The existing analyzer/core path continues to extract and traverse each endpoint separately, then reports impacted head-present files and removed paths.

Snapshot materialization remains isolated in a temporary directory removed in `finally` after successful or failed analysis. The implementation uses argument-array Git calls and does not fetch or modify repository state.

## Verification

The approved subprocess seam uses actual temporary Git repositories with literal expected results. Added scenarios cover a genuine root, a first-parent merge, direct endpoint net differences including a full revert, explicit merge-base, deletion, rename, shallow default history failure, valid explicit endpoints available in a shallow clone, invalid refs and invalid flag combinations. The dirty-checkout scenario now combines a modified file, staged file, and untracked file, and checks that the index tree, refs, local Git configuration, and worktree status are unchanged.

`pnpm verify:full` passes: formatting, ESLint and the mandatory Difficulty audit, strict typecheck, all nine unit tests, the 26 built-CLI real-Git integration cases, isolated tarball install/executable/parser smoke, and Knip. Snapshot cleanup success/failure is covered by the existing real-source analyzer fixture and the new Git blob-read failure CLI scenario. The executed environment was macOS arm64 with Node 22.23.1 and pnpm 10.34.7. No browser/app surface changed. Review and manual CLI QA are separate jobs; this handoff does not claim QA observations.

## Review repair

The independent standards review had no findings. The specification review requested actual CLI histories for cycles and a cross-endpoint path trap, an operational Git-failure cleanup check, exact worktree file preservation, and more useful invalid-revision diagnostics.

The new endpoint fixture changes package entry points between snapshots: the base graph reaches `bridge.js` from `package-a/old.js`, while the head graph reaches `consumer.js` from `bridge.js`. Independent traversal returns the literal expected paths without `consumer.js`. A temporary mutation that traversed the union of both endpoint edge sets failed this CLI test by adding `consumer.js`; the production selector was restored and the test passed. Ticket 03 will add actual configuration-consumer edges, so its later contract may legitimately change this fixture's expected selection.

Additional real-Git checks cover a source dependency cycle, removal of a committed loose blob during head snapshot materialization with no leaked `difftrail-snapshots-*` directory, and byte-for-byte before/after reads of the modified tracked, staged, and untracked fixture files. Invalid base and head refs now appear in stderr with their role, Git's cause, and an available-commit/history hint; both cases retain status 1 and zero stdout. The new CLI history/cleanup/preservation and diagnostic regressions pass in the 26-case integration suite.

This repair changes CLI runtime behavior for invalid-reference diagnostics. The rebuilt `packages/cli/dist/cli.js` SHA-256 is `18f728a1ed69c15209e1b1ba9d45a02e16aaf85bcaef244af86ca27bb68c907e`, so the manual-QA job should retest base/head invalid references and adjacent success/state-preservation paths on the repaired artifact. Those QA observations are pending and are not claimed here.

## Scope boundary

This ticket adds comparison selection and Git history semantics only. The current extractor still has its existing JavaScript/CommonJS support boundary; TypeScript and later source-resolution behavior belong to following tickets. No npm release, integration merge, or issue closure was performed by this implementer.

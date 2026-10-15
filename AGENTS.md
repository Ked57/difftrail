# Difftrail agent instructions

Read CODING_STANDARDS.md and GLOSSARY.md before implementation or review. Approved scope and ticket graph live in docs/plans/implementation-tracker.md; acceptance details live in docs/plans/spec-proposal.md and acceptance-checklist.md.

Run the applicable checks in .agents/agent-config.json. Use one isolated managed worktree per implementation ticket, then separate review, manual QA and integration jobs. Preserve user changes and do not publish npm releases or merge the final PR without explicit authorization.

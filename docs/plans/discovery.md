# Difftrail implementation discovery

Discovery recorded 2026-10-15. This document is evidence and coordination context; the exact eight-ticket proposal and edges are user-approved on 2026-10-15. Product decisions and four verification seams are already approved in the GitHub wayfinder resolutions.

## Repository evidence

- Initial commit: `4152bb8`; branch at initial discovery `master`, tracking `origin/master`; integration branch is now `codex/difftrail-cli`.
- Remote: `git@github.com:Ked57/difftrail.git`.
- Tracked content: README containing only the project name, Apache-2.0 license, Node-oriented ignore file.
- Existing untracked user content: `GLOSSARY.md`. Preserve it and use its definitions as the domain authority.
- No source, package manifest, lockfile, runnable app, tests, CI, project AGENTS file, project `.agents` installation, agent-config verification map, or ADR exists yet. The local repo has no tracker configuration, but the authoritative GitHub map establishes GitHub and its label/relationship conventions.
- Runtime tools: Node `v22.23.1`, pnpm, GitHub CLI available.
- Sandbox GitHub CLI calls fail DNS and misleadingly report invalid authentication. Approved escalated read-only calls succeed. GitHub is available; the origin default branch is `master`.

## Explicit requested result

Use `/to-spec` → `/to-tickets` → `/implement-spec`; main agent uses chief-of-staff; all jobs use separate subagents. Each implementation job requires code, review, repair, and manual QA. Deliver a PR containing a working, tested CLI ready for npm distribution. Use Turborepo, separate module packages, a test application, and room for a future documentation site.

## Product evidence and uncertainty

The glossary establishes repository file impact analysis: changed-file seeds include deleted paths and both paths of renames; impacted files include seeds and reverse transitive dependencies; dependencies include imports, explicit local file references, statically resolved auto-import mappings, and analysis/resolution configuration or metadata. An analysis gap prevents successful impact output. Returned files exist at head and survive filtering; removed impacted paths are separate.

The user identified the authoritative completed wayfinder map: https://github.com/Ked57/difftrail/issues/1. Read full decision bodies/comments saved under `/private/tmp/difftrail-source/issue-<number>.md`, especially #10 for final handoff; #2/#3/#5/#6/#7/#8/#9 are canonical decisions. Raw response snapshots are alongside them. The original unsourced draft was replaced after fetching these decisions. Do not substitute a narrow import-only test selector for the glossary's general impacted-file model.

## Workflow owners

All paths below are under `/Users/clementfassot/.agents/skills/`:

- `chief-of-staff/SKILL.md`: all work delegated; main agent coordinates via context pointers.
- `goal/SKILL.md`: active goal persists until the complete requested deliverable is proved.
- `to-spec/SKILL.md`: synthesize, confirm public test seams, publish spec to configured tracker.
- `to-tickets/SKILL.md`: propose vertical slices and blocking edges; obtain breakdown approval; publish one ticket per slice.
- `implement-spec/SKILL.md`: single integration branch; implementer worktrees based on integration; TDD; separate mergers; draft PR after first merge; final review and worktree cleanup.
- `tdd/SKILL.md`: tests only at agreed public seams, one failing behavior test per implementation cycle.
- `code-review/SKILL.md`: separate Standards and Spec review subagents using a pinned scope.
- `manual-qa/SKILL.md`: invoke actual built CLI with disposable fixtures and record actions/results.
- `fullstack-typescript-quality/SKILL.md` and its children: consult when creating TypeScript quality tooling.
- `writing-for-agents/SKILL.md`: consult when authoring agent-facing instructions.
- `pr/SKILL.md`: consult when creating the PR body.

Global routing and TypeScript policy apply: `/Users/clementfassot/.agents/policy/routing.md`, `/Users/clementfassot/.agents/policy/typescript.md`. RTK output instructions: `/Users/clementfassot/.codex/RTK.md`.

## Next dispatch

Read `spec-proposal.md` and `ticket-proposal.md`. #10 already approves the four test seams, so no seam reapproval or new product interview is required. The user approved the exact eight-ticket graph and edges; publication is recorded in `implementation-tracker.md`. GitHub is canonical: specification #12 and child tickets #13–#20 carry `ready-for-agent` labels and native blocking links; do not reopen or alter completed wayfinder decisions. No further planning confirmation is needed.

Before feature work, establish build, quality gates, package boundaries, standards, disposable test-app fixture, and verification commands in the first working CLI slice. Do not introduce a blank future docs app with dependencies solely to reserve a name; reserve the boundary and document how a future site joins the workspace.

No implementation or manual QA was performed during discovery.

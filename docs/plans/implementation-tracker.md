# Difftrail implementation tracker

Approved 2026-10-15. Integration branch: `codex/difftrail-cli`; base: `master` at `4152bb8`.

Specification: [#12 — implement the Difftrail impacted-file CLI and example monorepo](https://github.com/Ked57/difftrail/issues/12). The approved local synthesis is [spec-proposal.md](spec-proposal.md); the [completed wayfinder map #1](https://github.com/Ked57/difftrail/issues/1) and its linked resolutions remain the product authority. Existing closed planning issues #1–#11 were preserved.

| Slice | Implementation ticket | Native blockers |
| --- | --- | --- |
| 01 | [#13 — Governed Turborepo and first packaged impact CLI](https://github.com/Ked57/difftrail/issues/13) | None |
| 02 | [#14 — Complete independent endpoint impact and Git comparison semantics](https://github.com/Ked57/difftrail/issues/14) | #13 |
| 03 | [#15 — Resolve aliases, workspaces and configuration consumers](https://github.com/Ked57/difftrail/issues/15) | #14 |
| 04 | [#16 — Support Vue SFCs and explicit local assets](https://github.com/Ked57/difftrail/issues/16) | #15 |
| 05 | [#17 — Resolve static auto-imports and enforce complete gap policy](https://github.com/Ked57/difftrail/issues/17) | #16 |
| 06 | [#18 — Complete exact output, filters and explanations](https://github.com/Ked57/difftrail/issues/18) | #17 |
| 07 | [#19 — Build the runnable multi-page Vue test app and real histories](https://github.com/Ked57/difftrail/issues/19) | #15, #16, #17 |
| 08 | [#20 — Prove npm release readiness and complete the PR](https://github.com/Ked57/difftrail/issues/20) | #18, #19 |

All eight are native sub-issues of #12 and labelled `ready-for-agent`. GitHub native dependencies determine the frontier. Slice 07 may run alongside 06 after #15/#16/#17 are resolved. Ticket closure follows the integration PR workflow; implementation completion and blocker release must have review, repairs, relevant gates and actual manual-QA evidence.

Ticket #13 implementation is complete on `codex/difftrail-cli` at integration commit `fa5fc20ead54f52c6fde5d6473d9e68ed70bf0c1`. Its review, automated gate, manual-QA results, and remaining limits are recorded in [Ticket 01 verification](../verification/ticket-01.md).

Ticket #14 implementation is complete on `codex/difftrail-cli` at integration merge commit `cb5a9ade3cf7e0174e45cad1b34f6c31f7f864b0`. Its review, automated gate, manual-QA results, and remaining limits are recorded in [Ticket 02 verification](../verification/ticket-02.md). Native issue closure and the integration PR remain part of the PR workflow.

Ticket #15 implementation is complete on `codex/difftrail-cli` at integration merge commit `f139f547ddb84b60de61e96294dcdd8e35e2fdb6`. Its review, automated gate, manual-QA results, and remaining limits are recorded in [Ticket 03 verification](../verification/ticket-03.md). Native issue closure and the integration PR remain part of the PR workflow.

Ticket #16 implementation is complete on `codex/difftrail-cli` at integration merge commit `c8b372ad58c7ae290c7a20a5d8555d0cebfe07a3`. Its review, automated gate, manual-QA results, and remaining limits are recorded in [Ticket 04 verification](../verification/ticket-04.md). Native issue closure and the integration PR remain part of the PR workflow.

Ticket #17 implementation is complete on `codex/difftrail-cli` at integration merge commit `2cb2ff508f5b92377a8fc5108f9a1309833aed27`. Its separate Standards and Spec reviews, automated gate, packed CLI manual-QA results, and remaining limits are recorded in [Ticket 05 verification](../verification/ticket-05.md). Native issue closure and the integration PR remain part of the PR workflow.

Ticket #18 implementation is complete on `codex/difftrail-cli` at integration merge commit `8b20c7c15b06214be0bc475560fba16d59041b6f`; issue #18 was closed after its evidence comment. Its separate Standards and Spec reviews, automated gate, packed CLI manual-QA results, repairs, and remaining limits are recorded in [Ticket 06 verification](../verification/ticket-06.md). Draft PR #21 remains open for Tickets 07–08.

Ticket #19 implementation is complete on `codex/difftrail-cli` at integration merge commit `ea7aae688081556e9c791d4afa052641d63f2dd8`; the reviewed feature pin is `71d5e9a7cc800a29e7e945022643b7f1a9e622a7`. Its final review, automated gates, browser and packed-CLI manual-QA evidence, and remaining limits are recorded in [Ticket 07 verification](../verification/ticket-07.md). With #18 and #19 resolved, Ticket #20 is the next ready implementation frontier. Draft PR #21 remains open; publication and PR merge are not authorized by this tracker.

Ticket #20 implementation is integrated at `fd29b23ddadc629e1afb2683366321ba2206ba7a`, from reviewed release pin `07679254b837fdf127681a59cfb7561e64aecea4` plus reviewed test-only package harness repair `8786aa6134cba57600aa72eb87f855e25052931d`. Its release evidence is recorded in [Ticket 08 verification](../verification/ticket-08.md). Historical matrix results and final acceptance status are maintained in the [Ticket 20 release-validation comment](https://github.com/Ked57/difftrail/issues/20#issuecomment-6215990357) and the linked PR checks. Npm publication and PR merge remain separate actions.

The independent pnpm ancestor-provider and TypeScript config-host repair was merged at `d1ee50dbd969a6bf4c8fce6a96179ca07b1103d7`. It is recorded separately in [pnpm ancestor-provider repair verification](../verification/pnpm-ancestor-provider-repair.md); it does not change the implementation ticket count or close a ticket.

For ticket dispatch, read [ticket-proposal.md](ticket-proposal.md) and its acceptance matrix. For independent specification/final acceptance review, use [acceptance-checklist.md](acceptance-checklist.md). For bootstrap tool/runtime/version evidence, consult [tooling-research.md](tooling-research.md). These documents record planning/source review; they claim no implementation or executed runtime evidence.

After the first product-code merge, open a draft PR against `master` closing #12 and #13–#20. Mark it ready after final acceptance/review/repairs; npm publication and PR merge are separate actions.

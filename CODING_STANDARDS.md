# Engineering standards

Read GLOSSARY.md for changed-file seed, impacted file and analysis gap vocabulary. Keep workspace module interfaces small: `core` owns pure closure/selection, `git` owns committed snapshot materialization and cleanup, `analyzer` owns source extraction and gap detection, and `cli` owns arguments/output/orchestration. Only the npm executable is a supported public interface. Internal package exports are test seams.

Use strict TypeScript with checked indexed access and exact optional properties. Never introduce `any`, unchecked untrusted data assertions, project-code execution, guessed resolution or partial-success analysis. Use argument arrays for Git; preserve user repository files, index, refs and configuration. A snapshot graph belongs to one revision: traverse endpoints independently before combining impacted paths.

Run `pnpm verify:fast` while editing and `pnpm verify:full` before handing off. Tests observe approved graph, extractor and built/packed CLI seams. Unit coverage is 100% on pure domain/application selection; source extraction, Git, and CLI are I/O adapters verified by actual source/Git/subprocess scenarios rather than unit coverage percentages. The future Vue app adds its own component/browser checks in Ticket 07.

Static gates: cyclomatic and cognitive complexity <=21, function <100 lines, file <500 lines, no explicit any, Halstead Volume <=1500 and Effort <=50000. These initial project co-thresholds flag unusually large functions without forcing trivial pass-through helpers. A mandatory separate audit measures every TypeScript function via the same plugin and rejects Difficulty >=80. CRAP threshold is explicitly 25. Knip runs in the full gate and CI. Pure core mutation testing is available with `pnpm test:mutation:domain` and manual CI.

No requirement or threshold may be weakened to hide a defect. Separate review and executed manual QA follow every implementation ticket. Record actual outcomes and unverified platforms; CI configuration alone is not passing platform evidence.

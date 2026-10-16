# Repair 30: preserve repository-root spelling

Git terminates `rev-parse --show-toplevel` output with one LF record delimiter. The
previous `trimEnd()` also removed legitimate trailing characters from the repository
path before canonicalization. Root discovery now validates and removes only that final
LF byte, then passes the remaining path spelling to `realpath` unchanged.

The built-CLI regression creates real Git histories whose roots end in space, tab, CR,
and LF. It verifies that `realpath` retains the requested suffix, invokes the executable
from the root and a subdirectory with both latest commit and explicit endpoint selection,
and checks literal endpoint IDs, exact returned paths, empty removals, and the canonical
root. A fixture is reported as skipped with the filesystem error if that platform cannot
create its path, or with the canonical path if the platform normalizes the suffix.

## Evidence

- **Before:** `pnpm exec vitest run --config vitest.integration.config.ts tests/repair-30.test.ts`
  failed all four suffix cases. The built CLI exited 1 with `ENOENT` from `realpath`;
  Git's path had been shortened before canonicalization.
- **After:** the same command passed all four suffix cases on Linux, including root and
  subdirectory invocations and latest and explicit endpoint comparisons.
- **Implementation pin:** recorded after commit.
- **Full verification:** `pnpm verify:fast` and `pnpm verify:full` passed. The full gate
  includes build, 53 built-CLI integration tests, nine example Git histories, isolated
  npm/pnpm tarball installs, and knip.
- **Manual QA:** parent-run installed CLI QA is separate and pending. This worktree run
  does not claim installed-package or non-Linux filesystem verification.

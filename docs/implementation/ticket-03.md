# Ticket 03: snapshot-aware dependency resolution

Ticket #15 adds dependency extraction for committed JavaScript and TypeScript
snapshots. The analyzer uses the installed dependency-cruiser programmatic
API for resolution and TypeScript's shipped parser for source and configuration
inspection. It resolves import and require conditions separately so conditional
package exports select the branch used by each relationship.

The source pass records import, type import, re-export, type re-export, literal
dynamic import, and CommonJS require relationships. It rejects malformed
source, unresolved dependencies, non-literal loader calls, and unsupported
source syntax with an analysis gap that identifies the file and revision.
Runtime require shadowing accounts for parameters, local bindings, imports,
and TypeScript-only ambient declarations.

Tracked TypeScript configuration files are parsed without running project code.
Inherited configuration paths must resolve to files in the selected snapshot.
Each importing source receives configuration edges to the files actually read
by its resolved config. Paths aliases are applied per configured source
group, including inherited aliases without baseUrl. Workspace links come
only from tracked npm workspaces or pnpm-workspace.yaml membership and
tracked package manifests; the importing package must declare the workspace
dependency. Importers retain metadata edges to the membership and package
manifests used for that resolution.

Installed external package entry points are accepted only when endpoint
evidence matches committed metadata and the importing package declares the
dependency. The implemented evidence formats are npm package-lock v2/v3 with
node_modules/.package-lock.json, and pnpm lockfile v9 with its installed
lockfile and modules metadata. The npm proof currently supports the
root-level package layout. pnpm requires the installed lock metadata to match
the committed lock. Missing or mismatched evidence fails with an analysis gap;
the analyzer never installs packages or runs repository scripts.

tsconfig-paths-webpack-plugin 4.2.0 has an optional compatibility
require of enhanced-resolve/lib/createInnerCallback. The locked
enhanced-resolve 5.26.0 package does not contain that file. The upstream
plugin catches the missing-module error and uses its fallback. The CLI bundle
keeps this optional request external and supplies Node's createRequire for
the bundled CommonJS plugin; it does not declare a dependency on a nonexistent
subpath. The isolated pnpm tarball smoke confirms that fallback works without
workspace hoisting.

Vue source, auto-imports, generated output handling, package managers beyond
the evidence formats above, and non-JSON TypeScript configuration remain
outside this ticket. Unsupported syntax or required historical inputs fail
explicitly rather than being silently omitted.

## Verification

pnpm verify:full passed:

- Format, ESLint, TypeScript typecheck, and unit tests (18 tests).
- Integration tests (28 tests).
- npm and strict isolated pnpm tarball consumers, including execution of a
  config-only TypeScript alias change in the pnpm consumer.
- Package metadata, executable, license, and shipped TypeScript parser smoke.
- Knip.

The integration and package checks were run against the built CLI. The
standalone analyzer Vitest invocation has a nonzero exit when the project's
core-only 100% coverage thresholds are enabled without the core test file, so
the full unit suite is the authoritative analyzer regression run.

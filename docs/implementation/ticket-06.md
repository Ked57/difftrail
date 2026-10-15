# Ticket 06: exact output, filters, and explanations

Ticket #18 completes the CLI output contract on top of the committed endpoint
graphs from Tickets 01–05. It adds NUL-delimited output, positive repeated glob
filters, and optional endpoint-specific JSON witness chains. The existing JSON
schema remains unchanged unless `--explain` is requested.

Default output and `--null` emit selected head-existing paths as raw UTF-8 text,
terminated by LF or NUL respectively. Empty selections emit zero bytes. JSON
always ends with LF and keeps `root`, resolved `base` and `head`, `scope`,
`files`, and `removed`; `--explain` adds one sorted explanation per retained
file. JSON and NUL are mutually exclusive, and explanations require JSON.
Selected CR/LF paths fail in line mode with status 2, zero stdout, and advice to
use JSON or NUL. JSON and NUL preserve line breaks in filenames.

Repeated `--filter` patterns are positive OR globs matched against complete
normalized paths, after both endpoint graphs have been extracted and validated.
`*` and `?` stay within one segment; `**` may span zero or more segments. Dot
paths match normally, and bare patterns match at the root. Filters apply to
both returned and removed paths, while graph intermediates and analysis gaps
remain visible to traversal and validation.

Explanation traversal runs once per endpoint from seeds present in that
endpoint's committed snapshot. It keeps the shortest chain, chooses head when
both endpoint chains have equal length, and visits sorted seeds and consumers
to settle same-endpoint ties by path string. This keeps deleted and renamed old
paths attached to base evidence and prevents chains from stitching edges across
snapshots. Filtered intermediate files remain in the chain.

## Verification seams

The four approved seams remain in force. Pure core tests exercise reverse
reachability, cycles, deduplication, endpoint isolation, shortest witnesses,
and deterministic ties; they do not test extraction. Real source extraction
tests exercise actual parsers and snapshot configuration; they do not prove
Git, packaging, or output bytes. Built CLI subprocess tests use temporary real
Git histories and assert exact stdout, schema, status, and stderr; they do not
test application rendering or unexecuted platforms. A separate manual-QA job
must execute the packaged CLI against real histories and record observed
outcomes; this implementation job does not claim that manual check.

## Current evidence and limits

The changed CLI output tests cover line, NUL, and JSON output; empty behavior;
spaces, Unicode, dot paths, and a POSIX literal backslash; CR/LF filename
handling; OR, `?`, `**`, and root-only glob behavior; post-graph filtering of
returned and removed paths; filtered intermediate explanation paths; and
endpoint-specific deletion explanations. A dedicated CLI history fixture also
covers recursive filters across an LF directory component with exact JSON and
NUL output. Core tests cover shortest-chain and head-tie choice, path-order tie
choice, and the prohibition on cross-snapshot chains.

`pnpm verify:full` passed on the current Ticket 05 integration tip: formatting,
ESLint and difficulty audit, TypeScript, 51 unit tests, 35 CLI integration
tests, isolated npm and strict pnpm tarball installs, executable checks, and
Knip. The core graph tests retained 100% statement, branch, function, and line
coverage. Subprocess tests use fixture-local temporary directories, so cleanup
assertions stay isolated while test files run in parallel. A separate manual-QA
job remains required and is not claimed here. The current host's tests do not
establish Windows path behavior or platform-matrix support.

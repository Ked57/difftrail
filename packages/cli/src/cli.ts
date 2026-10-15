import { withComparison, type ComparisonOptions } from '@difftrail/git';
import { extractGraph } from '@difftrail/analyzer';
import { selectImpact } from '@difftrail/core';

class UsageError extends Error {}
function recordFlag(flags: Set<string>, flag: string): void {
  if (flags.has(flag)) throw new UsageError('Invalid or repeated CLI option.');
  flags.add(flag);
}
function readRevision(
  args: readonly string[],
  index: number,
  flag: string,
): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--'))
    throw new UsageError(`Missing revision after ${flag}.`);
  return value;
}
function parseArgs(args: readonly string[]): {
  readonly json: boolean;
  readonly comparison: ComparisonOptions;
} {
  const flags = new Set<string>();
  const revisions = new Map<string, string>();
  let json = false;
  let mergeBase = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--base' || arg === '--head') {
      recordFlag(flags, arg);
      revisions.set(arg, readRevision(args, index, arg));
      index++;
    } else {
      recordFlag(flags, arg ?? '');
      if (arg === '--json') json = true;
      else if (arg === '--merge-base') mergeBase = true;
      else throw new UsageError('Invalid or repeated CLI option.');
    }
  }
  const base = revisions.get('--base');
  const head = revisions.get('--head');
  if (head !== undefined && base === undefined)
    throw new UsageError('--head requires --base.');
  if (mergeBase && base === undefined)
    throw new UsageError('--merge-base requires --base.');
  const comparison: ComparisonOptions = {
    ...(base === undefined ? {} : { base }),
    ...(head === undefined ? {} : { head }),
    ...(mergeBase ? { mergeBase } : {}),
  };
  return { json, comparison };
}
async function main(args: readonly string[]): Promise<string> {
  if (args.length === 1 && args[0] === '--help')
    return 'Usage: difftrail [--base A [--head B] [--merge-base]] [--json]\n\nReport static reverse impact of committed Git endpoints.\n';
  if (args.length === 1 && args[0] === '--version') return '0.1.0\n';
  const parsed = parseArgs(args);
  return withComparison(
    process.cwd(),
    async (comparison) => {
      const baseGraph = await extractGraph(comparison.baseSnapshot);
      const headGraph = await extractGraph(comparison.headSnapshot);
      const selected = selectImpact(
        comparison.seeds,
        baseGraph.edges,
        headGraph.edges,
        comparison.headSnapshot.paths,
      );
      if (parsed.json)
        return (
          JSON.stringify({
            root: comparison.root,
            base: comparison.base,
            head: comparison.head,
            scope: 'static',
            ...selected,
          }) + '\n'
        );
      if (selected.files.some((path) => /[\r\n]/.test(path)))
        throw new UsageError(
          'A returned path contains a line break; use --json.',
        );
      return selected.files.map((path) => path + '\n').join('');
    },
    parsed.comparison,
  );
}
try {
  process.stdout.write(await main(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(
    `difftrail: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = error instanceof UsageError ? 2 : 1;
}

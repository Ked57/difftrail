import { withComparison } from '@difftrail/git';
import { extractGraph } from '@difftrail/analyzer';
import { selectImpact } from '@difftrail/core';

class UsageError extends Error {}
async function main(args: readonly string[]): Promise<string> {
  if (args.length === 1 && args[0] === '--help')
    return 'Usage: difftrail [--json]\n\nReport static reverse impact of HEAD compared with its first parent.\n';
  if (args.length === 1 && args[0] === '--version') return '0.1.0\n';
  if (args.some((arg) => arg !== '--json') || args.length > 1)
    throw new UsageError('Usage: difftrail [--json]');
  return withComparison(process.cwd(), async (comparison) => {
    const baseGraph = await extractGraph(comparison.baseSnapshot);
    const headGraph = await extractGraph(comparison.headSnapshot);
    const selected = selectImpact(
      comparison.seeds,
      baseGraph.edges,
      headGraph.edges,
      comparison.headSnapshot.paths,
    );
    if (args.includes('--json'))
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
  });
}
try {
  process.stdout.write(await main(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(
    `difftrail: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = error instanceof UsageError ? 2 : 1;
}

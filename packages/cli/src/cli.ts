import { withComparison, type ComparisonOptions } from '@difftrail/git';
import { extractGraph } from '@difftrail/analyzer';
import { selectExplanations, selectImpact } from '@difftrail/core';
import { sep } from 'node:path';

class UsageError extends Error {}
function recordFlag(flags: Set<string>, flag: string): void {
  if (flags.has(flag)) throw new UsageError('Invalid or repeated CLI option.');
  flags.add(flag);
}
function readOptionValue(
  args: readonly string[],
  index: number,
  option: string,
  valueName: string,
): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--'))
    throw new UsageError(`Missing ${valueName} after ${option}.`);
  return value;
}
function globExpression(pattern: string): RegExp {
  let expression = '^';
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index++;
        if (pattern[index + 1] === '/') {
          expression += '(?:[\\s\\S]*/)?';
          index++;
        } else expression += '[\\s\\S]*';
      } else expression += '[^/]*';
    } else if (character === '?') expression += '[^/]';
    else if (character !== undefined && /[\\^$+?.()|[\]{}]/.test(character))
      expression += `\\${character}`;
    else expression += character;
  }
  return new RegExp(`${expression}$`);
}
function matchesFilters(path: string, filters: readonly RegExp[]): boolean {
  return filters.length === 0 || filters.some((filter) => filter.test(path));
}
function outputPath(path: string): string {
  return sep === '\\' ? path.replaceAll('\\', '/') : path;
}
function collectOptions(args: readonly string[]): {
  readonly flags: Set<string>;
  readonly revisions: Map<string, string>;
  readonly filters: readonly RegExp[];
} {
  const flags = new Set<string>();
  const revisions = new Map<string, string>();
  const filters: RegExp[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    switch (arg) {
      case '--base':
      case '--head':
        recordFlag(flags, arg);
        revisions.set(arg, readOptionValue(args, index, arg, 'revision'));
        index++;
        break;
      case '--filter': {
        const pattern = readOptionValue(args, index, arg, 'filter pattern');
        if (pattern.startsWith('!'))
          throw new UsageError('Negative --filter patterns are not supported.');
        filters.push(globExpression(pattern));
        index++;
        break;
      }
      case '--json':
      case '--null':
      case '--explain':
      case '--merge-base':
        recordFlag(flags, arg);
        break;
      default:
        throw new UsageError('Invalid or repeated CLI option.');
    }
  }
  return { flags, revisions, filters };
}
function parseArgs(args: readonly string[]): {
  readonly json: boolean;
  readonly nullDelimited: boolean;
  readonly explain: boolean;
  readonly filters: readonly RegExp[];
  readonly comparison: ComparisonOptions;
} {
  const { flags, revisions, filters } = collectOptions(args);
  const base = revisions.get('--base');
  const head = revisions.get('--head');
  const json = flags.has('--json');
  const nullDelimited = flags.has('--null');
  const explain = flags.has('--explain');
  const mergeBase = flags.has('--merge-base');
  if (head !== undefined && base === undefined)
    throw new UsageError('--head requires --base.');
  if (mergeBase && base === undefined)
    throw new UsageError('--merge-base requires --base.');
  if (json && nullDelimited)
    throw new UsageError('--json and --null cannot be used together.');
  if (explain && !json) throw new UsageError('--explain requires --json.');
  const comparison: ComparisonOptions = {
    ...(base === undefined ? {} : { base }),
    ...(head === undefined ? {} : { head }),
    ...(mergeBase ? { mergeBase } : {}),
  };
  return { json, nullDelimited, explain, filters, comparison };
}
async function main(args: readonly string[]): Promise<string> {
  if (args.length === 1 && args[0] === '--help')
    return 'Usage: difftrail [--base A [--head B] [--merge-base]] [--json | --null] [--filter GLOB ...] [--explain]\n\nReport static reverse impact of committed Git endpoints.\n';
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
      const files = selected.files
        .map(outputPath)
        .filter((path) => matchesFilters(path, parsed.filters));
      const removed = selected.removed
        .map(outputPath)
        .filter((path) => matchesFilters(path, parsed.filters));
      if (parsed.json)
        return (
          JSON.stringify({
            root: comparison.root,
            base: comparison.base,
            head: comparison.head,
            scope: 'static',
            files,
            removed,
            ...(parsed.explain
              ? {
                  explanations: selectExplanations(
                    comparison.seeds.filter((seed) =>
                      comparison.baseSnapshot.paths.includes(seed),
                    ),
                    baseGraph.edges,
                    comparison.seeds.filter((seed) =>
                      comparison.headSnapshot.paths.includes(seed),
                    ),
                    headGraph.edges,
                    [...files, ...removed],
                  ).map((explanation) => ({
                    ...explanation,
                    file: outputPath(explanation.file),
                    chain: explanation.chain.map(outputPath),
                  })),
                }
              : {}),
          }) + '\n'
        );
      if (parsed.nullDelimited)
        return files.map((path) => path + '\0').join('');
      if (files.some((path) => /[\r\n]/.test(path)))
        throw new UsageError(
          'A returned path contains a line break; use --json or --null.',
        );
      return files.map((path) => path + '\n').join('');
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

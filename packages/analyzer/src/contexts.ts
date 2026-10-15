import { dirname, join } from 'node:path';
import type { Snapshot } from '@difftrail/git';

export interface SourceGroup {
  readonly configPath: string | null;
  readonly sources: readonly string[];
}

/** Groups each source under its nearest committed tsconfig, with root fallback. */
export function groupSourcesByConfig(
  snapshot: Snapshot,
  sources: readonly string[],
): SourceGroup[] {
  const configs = new Set(
    snapshot.paths.filter(
      (path) => path.endsWith('/tsconfig.json') || path === 'tsconfig.json',
    ),
  );
  const grouped = new Map<string | null, string[]>();
  for (const source of sources) {
    let directory = dirname(source);
    let configPath: string | null = null;
    while (directory !== '.' && directory !== '') {
      const candidate = join(directory, 'tsconfig.json').split('\\').join('/');
      if (configs.has(candidate)) {
        configPath = candidate;
        break;
      }
      directory = dirname(directory);
    }
    if (configPath === null && configs.has('tsconfig.json'))
      configPath = 'tsconfig.json';
    const group = grouped.get(configPath) ?? [];
    group.push(source);
    grouped.set(configPath, group);
  }
  return [...grouped].map(([configPath, groupSources]) => ({
    configPath,
    sources: groupSources,
  }));
}

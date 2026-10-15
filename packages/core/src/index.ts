export interface DependencyEdge {
  readonly importer: string;
  readonly dependency: string;
  readonly specifier?: string;
  readonly kind?: string;
}

export interface ImpactExplanation {
  readonly file: string;
  readonly snapshot: 'base' | 'head';
  readonly chain: readonly string[];
}

function explanationChains(
  seeds: readonly string[],
  edges: readonly DependencyEdge[],
): Map<string, readonly string[]> {
  const consumers = new Map<string, Set<string>>();
  for (const { importer, dependency } of edges) {
    const paths = consumers.get(dependency) ?? new Set<string>();
    paths.add(importer);
    consumers.set(dependency, paths);
  }
  const chains = new Map<string, readonly string[]>();
  const queue = [...new Set(seeds)]
    .sort()
    .map((path) => ({ path, chain: [path] }));
  for (const { path, chain } of queue) chains.set(path, chain);
  for (const { path, chain } of queue) {
    for (const importer of [...(consumers.get(path) ?? [])].sort()) {
      if (chains.has(importer)) continue;
      const nextChain = [...chain, importer];
      chains.set(importer, nextChain);
      queue.push({ path: importer, chain: nextChain });
    }
  }
  return chains;
}

/** Selects a shortest, deterministic witness from one complete endpoint graph. */
export function selectExplanations(
  baseSeeds: readonly string[],
  baseEdges: readonly DependencyEdge[],
  headSeeds: readonly string[],
  headEdges: readonly DependencyEdge[],
  files: readonly string[],
): ImpactExplanation[] {
  const baseChains = explanationChains(baseSeeds, baseEdges);
  const headChains = explanationChains(headSeeds, headEdges);
  return [...new Set(files)].sort().flatMap((file) => {
    const base = baseChains.get(file);
    const head = headChains.get(file);
    const explanation =
      base === undefined
        ? head === undefined
          ? undefined
          : { file, snapshot: 'head' as const, chain: head }
        : head === undefined || base.length < head.length
          ? { file, snapshot: 'base' as const, chain: base }
          : { file, snapshot: 'head' as const, chain: head };
    return explanation === undefined ? [] : [explanation];
  });
}

/** Seed-inclusive reverse closure of one snapshot only. */
export function impactedPaths(
  seeds: readonly string[],
  edges: readonly DependencyEdge[],
): string[] {
  const consumers = new Map<string, Set<string>>();
  for (const { importer, dependency } of edges) {
    const paths = consumers.get(dependency) ?? new Set<string>();
    paths.add(importer);
    consumers.set(dependency, paths);
  }
  const impacted = new Set(seeds);
  const queue = [...impacted];
  for (const path of queue) {
    for (const importer of consumers.get(path) ?? []) {
      if (impacted.has(importer)) continue;
      impacted.add(importer);
      queue.push(importer);
    }
  }
  return [...impacted].sort();
}

/** Traverse independently before union so history cannot invent dependency chains. */
export function selectImpact(
  seeds: readonly string[],
  baseEdges: readonly DependencyEdge[],
  headEdges: readonly DependencyEdge[],
  headPaths: readonly string[],
): { files: string[]; removed: string[] } {
  const impacted = new Set([
    ...impactedPaths(seeds, baseEdges),
    ...impactedPaths(seeds, headEdges),
  ]);
  const existing = new Set(headPaths);
  const files: string[] = [];
  const removed: string[] = [];
  for (const path of [...impacted].sort())
    (existing.has(path) ? files : removed).push(path);
  return { files, removed };
}

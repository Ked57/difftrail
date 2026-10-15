export interface DependencyEdge {
  readonly importer: string;
  readonly dependency: string;
  readonly specifier?: string;
  readonly kind?: string;
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

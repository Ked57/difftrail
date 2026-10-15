import type { Snapshot } from '@difftrail/git';
import { analysisGap } from './errors.js';

class ExternalEvidenceError extends Error {
  constructor(
    readonly source: string,
    manifest: string,
    reason: string,
  ) {
    super(`${manifest}: ${reason}`);
  }
}

export async function withImporterContext(
  manifest: string,
  packages: ReadonlyMap<string, ReadonlySet<string>>,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const source = [...packages.values()][0]?.values().next().value;
    throw new ExternalEvidenceError(
      source ?? manifest,
      manifest,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function externalEvidenceGap(snapshot: Snapshot, error: unknown): Error {
  return error instanceof ExternalEvidenceError
    ? analysisGap(snapshot, error.source, error.message)
    : analysisGap(
        snapshot,
        '<external dependency evidence>',
        error instanceof Error ? error.message : String(error),
      );
}

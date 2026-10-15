import type { Snapshot } from '@difftrail/git';
import { analysisGap } from './errors.js';

class ExternalEvidenceError extends Error {
  constructor(
    readonly source: string | undefined,
    readonly manifest: string,
    readonly reason: string,
  ) {
    super(`${manifest}: ${reason}`);
  }
}

export async function withImporterContext(
  manifest: string,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof ExternalEvidenceError) throw error;
    throw new ExternalEvidenceError(
      undefined,
      manifest,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function withDependencyContext(
  manifest: string,
  sources: ReadonlySet<string>,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    throw new ExternalEvidenceError(
      [...sources].sort().join(', ') || undefined,
      manifest,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function externalEvidenceGap(snapshot: Snapshot, error: unknown): Error {
  return error instanceof ExternalEvidenceError
    ? analysisGap(
        snapshot,
        error.source ?? error.manifest,
        error.source ? error.message : error.reason,
      )
    : analysisGap(
        snapshot,
        '<external dependency evidence>',
        error instanceof Error ? error.message : String(error),
      );
}

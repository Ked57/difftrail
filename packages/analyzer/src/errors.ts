import type { Snapshot } from '@difftrail/git';

export function analysisGap(
  snapshot: Snapshot,
  file: string,
  reason: string,
): Error {
  return new Error(
    `Analysis gap in ${file} at ${snapshot.revision ?? 'empty base'}: ${reason}`,
  );
}

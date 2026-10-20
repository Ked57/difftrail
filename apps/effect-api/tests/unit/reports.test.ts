import { Effect } from 'effect';
import { expect, test } from 'vitest';
import { loadReports } from '../../src/effects/reports.js';

test('formats dashboard report metrics with the shared formatter', async () => {
  await expect(Effect.runPromise(loadReports)).resolves.toEqual([
    { label: 'Files in scope', display: '8' },
    { label: 'Connected packages', display: '4' },
    { label: 'Open reviews', display: '1.3' },
  ]);
});

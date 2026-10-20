import { Effect } from 'effect';
import { expect, test } from 'vitest';
import { decideEmail } from '../../src/effects/settings.js';

test('accepts a settings email that includes @', async () => {
  await expect(
    Effect.runPromise(decideEmail('ada@difftrail.dev')),
  ).resolves.toEqual({
    email: 'ada@difftrail.dev',
  });
});

test('rejects a settings value that omits @', async () => {
  await expect(Effect.runPromise(decideEmail('ada'))).resolves.toEqual({
    error: 'Enter an email address.',
  });
});

test('rejects an empty settings email', async () => {
  await expect(Effect.runPromise(decideEmail(''))).resolves.toEqual({
    error: 'Enter an email address.',
  });
});

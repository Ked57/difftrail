import { expect, test } from 'vitest';
import { app } from '../../src/app.js';

test('returns formatted report metrics', async () => {
  const response = await app.handle(new Request('http://localhost/reports'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    { label: 'Files in scope', display: '8' },
    { label: 'Connected packages', display: '4' },
    { label: 'Open reviews', display: '1.3' },
  ]);
});

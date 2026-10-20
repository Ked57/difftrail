import { expect, test } from 'vitest';
import { app } from '../../src/app.js';

test('reports that the effect API is up', async () => {
  const response = await app.handle(new Request('http://localhost/health'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

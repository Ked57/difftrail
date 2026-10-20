import { expect, test } from 'vitest';
import { app } from '../../src/app.js';

function postSettings(body: unknown): Promise<Response> {
  return app.handle(
    new Request('http://localhost/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

test('stores a settings email that includes @', async () => {
  const response = await postSettings({ email: 'ada@difftrail.dev' });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ email: 'ada@difftrail.dev' });
});

test('returns the settings email error when @ is missing', async () => {
  const response = await postSettings({ email: 'ada' });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Enter an email address.' });
});

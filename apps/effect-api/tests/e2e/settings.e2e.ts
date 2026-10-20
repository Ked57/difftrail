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

test('rejects a settings body that is not an object', async () => {
  const response = await postSettings(null);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Enter an email address.' });
});

test('rejects a numeric settings body', async () => {
  const response = await postSettings(12);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Enter an email address.' });
});

test('rejects a settings body without an email', async () => {
  const response = await postSettings({});
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Enter an email address.' });
});

test('rejects a settings email that is not text', async () => {
  const response = await postSettings({ email: 12 });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Enter an email address.' });
});

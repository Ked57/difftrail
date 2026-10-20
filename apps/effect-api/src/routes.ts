import { Effect } from 'effect';
import { Elysia } from 'elysia';
import { loadReports } from './effects/reports.js';
import { decideEmail } from './effects/settings.js';

/** HTTP routes for the dashboard API. */
function readEmail(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('email' in body)) {
    return '';
  }
  const email = body.email;
  return typeof email === 'string' ? email : '';
}

export const routes = new Elysia()
  .get('/health', () => ({ ok: true }))
  .get('/reports', () => Effect.runPromise(loadReports))
  .post('/settings', async ({ body, set }) => {
    const decision = await Effect.runPromise(decideEmail(readEmail(body)));
    if ('error' in decision) set.status = 400;
    return decision;
  });

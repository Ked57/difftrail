import { expect, test } from 'vitest';
import { createExampleRouter } from '../../src/router.js';

test('registers dashboard, reports, and settings routes', () => {
  const router = createExampleRouter();
  expect(
    router
      .getRoutes()
      .map((route) => route.path)
      .sort(),
  ).toEqual(['/', '/reports', '/settings']);
});

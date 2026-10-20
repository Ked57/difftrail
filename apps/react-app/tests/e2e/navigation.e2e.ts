import { expect, test } from 'vitest';
import { createExampleRouter } from '../../src/router.js';

test('registers dashboard, reports, and settings routes', () => {
  const router = createExampleRouter();
  expect(
    router.routesByPath
      ? Object.keys(router.routesByPath)
          .filter((path) => path !== '')
          .sort()
      : [],
  ).toEqual(['/', '/reports', '/settings']);
});

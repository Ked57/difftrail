import { expect, test } from 'vitest';
import { dashboardSummary } from '../../src/utils/dashboard-summary.js';

test('reports a two-digit dashboard file count', () => {
  expect(dashboardSummary.files).toMatch(/^\d{2}$/);
});

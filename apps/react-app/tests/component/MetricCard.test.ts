import { expect, test } from 'vitest';
import { MetricCard } from '../../src/components/MetricCard.js';

test('exposes the metric card component', () => {
  expect(typeof MetricCard).toBe('function');
  expect(MetricCard).toBeTruthy();
});

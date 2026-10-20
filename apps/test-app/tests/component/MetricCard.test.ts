import { expect, test } from 'vitest';
import MetricCard from '../../src/components/MetricCard.vue';

test('exposes the metric card component', () => {
  expect(typeof MetricCard).toBe('object');
  expect(MetricCard).toBeTruthy();
});

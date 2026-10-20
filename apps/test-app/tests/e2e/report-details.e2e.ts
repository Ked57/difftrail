import { expect, test } from 'vitest';
import ReportDetails from '../../src/components/ReportDetails.vue';

test('loads the lazy report details panel', () => {
  expect(typeof ReportDetails).toBe('object');
  expect(ReportDetails).toBeTruthy();
});

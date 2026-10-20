import { expect, test } from 'vitest';
import {
  ReportDetails,
  reportHeading,
} from '../../src/components/ReportDetails.js';

test('loads the lazy report details panel', () => {
  expect(typeof ReportDetails).toBe('function');
  expect(ReportDetails).toBeTruthy();
  expect(reportHeading).toBe('Report details');
});

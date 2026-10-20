import { expect, test } from 'vitest';
import { describeMode } from '../../src/utils/settings-mode.js';

test('describes strict and relaxed analysis differently', () => {
  const strict = describeMode(true);
  const relaxed = describeMode(false);
  expect(strict).not.toBe(relaxed);
  expect(strict.length).toBeGreaterThan(0);
  expect(relaxed.length).toBeGreaterThan(0);
});

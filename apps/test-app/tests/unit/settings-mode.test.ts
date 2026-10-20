import { expect, test } from 'vitest';
import { describeMode } from '../../src/utils/settings-mode.js';
import { settingsError } from '../../src/utils/settings-form.js';

test('describes strict and lenient analysis', () => {
  expect(describeMode(true)).toBe('Detected analysis gaps stop the run.');
  expect(describeMode(false)).toBe(
    'Use strict mode to make incomplete evidence visible.',
  );
});

test('requires an email address before settings are saved', () => {
  expect(settingsError('')).toBe('Enter an email address.');
  expect(settingsError('person@example.invalid')).toBeUndefined();
});

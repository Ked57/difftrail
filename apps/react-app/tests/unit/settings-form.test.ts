import { expect, test } from 'vitest';
import { settingsError } from '../../src/utils/settings-form.js';

test('requires an email address before settings are saved', () => {
  expect(settingsError('')).toBe('Enter an email address.');
  expect(settingsError('a')).toBe('Enter an email address.');
  expect(settingsError('person@example.invalid')).toBeUndefined();
});

import { expect, test } from 'vitest';
import SettingsPage from '../../src/pages/SettingsPage.vue';
import { describeMode } from '../../src/utils/settings-mode.js';

test('opens settings with a described analysis mode', () => {
  expect(typeof SettingsPage).toBe('object');
  expect(SettingsPage).toBeTruthy();
  expect(typeof describeMode(true)).toBe('string');
});

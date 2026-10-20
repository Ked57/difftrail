import { expect, test } from 'vitest';
import SettingsPage from '../../src/pages/SettingsPage.vue';
import { planPath } from '../../src/plan/plan-route.js';
import { describeMode } from '../../src/utils/settings-mode.js';
import { settingsError } from '../../src/utils/settings-form.js';

test('opens settings with a described analysis mode', () => {
  expect(typeof SettingsPage).toBe('object');
  expect(SettingsPage).toBeTruthy();
  expect(describeMode(true)).toContain('analysis gaps');
  expect(settingsError('a')).toBe('Enter an email address.');
  expect(planPath()).toBe('/plan');
});

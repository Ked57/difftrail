import { expect, test } from 'vitest';
import { SettingsPage } from '../../src/pages/SettingsPage.js';
import { planPath } from '../../src/plan/plan-route.js';
import { settingsError } from '../../src/utils/settings-form.js';

test('opens settings with a form error and a plan path', () => {
  expect(typeof SettingsPage).toBe('function');
  expect(SettingsPage).toBeTruthy();
  expect(settingsError('a')).toBe('Enter an email address.');
  expect(planPath()).toBe('/plan');
});

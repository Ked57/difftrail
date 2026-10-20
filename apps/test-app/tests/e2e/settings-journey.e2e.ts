import assert from 'node:assert';
import SettingsPage from '../../src/pages/SettingsPage.vue';
import { describeMode } from '../../src/utils/settings-mode.js';

assert.equal(typeof SettingsPage, 'object');
assert.ok(SettingsPage);
assert.equal(typeof describeMode(true), 'string');

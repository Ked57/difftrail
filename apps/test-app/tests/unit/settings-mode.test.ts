import assert from 'node:assert';
import { describeMode } from '../../src/utils/settings-mode.js';

const strict = describeMode(true);
const relaxed = describeMode(false);
assert.notEqual(strict, relaxed);
assert.ok(strict.length > 0);
assert.ok(relaxed.length > 0);

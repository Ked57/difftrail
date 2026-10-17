import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { cruise } from 'dependency-cruiser';
import { parse as parseSfc } from '@vue/compiler-sfc';
import ts from 'typescript';
const baseDir = process.argv[2];
assert.ok(baseDir);
assert.equal(ts.version, '6.0.3');
const sfcManifest = JSON.parse(
  await readFile(
    new URL('./node_modules/@vue/compiler-sfc/package.json', import.meta.url),
    'utf8',
  ),
);
assert.equal(sfcManifest.version, '3.5.44');
const sfc = parseSfc(
  '<template><img src="./image.png" /></template><script setup lang="ts">import type {Shape} from "./shape";</script>',
  { filename: 'Component.vue' },
);
assert.equal(sfc.errors.length, 0);
assert.ok(sfc.descriptor.scriptSetup);
const { output } = await cruise(['typed.ts', 'types.ts'], {
  baseDir,
  tsPreCompilationDeps: true,
  doNotFollow: { path: '.*' },
});
assert.ok(typeof output !== 'string');
assert.ok(
  output.modules.some(
    (module) =>
      module.source === 'typed.ts' &&
      module.dependencies.some(
        (dependency) =>
          dependency.module === './types' &&
          dependency.dependencyTypes.includes('type-only'),
      ),
  ),
  JSON.stringify(output),
);

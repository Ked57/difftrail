import assert from 'node:assert/strict';
import { cruise } from 'dependency-cruiser';
import ts from 'typescript';
const baseDir = process.argv[2];
assert.ok(baseDir);
assert.equal(ts.version, '6.0.3');
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

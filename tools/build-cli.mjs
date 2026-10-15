import { build } from 'esbuild';
import { chmod, copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['dependency-cruiser', 'typescript'],
  banner: { js: '#!/usr/bin/env node' },
});
await chmod('dist/cli.js', 0o755);
await copyFile('../../LICENSE', 'LICENSE');

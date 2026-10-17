import { build } from 'esbuild';
import { chmod, copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: [
    '@vue/compiler-sfc',
    'dependency-cruiser',
    'enhanced-resolve/lib/createInnerCallback',
    'typescript',
  ],
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire } from "node:module";',
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
});
await chmod('dist/cli.js', 0o755);
await copyFile('../../LICENSE', 'LICENSE');

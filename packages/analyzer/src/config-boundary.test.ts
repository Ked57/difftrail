import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'vitest';
import { repository } from '../../../tests/helpers.js';
import { withComparison } from '@difftrail/git';
import { extractGraph } from './index.js';

test('rejects config include paths outside the committed snapshot', async () => {
  const repo = await repository({
    'tsconfig.json': '{}',
    'src/entry.ts': 'export const value = 1;',
  });
  const outside = await mkdtemp(join(tmpdir(), 'difftrail-config-outside-'));
  try {
    await writeFile(join(outside, 'host-only.ts'), 'export const host = true;');
    const head = await repo.commit({
      'tsconfig.json': JSON.stringify({
        include: [join(outside, '**/*.ts')],
      }),
    });
    await withComparison(repo.root, async (comparison) => {
      await expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        new RegExp(
          `Analysis gap in src/entry\\.ts at ${head}.*tsconfig\\.json.*include`,
        ),
      );
    });
  } finally {
    await rm(outside, { recursive: true, force: true });
    await repo.cleanup();
  }
});

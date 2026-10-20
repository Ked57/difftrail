import { defineConfig, mergeConfig } from 'vite';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts', 'tests/**/*.e2e.ts'],
      environment: 'node',
    },
  }),
);

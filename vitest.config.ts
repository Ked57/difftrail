import { withCrapTypescriptVitest } from '@barney-media/crap-typescript-vitest';
export default withCrapTypescriptVitest(
  {
    test: {
      include: ['packages/**/*.test.ts'],
      coverage: {
        include: ['packages/core/src/**/*.ts'],
        thresholds: {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
  { threshold: 25 },
);

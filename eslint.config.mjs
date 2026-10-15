import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import qualityMetrics from 'quality-metrics';
export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      '.turbo/**',
      'reports/**',
      '.stryker-tmp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: { sonarjs, 'quality-metrics': qualityMetrics },
    rules: {
      complexity: ['error', 21],
      'sonarjs/cognitive-complexity': ['error', 21],
      'quality-metrics/halstead': [
        'error',
        { maxVolume: 1500, maxEffort: 50000 },
      ],
      'max-lines': [
        'error',
        { max: 499, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'error',
        { max: 99, skipBlankLines: true, skipComments: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
];

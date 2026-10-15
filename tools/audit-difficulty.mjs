import { ESLint } from 'eslint';
const eslint = new ESLint({
  overrideConfig: [
    {
      files: ['**/*.ts'],
      rules: {
        'quality-metrics/halstead': ['error', { maxVolume: 0, maxEffort: 0 }],
      },
    },
  ],
});
const results = await eslint.lintFiles(
  process.argv.slice(2).length
    ? process.argv.slice(2)
    : ['packages/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
);
let maximum = 0;
let failed = false;
for (const result of results) {
  for (const message of result.messages) {
    if (message.ruleId !== 'quality-metrics/halstead') continue;
    const match = /Difficulty: ([\d.]+)/.exec(message.message);
    if (!match) throw new Error('Halstead diagnostic omitted Difficulty');
    const difficulty = Number(match[1]);
    maximum = Math.max(maximum, difficulty);
    if (difficulty >= 80) {
      console.error(
        `${result.filePath}:${message.line}: Difficulty ${difficulty} must be below 80`,
      );
      failed = true;
    }
  }
}
console.log(`Halstead Difficulty maximum ${maximum}; required <80`);
if (failed) process.exitCode = 1;

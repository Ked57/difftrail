/** Copy for the strict-analysis preference. */
export function describeMode(strict: boolean): string {
  return strict
    ? 'Detected analysis gaps stop the run.'
    : 'Use strict mode to make incomplete evidence visible.';
}

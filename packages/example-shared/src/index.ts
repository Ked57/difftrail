export function formatMetric(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(
    value,
  );
}

export function greetingFor(name: string): string {
  return `Welcome back, ${name}.`;
}

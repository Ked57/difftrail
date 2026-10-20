import { Effect } from 'effect';
import { formatMetric } from '@difftrail/example-shared';
import type { ReportMetric } from '@difftrail/example-shared/report-types';

export interface FormattedMetric {
  readonly label: string;
  readonly display: string;
}

/** Formats dashboard report metrics. */
function reportMetrics(): readonly ReportMetric[] {
  return [
    { label: 'Files in scope', value: 8 },
    { label: 'Connected packages', value: 4 },
    { label: 'Open reviews', value: 1.25 },
  ];
}

function formatReports(
  metrics: readonly ReportMetric[],
): readonly FormattedMetric[] {
  return metrics.map((metric) => ({
    label: metric.label,
    display: formatMetric(metric.value),
  }));
}

/** Loads formatted report metrics for the dashboard. */
export const loadReports: Effect.Effect<readonly FormattedMetric[]> =
  Effect.gen(function* () {
    const metrics = yield* Effect.succeed(reportMetrics());
    return formatReports(metrics);
  });

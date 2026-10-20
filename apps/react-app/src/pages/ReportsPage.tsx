import { formatMetric } from '@difftrail/example-shared';
import type { ReportMetric } from '@difftrail/example-shared/report-types';
import { MetricCard } from '../components/MetricCard.js';

const metrics: readonly ReportMetric[] = [
  { label: 'Dependencies found', value: 24 },
  { label: 'Files in scope', value: 8 },
];

export function ReportsPage() {
  return (
    <section>
      <p className="eyebrow">Repository analysis</p>
      <h1>Reports</h1>
      <p className="lead">
        Review the relationship counts from a committed comparison.
      </p>
      <section className="report-grid" aria-label="Report metrics">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={formatMetric(metric.value)}
            detail="Current example snapshot"
          />
        ))}
      </section>
    </section>
  );
}

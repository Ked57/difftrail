import { useState, type ReactElement } from 'react';
import { GreetingCard } from '../components/GreetingCard.js';
import { MetricCard } from '../components/MetricCard.js';
import { ScopeNote } from '../components/ScopeNote.js';
import { dashboardSummary } from '../utils/dashboard-summary.js';

export function DashboardPage() {
  const [Detail, setDetail] = useState<(() => ReactElement) | undefined>();

  async function loadReportDetails(): Promise<void> {
    const report = await import('../components/ReportDetails.js');
    setDetail(() => report.ReportDetails);
  }

  return (
    <section>
      <p className="eyebrow">Monday, October 12, 2026</p>
      <h1>Dashboard</h1>
      <p className="lead">
        A clear view of the work connected to your repository.
      </p>
      <GreetingCard />
      <ScopeNote />
      <section className="metric-grid" aria-label="Repository summary">
        <MetricCard
          label="Files in scope"
          value={dashboardSummary.files}
          detail="Across the latest change"
        />
        <MetricCard
          label="Connected packages"
          value="04"
          detail="Including shared workspace code"
        />
      </section>
      <button type="button" onClick={() => void loadReportDetails()}>
        Load report details
      </button>
      {Detail ? (
        <div className="report-note" aria-live="polite">
          <Detail />
        </div>
      ) : null}
    </section>
  );
}

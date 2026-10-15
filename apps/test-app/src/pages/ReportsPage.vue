<script setup lang="ts">
import { formatMetric } from '@difftrail/example-shared';
import MetricCard from '../components/MetricCard.vue';
import type { ReportMetric } from '@models';

const metrics: readonly ReportMetric[] = [
  { label: 'Dependencies found', value: 24 },
  { label: 'Files in scope', value: 8 },
];
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">Repository analysis</p>
    <h1>Reports</h1>
    <p class="lead">
      Review the relationship counts from a committed comparison.
    </p>
  </section>
  <AutoBadge>Static analysis</AutoBadge>
  <img
    class="report-art"
    src="../assets/dashboard.svg"
    alt="Connected report data"
  />
  <section class="report-grid" aria-label="Report metrics">
    <MetricCard
      v-for="metric in metrics"
      :key="metric.label"
      :label="metric.label"
      :value="formatMetric(metric.value)"
      detail="Current example snapshot"
    />
  </section>
</template>

<style scoped>
.page-heading {
  margin-bottom: 1.5rem;
}
.page-heading h1 {
  margin: 0.2rem 0;
  font-size: clamp(2rem, 5vw, 3rem);
  letter-spacing: -0.05em;
}
.lead {
  color: #667282;
}
.report-art {
  display: block;
  width: 72px;
  height: auto;
  margin: 1rem 0;
}
.report-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}
@media (max-width: 620px) {
  .report-grid {
    grid-template-columns: 1fr;
  }
}
</style>

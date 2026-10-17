<script setup lang="ts">
import { shallowRef, type Component } from 'vue';
import GreetingCard from '../components/GreetingCard.vue';
import MetricCard from '../components/MetricCard.vue';
import { dashboardSummary } from '@/utils/dashboard-summary.js';

const detail = shallowRef<Component>();

async function loadReportDetails(): Promise<void> {
  const report = await import('@/components/ReportDetails.vue');
  detail.value = report.default;
}
</script>

<template>
  <section class="intro-row">
    <div>
      <p class="eyebrow">Monday, October 12, 2026</p>
      <h1>Dashboard</h1>
      <p class="lead">A clear view of the work connected to your repository.</p>
    </div>
    <img
      class="dashboard-art"
      src="../assets/dashboard.svg"
      alt="A connected set of file nodes"
    />
  </section>
  <GreetingCard />
  <section class="metric-grid" aria-label="Repository summary">
    <MetricCard
      label="Files in scope"
      :value="dashboardSummary.files"
      detail="Across the latest change"
    />
    <MetricCard
      label="Connected packages"
      value="04"
      detail="Including shared workspace code"
    />
    <MetricCard
      label="Independent pages"
      value="01"
      detail="Ready to stay out of the run"
    />
  </section>
  <section class="preview-box">
    <div>
      <h2>Latest report</h2>
      <p>
        Open the lazy-loaded details panel to see another literal module
        relationship.
      </p>
    </div>
    <button type="button" @click="loadReportDetails">
      Load report details
    </button>
    <div v-if="detail" class="report-note" aria-live="polite">
      <component :is="detail" />
    </div>
  </section>
</template>

<style scoped>
.intro-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 1.5rem;
}
.intro-row h1 {
  margin: 0.25rem 0;
  font-size: clamp(2rem, 5vw, 3rem);
  letter-spacing: -0.05em;
}
.lead {
  color: #667282;
}
.dashboard-art {
  width: 136px;
  height: 112px;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin: 1.25rem 0;
}
.preview-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  border-radius: 0.9rem;
  background: #1b2838;
  color: #fff;
}
.preview-box h2,
.preview-box p {
  margin: 0.25rem 0;
}
.preview-box p {
  color: #c0cad4;
}
.preview-box button {
  flex: 0 0 auto;
  border: 0;
  border-radius: 0.5rem;
  padding: 0.7rem 0.9rem;
  color: #1b2838;
  background: #d7f1e7;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.report-note {
  color: #d7f1e7 !important;
}
@media (max-width: 680px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }
  .dashboard-art {
    width: 84px;
  }
  .preview-box {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

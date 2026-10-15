<script setup lang="ts">
import { computed } from 'vue';
import DashboardPage from './pages/DashboardPage.vue';
import ReportsPage from './pages/ReportsPage.vue';
import SettingsPage from './pages/SettingsPage.vue';

const pages = {
  '/': DashboardPage,
  '/reports': ReportsPage,
  '/settings': SettingsPage,
} as const;
const currentPath = window.location.pathname;
const currentPage = computed(
  () => pages[currentPath as keyof typeof pages] ?? DashboardPage,
);
</script>

<template>
  <div class="app-frame">
    <header class="topbar">
      <a class="brand" href="/" aria-label="Difftrail Example home">
        <span class="brand-mark" aria-hidden="true">D</span>
        <span>Difftrail <span class="brand-light">Example</span></span>
      </a>
      <nav aria-label="Main navigation">
        <a href="/" :aria-current="currentPath === '/' ? 'page' : undefined"
          >Dashboard</a
        >
        <a
          href="/reports"
          :aria-current="currentPath === '/reports' ? 'page' : undefined"
          >Reports</a
        >
        <a
          href="/settings"
          :aria-current="currentPath === '/settings' ? 'page' : undefined"
          >Settings</a
        >
      </nav>
    </header>
    <main class="page-wrap"><component :is="currentPage" /></main>
    <footer>
      Three routes, shared modules, and committed source relationships.
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();
const currentPath = computed(() => route.path);
</script>

<template>
  <div class="app-frame">
    <header class="topbar">
      <RouterLink class="brand" to="/" aria-label="Difftrail Example home">
        <span class="brand-mark" aria-hidden="true">D</span>
        <span>Difftrail <span class="brand-light">Example</span></span>
      </RouterLink>
      <nav aria-label="Main navigation">
        <RouterLink
          to="/"
          :aria-current="currentPath === '/' ? 'page' : undefined"
          >Dashboard</RouterLink
        >
        <RouterLink
          to="/reports"
          :aria-current="currentPath === '/reports' ? 'page' : undefined"
          >Reports</RouterLink
        >
        <RouterLink
          to="/settings"
          :aria-current="currentPath === '/settings' ? 'page' : undefined"
          >Settings</RouterLink
        >
      </nav>
    </header>
    <main class="page-wrap"><RouterView /></main>
    <footer>
      Three routes, shared modules, and committed source relationships.
    </footer>
  </div>
</template>

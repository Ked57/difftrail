<script setup lang="ts">
defineProps<{ label: string; value: string; detail: string }>();
</script>

<template>
  <article class="metric-card">
    <p>{{ label }}</p>
    <strong>{{ value }}</strong>
    <small>{{ detail }}</small>
  </article>
</template>

<style scoped>
.metric-card {
  display: grid;
  gap: 0.65rem;
  padding: 1.25rem;
  border: 1px solid #dce3e9;
  border-radius: 0.9rem;
  background: #fff;
}
.metric-card p,
.metric-card small {
  margin: 0;
  color: #667282;
}
.metric-card strong {
  font-size: 1.8rem;
  letter-spacing: -0.04em;
}
</style>

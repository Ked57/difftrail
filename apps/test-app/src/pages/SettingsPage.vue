<script setup lang="ts">
import { computed, ref } from 'vue';
import { describeMode } from '../utils/settings-mode.js';

const strictMode = ref(true);
const modeDescription = computed(() => describeMode(strictMode.value));
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">Personal preferences</p>
    <h1>Settings</h1>
    <p class="lead">
      This page has its own small utility and stays independent from report
      data.
    </p>
  </section>
  <label class="setting-row">
    <span
      ><strong>Strict analysis</strong
      ><small>{{ modeDescription }}</small></span
    >
    <input v-model="strictMode" type="checkbox" />
  </label>
</template>

<style scoped>
.page-heading h1 {
  margin: 0.2rem 0;
  font-size: clamp(2rem, 5vw, 3rem);
  letter-spacing: -0.05em;
}
.lead {
  color: #667282;
}
.setting-row {
  display: flex;
  max-width: 42rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem;
  border: 1px solid #dce3e9;
  border-radius: 0.8rem;
  background: #fff;
}
.setting-row span {
  display: grid;
  gap: 0.3rem;
}
.setting-row small {
  color: #667282;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { planPath } from '../plan/plan-route.js';
import { settingsError } from '../utils/settings-form.js';
import { describeMode } from '../utils/settings-mode.js';

const strictMode = ref(true);
const modeDescription = computed(() => describeMode(strictMode.value));
const email = ref('');
const emailError = computed(() =>
  email.value ? settingsError(email.value) : undefined,
);
const saved = ref(false);
const { handleSubmit } = useForm();
const submit = handleSubmit(() => {
  saved.value = true;
});
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
  <form class="setting-row" @submit.prevent="submit">
    <span>
      <strong>Notification email</strong>
      <small>{{ emailError ?? planPath() }}</small>
    </span>
    <input v-model="email" type="email" name="email" />
    <button type="submit">{{ saved ? 'Saved' : 'Save' }}</button>
  </form>
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
  margin-top: 1rem;
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
.setting-row button {
  border: 0;
  border-radius: 0.5rem;
  padding: 0.7rem 0.9rem;
  color: #1b2838;
  background: #d7f1e7;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
</style>

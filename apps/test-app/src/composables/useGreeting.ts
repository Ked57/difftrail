import { computed, ref } from 'vue';
import { greetingFor } from '@difftrail/example-shared';

export function useGreeting(initialName = 'Alex') {
  const name = ref(initialName);
  const greeting = computed(() => greetingFor(name.value));
  return { name, greeting };
}

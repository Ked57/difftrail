import { useGreeting } from '../composables/useGreeting';

export default {
  name: 'GreetingCard',
  setup() {
    return useGreeting('Alex');
  },
};

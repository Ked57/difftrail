import { greetingFor } from '@difftrail/example-shared';

export default {
  name: 'GreetingCard',
  data() {
    return { greeting: greetingFor('Alex') };
  },
};

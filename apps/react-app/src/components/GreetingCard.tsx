import { greetingFor } from '@difftrail/example-shared';

export function GreetingCard() {
  return <p className="greeting">{greetingFor('Alex')}</p>;
}

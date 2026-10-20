import { useState } from 'react';
import { planPath } from '../plan/plan-route.js';
import { settingsError } from '../utils/settings-form.js';

export function SettingsPage() {
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const { handleSubmit } = useForm<{ email: string }>({
    defaultValues: { email: '' },
  });
  const error = email ? settingsError(email) : undefined;
  const submit = handleSubmit(() => {
    setSaved(true);
  });

  return (
    <section>
      <p className="eyebrow">Personal preferences</p>
      <h1>Settings</h1>
      <p className="lead">
        This page has its own small utility and stays independent from report
        data.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          <strong>Notification email</strong>
          <small>{error ?? planPath()}</small>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button type="submit">{saved ? 'Saved' : 'Save'}</button>
      </form>
    </section>
  );
}

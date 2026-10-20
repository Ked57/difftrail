/** Validates the settings email before vee-validate submits it. */
export function settingsError(email: string): string | undefined {
  if (email.includes('@')) return undefined;
  return 'Enter an email address.';
}

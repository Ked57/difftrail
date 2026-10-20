/** Validates the settings email before react-hook-form submits it. */
export function settingsError(email: string): string | undefined {
  if (email.includes('@')) return undefined;
  return 'Enter an email address.';
}

import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '../pages/SettingsPage.js';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

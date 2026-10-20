import { createFileRoute } from '@tanstack/react-router';
import { ReportsPage } from '../pages/ReportsPage.js';

export const Route = createFileRoute('/reports')({
  component: ReportsPage,
});

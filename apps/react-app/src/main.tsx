import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { createBrowserRouter } from './router.js';
import './styles/tailwind.css';
import './styles/base.css';

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Missing #app');

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter()} />
  </StrictMode>,
);

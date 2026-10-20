import {
  createMemoryHistory,
  createRouter,
  createWebHistory,
  type Router,
  type RouterHistory,
} from 'vue-router';
import { routes } from 'vue-router/auto-routes';

export function createExampleRouter(
  history: RouterHistory = createMemoryHistory(),
): Router {
  return createRouter({ history, routes });
}

export function createBrowserRouter(): Router {
  return createExampleRouter(createWebHistory());
}

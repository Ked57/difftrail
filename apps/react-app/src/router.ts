import {
  createBrowserHistory,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.js';

export function createExampleRouter(history = createMemoryHistory()) {
  return createRouter({ routeTree, history });
}

export function createBrowserRouter() {
  return createExampleRouter(createBrowserHistory());
}

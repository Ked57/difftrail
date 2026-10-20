import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

const root = createRootRoute();
const plan = createRoute({ getParentRoute: () => root, path: '/plan' });
const tree = root.addChildren([plan]);

export function planPath(): string {
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/plan'] }),
  });
  return router.state.location.pathname;
}

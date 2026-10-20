import { routes } from './routes.js';

/** Elysia app with no listening socket, so tests can call `app.handle`. */
export const app = routes;

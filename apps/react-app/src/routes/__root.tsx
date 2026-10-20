import { Link, Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: function RootLayout() {
    return (
      <div className="app-frame">
        <header className="topbar">
          <Link className="brand" to="/" aria-label="Difftrail Example home">
            <span className="brand-mark" aria-hidden="true">
              D
            </span>
            <span>
              Difftrail <span className="brand-light">Example</span>
            </span>
          </Link>
          <nav aria-label="Main navigation">
            <Link to="/">Dashboard</Link>
            <Link to="/reports">Reports</Link>
            <Link to="/settings">Settings</Link>
          </nav>
        </header>
        <main className="page-wrap">
          <Outlet />
        </main>
        <footer>
          Three routes, shared modules, and committed source relationships.
        </footer>
      </div>
    );
  },
});

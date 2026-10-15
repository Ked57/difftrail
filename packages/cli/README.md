# Difftrail

Find committed files that depend on the latest commit's changes.

```sh
npm install --save-dev difftrail
npx difftrail
npx difftrail --json
```

Requires Git and Node 22.13+ or Node 24. The current foundation release supports static JavaScript imports and CommonJS in committed snapshots. Required unsupported syntax or unresolved dependencies fail with status 1 and no stdout. TypeScript, Vue, workspace resolution and advanced flags are delivered by the following implementation tickets.

Default output is sorted repository-relative existing impacted files, one per line. JSON adds `root`, resolved `base`/`head`, `scope: "static"`, `files` and `removed`. The CLI does not run tests or replace required checks. It never checks out a revision or runs project scripts.

Node `createRequire` is recognized through direct `node:module` / `module` imports and direct factory result bindings. A loader based on the owning `import.meta.url` retains its static dependencies, including a loader with a different identifier name. Recognized factory bases or indirect factory uses that cannot be established statically fail with a diagnostic; the CLI does not guess their resolution base. Ordinary application helpers named `require` or `createRequire` are not treated as Node loaders.

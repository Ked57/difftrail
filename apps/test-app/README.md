# Difftrail example app

This three-page Vue application exercises ordinary and setup scripts, local aliases, a shared workspace package, type-only re-exports, a literal dynamic import, CSS and template assets, external SFC blocks, and statically generated component auto-import metadata.

From the repository root, install the workspace and run the app:

```sh
pnpm install --frozen-lockfile
pnpm --filter @difftrail/test-app dev
```

Open the local Vite URL, then use Dashboard, Reports, and Settings in the top navigation. Build the production assets with `pnpm --filter @difftrail/test-app build`. The Vite component plugin writes `components.d.ts`; the committed file is the static mapping used by historical analysis.

Run the real-Git CLI acceptance scenarios from the root with `pnpm test:example-history`. They create disposable full-workspace clones and exercise shared utility, page-only, asset, alias, and auto-import mapping commits, plus isolated deletion, rename, and invalid-source histories. The fixture calls the already-built CLI; it does not run setup commands from inside Difftrail.

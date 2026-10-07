# Website

`apps/site` is the Astro site served at https://pruftnet.app. It is dark only and reuses the application's dark tokens from `@repo/ui/styles.css`; `src/styles/site.css` only deepens the page canvas so product screenshots stand out, and feature visuals sit in `.panel` containers. Shortcuts shown on the landing come from the `@repo/shared/app-command` catalogue.

## Rendering

Pages are prerendered except `/downloads`, which renders per request through the Node adapter (standalone). Production builds bundle every dependency into `dist/server/entry.mjs`; the runtime image contains only `dist/`. `/archive` reproduces the 0.1 landing with its orange theme scoped to `.archive` and is excluded from indexing and the sitemap. `/doc` redirects to the README install section.

Each page passes its 1200 × 630 share image from `src/assets/og` to `BaseLayout` (Open Graph and Twitter tags with alt text); the home page also emits `SoftwareApplication` JSON-LD. The share images are static renders of the landing typography and screenshots: regenerate them when the headline, logo or screenshots change.

## Release catalog

`src/releases/catalog.ts` reads three GitHub releases: `releases/latest` (stable), the newest `-nightly.` prerelease, and the fixed `v0.1.2` tag of the archived generation. Results are cached for 15 minutes; concurrent requests share one refresh and a failed refresh serves the previous snapshot marked stale. Set `GITHUB_TOKEN` to raise the API rate limit. Asset names are parsed against the patterns produced by `scripts/distribution/package.mjs`; change both together. Checksums come from the API `digest` field.

## Published figures

`src/content/benchmarks.ts` holds every performance number on the landing, rounded down from the slowest of three Release runs, with the machine named. Re-measure before changing it: the C++ benchmarks build with `-DPRUFTNET_SNIFFING_BUILD_BENCHMARKS=ON`; the end-to-end figure replays a large synthetic pcap through `ReplayWorker`. Screenshots in `src/assets/screenshots` must only show synthetic traffic (documentation address ranges, `example.*` domains), never real captures. The capture settings and statistics panels are HTML reproductions of the application's dialogs; the statistics run `src/simulation/capture-stats.ts`, a model of the capture ledger whose conservation equations must always balance, as in the application.

## Deployment

Dokploy builds `apps/site/Dockerfile` with the repository root as context from `main`, limited to changes under `apps/site`, `packages/{ui,utils,shared}` and `pnpm-lock.yaml`. The container listens on port 4321. `pruftnet.app` is canonical; `www` redirects to it.

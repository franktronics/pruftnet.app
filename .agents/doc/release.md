# Release process

## Branches and versions

- `main`: principal beta release, starting at `0.2.0`.
- `dev`: integration branch. Work in `feat/*` branches and merge PRs into `dev`.
- `dev-archive`: committed state of the old main plus an archive README notice.

Root, desktop and server package versions identify the next principal release. Update them together before promotion. Patch versions fix bugs; minor versions introduce features or breaking beta changes. Existing `v0.1.*` tags remain historical.

## CI and publication

PRs and pushes to `dev`/`main` validate types, lint, tests and packaging. A merged PR into `dev` publishes `0.x.y-nightly.YYYYMMDD.RUN` with an immutable commit and tag. Closed unmerged PRs and ordinary dev pushes never publish. There is no schedule.

A `v0.x.y` tag whose commit belongs to `main` publishes the principal release. The tag must match package.json. All five build targets must succeed before a draft release is uploaded and made public. Nightlies are GitHub prereleases and never replace Latest.

Standard public GitHub runners: Ubuntu 24.04 x64/ARM64, macOS 15 Intel/Apple Silicon, Windows 2025 x64. Node is pinned in `.node-version`; downloadable server runtimes have checked-in SHA-256 digests. Native C++ builds use the system macOS SDK, Linux libpcap or the pinned Windows Npcap SDK.

Native tests and replay fixtures run on Linux/macOS. Windows compiles all tests but executes only the driver-independent protocol test; capture requires a separately installed Npcap. Relocated server and packaged desktop startup are smoke-tested. Physical interfaces and permissions require real-machine release checks.

## Package repositories

After release, `repositories.yml` regenerates the Homebrew tap and an APT repository containing the newest main and nightly packages. GitHub Pages hosts the APT repository. The manual workflow can retry repository publication without republishing binaries.

Required secrets in the application repository:

- `APT_SIGNING_KEY`: armored private repository signing key. Rotate before its expiration and publish the new public key before switching signing.
- `HOMEBREW_DEPLOY_KEY`: SSH key with write access only to `franktronics/homebrew-pruftnet`.

GitHub Pages must use Actions deployment. No general-purpose PAT is stored in the workflow. Do not expose signing keys to unmerged PR builds.

## Builds

`pnpm build` builds both distributions. `pnpm package:server` and `pnpm package:desktop` build one distribution. Outputs are in `release/`. Use `PRUFTNET_VERSION` for a nightly build; channel identity follows the version. `pnpm test:distribution` checks release identity validation.

Initial macOS releases are ad-hoc signed and not notarized. Windows releases are unsigned. Developer ID, Windows signing and in-app updates are deferred. Installation and capture permissions are documented in [installation.md](installation.md).

# Server CLI

`apps/server/src/main.ts` runs an `@effect/cli` app; commands live in `src/cli/`. Commands that
need settings share `settingOptions` and `loadSettings`.

## Settings

- `src/settings/settings.ts` is the only resolver: flag > `PRUFTNET_*` environment > JSON file >
  default. Every value keeps its source for `config show`. Add a setting to its definition table.
- The file comes from `--config`, `PRUFTNET_CONFIG`, or the per-user default (`config path`).
  Unknown keys are errors; a relative `dataDir` is resolved from the file's directory.
- `--log-level` is reserved by `@effect/cli`: `main.ts` strips it and provides `LogLevelFlag`.
- `RuntimePaths` is install layout, not configuration. Pass `dataRoot` and `captureWorkerPath` to
  core explicitly; never communicate through `process.env`.
- The host stays loopback-only until the capture API is authenticated.

## Errors

Expected failures are `CliError` with an exit code (0 success, 1 failure, 2 usage or configuration,
3 port unavailable) and an optional hint. Other failures print the full cause.

## Packaging

- Debian templates are in `apps/server/packaging/linux` (`@PACKAGE@`, `@COMMAND@`, `@NAME@`,
  `@PORT@`). The unit runs as `pruftnet`, never root, with `/etc/<package>/server.json`.
- Capture privileges are file capabilities on the worker, which is `root:pruftnet 0750` like
  Wireshark's dumpcap. `postinst` reapplies them after each upgrade. Do not add
  `NoNewPrivileges`: it disables file capabilities.
- The Homebrew formula declares a `service` for `brew services`.
- `scripts/distribution/service-smoke.mjs` checks the installed unit, worker permissions, startup and
  `doctor` in Linux CI.

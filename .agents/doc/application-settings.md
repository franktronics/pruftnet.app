# Application Settings

## Ownership

`AppSettingsProvider` owns application preferences that belong to one renderer profile rather than
the backend capture store. Version-one settings use the `pruftnet-app-settings-v1` local-storage key.
Stored input is parsed defensively, invalid values fall back to defaults, and same-origin tabs
receive updates through the browser `storage` event.

Theme remains owned by `ThemeProvider`, while the Settings page presents it alongside the other
application controls. Resetting application settings also restores the system theme.

## Packet-list cache

The packet-list cache applies only to decoded immutable summary ranges held by the frontend. It does
not size SQLite, pcapng storage, packet-detail buffers, export artifacts, or the live capture ring.
Evicting a range only means that a later visit must read that durable range again.

The default policy is automatic:

- desktop budget: 128–512 MiB;
- server/browser budget: 64–256 MiB;
- available renderer heap and coarse device memory are both considered;
- the result is rounded down to a 16 MiB boundary.

Manual mode supports 64, 128, 256, 512, and 1,024 MiB. The cache accounts for object and string
storage with a conservative structural estimate, evicts the least-recently accessed unpinned page,
and permits the active viewport to exceed the limit temporarily.

Runtime diagnostics show estimated retained bytes, retained pages, distinct datasets, and evictions
for the current application session. A dataset is a capture revision plus its historical filter.

## UI structure

Settings is a secondary page (see the navigation model in `frontend-design-system`). While it is
open, the settings sidebar replaces the main navigation: section search and sections grouped
by Application and Capture. Each section is a route (`/settings/$section`, catalogued in
`pages/settings/settings-sections.ts`); `/settings` and unknown sections redirect to General. The
settings sidebar loads lazily so it stays out of the startup bundle.

Sections render a centered column with a large title and groups of rows built from `SettingsGroup`
and `SettingRow`:

- General contains the theme control and the confirmed reset of every application setting.
- Keyboard shortcuts lists catalogue and platform shortcuts with a filter.
- Performance contains working packet-list cache controls and diagnostics.
- Storage shows backend disk usage and the confirmed deletion of all capture data (see
  `capture-architecture`).

Controls describe user-visible effects rather than internal query or serialization mechanisms.

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

The Settings surface is a compact instrument-control page:

- Appearance contains the operating-system/light/dark theme control.
- Performance contains working packet-list cache controls and diagnostics.
- Storage explains backend ownership and reserves the section for future retention policy controls.

Controls describe user-visible effects rather than internal query or serialization mechanisms.

# Host Analyzer

## How packets are turned into structured host information

### Location

`packages/utils/src/host-analyzer/`

### How it works

`HostAnalyser` receives raw parsed packets one at a time and runs an ordered list of checks against each packet. Each check can enrich or create host entries in the `analysedHosts` store.

```
packet
  → HostAnalyser.addPacket()
      → runs checks in order
          → each check reads/writes AnalysisContext
          → merges updated hosts into analysedHosts store
  → returns Map<mac, HostBaseData>  (only changed hosts)
```

The returned map contains **only the hosts modified by that packet**. The backend streams this diff to the frontend, which merges it into its local state.

### Checks

Located in `packages/utils/src/host-analyzer/checks/`, each inherits from `AnalyserCheck`.

Typical execution order:
1. Packet validity check
2. MAC extraction + host upsert
3. Protocol-specific enrichment: ARP, IPv4, IPv6, Router Advertisement, etc.

A check can return `stop` to halt further processing for that packet (e.g. when later checks are irrelevant).

### AnalysisContext

Checks share an `AnalysisContext` object scoped to each packet. This avoids re-parsing the same fields multiple times across checks.

### MacCheck specifics

`MacCheck` also identifies the local machine by calling `os.networkInterfaces()` and matching the selected capture interface's MAC address. That host is marked `type: 'me'`.

### Adding a new check

1. Create a class in `checks/` that extends `AnalyserCheck`
2. Implement the `run(packet, context, hosts)` method
3. Return `continue` or `stop`
4. Register it in the `HostAnalyser` checks array in the correct order

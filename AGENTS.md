# Agent Guidelines for Pruftnet

## Build/Test Commands

- `pnpm test` - Run all C++ tests (Catch2 framework)
- `cd packages/core-cpp/tests/build && sudo ./core_tests "[tag]"` - Run single test by tag (e.g., `"[parser]"`, `"[sniffer]"`)
- `pnpm build:core` - Build C++ modules with cmake-js (compiles C++ → N-API bindings → TypeScript types)
- `pnpm dev:web` - Start web app (Express + Vite HMR)
- `pnpm dev:desktop` - Start Electron desktop app
- `pnpm format` - Format with Prettier

## Monorepo Structure

- **pnpm workspace** with Turborepo, packages use `@repo/*` naming
- `packages/core-cpp`: C++ network analysis with N-API bindings (built with CMake)
- `packages/core-node`: Node.js backend (tRPC controllers)
- `packages/front`: React frontend (shared by web/desktop)
- `packages/ui`: Shadcn UI components
- `packages/utils`: Shared utilities + custom tRPC implementation
- `apps/web`: Express server + static frontend
- `apps/desktop`: Electron wrapper

## C++ Build Process

- Uses **CMake + cmake-js** to compile C++ → `.node` addon
- N-API bindings in `src/cpp/main.cpp` expose modules to Node.js
- TypeScript definitions in `src/ts/` wrap the native addon
- Tests use **Catch2**, located in `tests/*.test.cpp`, built separately to avoid N-API deps
- **Requires sudo** for packet capture capabilities (`CAP_NET_RAW`, `CAP_NET_ADMIN`)

## Code Style

- **Imports:** Type imports use `import type`, Node.js built-ins use `node:` prefix. Order: types → external → internal
- **Formatting:** 4 spaces, single quotes, no semicolons, trailing commas, 100-char lines (Prettier enforced)
- **TypeScript:** Functional style, interfaces for data structures, immutability (`const`/`readonly`), optional chaining (`?.`, `??`)
- **React:** Functional components + hooks, Tailwind CSS, Shadcn UI components
- **C++:** OOP principles, classes/structs, Catch2 tests with descriptive names and tags
- **Naming:** PascalCase (components/types), camelCase (variables/functions), ALL_CAPS (constants)
- **Comments:** English only, only for complex/non-obvious logic
- **Error Handling:** ⚠️ **CRITICAL** - Always `return` promises from wrapper functions to propagate errors correctly in async handlers
- **Language**: English for all code, comments, documentation
- **Code creation**: Only focus on what is asked, avoid unnecessary code and do not take self initiative

## tRPC Implementation

- **Custom tRPC-like implementation** (not actual tRPC library)
- `createProcedure` for HTTP endpoints (query/mutation)
- `createWsProcedure` for WebSocket streaming with `returnCb`
- Routes defined in `@repo/core-node`, served via Express middleware and WebSocket server
- Context uses `MapStore` for stateful data across procedures

## Host Analyzer

- Shared packet-to-host analysis lives in `packages/utils/src/host-analyzer/`
- `HostAnalyser` is an orchestrator: for each captured packet, it runs an ordered list of checks and merges updated hosts into the `analysedHosts` store
- Checks live in `packages/utils/src/host-analyzer/checks/` and inherit from the abstract `AnalyserCheck` base class
- Checks share an `AnalysisContext` to reuse extracted packet data between steps instead of reparsing everything each time
- Typical flow: packet validity check -> MAC extraction / host upsert -> protocol-specific enrichment (ARP, IPv4/IPv6, router advertisement, etc.)
- A check can return `stop` to end analysis early when later checks are no longer useful for that packet
- `MacCheck` is also responsible for identifying the current machine from `os.networkInterfaces()` using the selected capture interface, then marking that host as `type: 'me'`
- `HostAnalyser.addPacket()` returns a `Map<mac, HostBaseData>` containing only the hosts changed by the current packet; this map is streamed by the backend and merged into frontend state during capture

## Workflow Architecture (Nodes → Steps → Injectors)

### Overview

Users create visual workflows with React Flow → Save to DB → Execute on backend

### 3-Layer System

**1. Frontend Nodes** (`packages/ui/src/atomic/organisms/analysis-graph/nodes/`)

- React components with custom handles (inputs/outputs)
- Registered in `graph-config.tsx` with type mapping
- Added to `node-gallery.tsx` for user selection
- Handle format: `"handle/{nodeType}/{nodeId}/{handleType}/{position}"`

**2. Backend Steps** (`packages/core-node/src/utils/analysis-workflow/steps/`)

- Implement `WorkflowStep` interface with `execute()` method
- Receive `context` (shared state) and `input` (node data + predecessor outputs)
- Return `WorkflowStepOutput` with results for next nodes
- Registered in `workflow-step-factory.ts`
- Orchestrator (`workflow-orchestrator.ts`) builds dependency graph and executes steps

**3. C++ Injectors** (`packages/core-cpp/src/cpp/injector/`)

- Native packet injectors (e.g., `ipv6rs_injector.cpp`)
- Wrapped with N-API bindings (`.napi.hpp` files)
- TypeScript wrappers in `packages/core-cpp/src/ts/injector/`
- Exposed via `main.cpp` addon registration
- Called by steps through factory functions in `injector-factory.ts`

### Adding New Injector (Example: IPv6 RS)

**Step 1:** C++ injector (`ipv6rs_injector.{hpp,cpp}`) → Register in `main.cpp`
**Step 2:** TS wrapper (`ipv6rs-injector.ts`) → Add factory function (`injector-factory.ts`)
**Step 3:** Backend step (`ipv6-rs-step.ts`) → Register in `workflow-step-factory.ts`
**Step 4:** Frontend node (`node-ipv6-rs.tsx`) → Add to `graph-config.tsx` + `node-gallery.tsx`
**Step 5:** Build with `pnpm build:core`

### Multi-Handle Nodes (Wait-For Pattern)

**Challenge:** Orchestrator only knows `edge.source`/`edge.target`, not `sourceHandle`/`targetHandle`

**Solution:** Store connection metadata in `node.data` (updated by custom hooks)

- Frontend hook watches edges, updates `node.data` with connected node IDs
- Backend step reads metadata from `node.data` to identify inputs
- Example: `use-wait-for-metadata.ts` tracks primary input (Left) vs triggers (Top)

**⚠️ Hook Pattern:** Use functional updates `setNodes((currentNodes) => ...)` to avoid infinite loops. Never pass `nodes` as hook parameter—only `setNodes`.

## Documentation Sources

- Network protocols: [RFC Editor](https://www.rfc-editor.org/)
- React: [react.dev](https://react.dev/reference/react)
- TypeScript: [typescriptlang.org](https://www.typescriptlang.org/docs/)
- C++: [cppreference.com](https://en.cppreference.com/w/)
- Shadcn: [ui.shadcn.com](https://ui.shadcn.com/docs/components)
- Only use Shadcn styles and [components](https://ui.shadcn.com/llms.txt) for UI consistency
- Tailwind CSS: [tailwindcss.com](https://tailwindcss.com/docs)

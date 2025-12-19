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
- **Error Handling:** ⚠️ **CRITICAL** - Always `return` promises from wrapper functions to propagate errors correctly in async handlers (bug exists in `ws-procedure.ts:44,61` and `procedure.ts:44,60,69,76`)
- **Language**: English for all code, comments, documentation

## tRPC Implementation

- **Custom tRPC-like implementation** (not actual tRPC library)
- `createProcedure` for HTTP endpoints (query/mutation)
- `createWsProcedure` for WebSocket streaming with `returnCb`
- Routes defined in `@repo/core-node`, served via Express middleware and WebSocket server
- Context uses `MapStore` for stateful data across procedures

## Testing

- **C++ tests:** `packages/core-cpp/tests/*.test.cpp` using Catch2
- Test format: `TEST_CASE("Description", "[tag]")`
- Tests managed via `test_sources.txt` to avoid N-API dependencies
- Run with verbose output: `pnpm test` or `sudo ./core_tests --verbosity high --durations yes`

## Documentation Sources

- Network protocols: [RFC Editor](https://www.rfc-editor.org/)
- React: [react.dev](https://react.dev/reference/react)
- TypeScript: [typescriptlang.org](https://www.typescriptlang.org/docs/)
- C++: [cppreference.com](https://en.cppreference.com/w/)
- Shadcn: [ui.shadcn.com](https://ui.shadcn.com/docs/components)

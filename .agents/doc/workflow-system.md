# Workflow System

## How analysis workflows work (Nodes → Steps → Injectors)

Users draw visual workflows in the frontend (React Flow) → saved to SQLite → executed by the backend orchestrator.

### 3-layer system

```
Frontend Node   →   Backend Step   →   C++ Injector
(React Flow UI)     (execute logic)     (raw packet send)
```

**1. Frontend Nodes** — `packages/ui/src/atomic/organisms/analysis-graph/nodes/`
- React components with typed handles (inputs/outputs)
- Registered in `graph-config.tsx` (type → component mapping)
- Added to `node-gallery.tsx` for the user palette
- Handle ID format: `"handle/{nodeType}/{nodeId}/{handleType}/{position}"`

**2. Backend Steps** — `packages/core-node/src/utils/analysis-workflow/steps/`
- Implement `WorkflowStep` interface with `execute(context, input)`
- `context` = shared state across the workflow run
- `input` = this node's data + outputs from predecessor nodes
- Return `WorkflowStepOutput` passed to successor nodes
- Registered in `workflow-step-factory.ts`
- Orchestrator in `workflow-orchestrator.ts` builds a DAG (adjacency list + indegree counters) and executes steps in dependency order

**3. C++ Injectors** — `packages/core-cpp/src/cpp/injector/`
- Native packet builders/senders (e.g. `ipv6rs_injector.cpp`)
- Each injector has a `.napi.hpp` N-API binding file
- TypeScript wrappers in `packages/core-cpp/src/ts/injector/`
- Registered in `main.cpp`, called via `injector-factory.ts`

### Adding a new injector (full checklist)

1. `packages/core-cpp/src/cpp/injector/` — add `{name}_injector.{hpp,cpp}` + `.napi.hpp`
2. `packages/core-cpp/src/cpp/main.cpp` — register the N-API binding
3. `packages/core-cpp/src/ts/injector/{name}-injector.ts` — TypeScript wrapper
4. `packages/core-node/src/utils/analysis-workflow/injector-factory.ts` — add factory function
5. `packages/core-node/src/utils/analysis-workflow/steps/{name}-step.ts` — backend step
6. `packages/core-node/src/utils/analysis-workflow/workflow-step-factory.ts` — register step
7. `packages/ui/.../nodes/node-{name}.tsx` — frontend node component
8. `graph-config.tsx` — register node type
9. `node-gallery.tsx` — add to user palette
10. `pnpm build:core` — recompile C++ addon

### Custom tRPC procedures

- `createProcedure` — HTTP request/response (query or mutation)
- `createWsProcedure` — WebSocket streaming, use `returnCb` to push multiple values
- Routes defined in `@repo/core-node`, mounted on Express and WebSocket server
- Context uses `MapStore` for stateful data shared across procedure calls

### Multi-handle nodes (Wait-For pattern)

The orchestrator only sees `edge.source` / `edge.target`, not which specific handle was used. To distinguish inputs (e.g. primary input vs trigger):
- A frontend hook watches edges and writes connected node IDs into `node.data`
- The backend step reads `node.data` to identify which input is primary vs trigger
- Use functional updates: `setNodes((currentNodes) => ...)` — never pass `nodes` as a dependency to avoid infinite loops

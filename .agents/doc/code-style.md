# Code Style

## Conventions enforced across the codebase

### TypeScript / JavaScript

- **Formatting:** 4 spaces, single quotes, no semicolons, trailing commas, 100-char line limit (Prettier enforced — run `pnpm format`)
- **Imports:** type imports use `import type`, Node.js built-ins use `node:` prefix. Order: types → external → internal
- **Style:** functional, `const`/`readonly` by default, optional chaining (`?.`, `??`)
- **Naming:** `PascalCase` for components and types, `camelCase` for variables and functions, `ALL_CAPS` for constants
- **React:** functional components + hooks only, Tailwind CSS, Shadcn UI components
- **Comments:** English only, only for complex or non-obvious logic
- **Language:** English for all code, comments, and documentation

### Critical error handling rule

⚠️ Always `return` promises from async wrapper functions. Forgetting `return` silently swallows errors:

```ts
// ❌ wrong — error is lost
procedure(async () => {
    someAsyncCall()
})

// ✅ correct
procedure(async () => {
    return someAsyncCall()
})
```

### C++

- OOP with classes and structs
- Catch2 tests with descriptive names and tags (e.g. `TEST_CASE("parses IPv4 header", "[parser]")`)
- Follow existing patterns in `packages/core-cpp/src/cpp/`

### Scope discipline

Only implement what is explicitly asked. Do not add extra features, refactor unrelated code, or take initiative on improvements not requested.

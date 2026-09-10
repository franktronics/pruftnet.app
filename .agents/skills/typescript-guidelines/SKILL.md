---
name: typescript-guidelines
description: Write, review, or refactor TypeScript and TSX in Nexli with consistent typing, module boundaries, error handling, and validation. Use for any task that creates or changes TypeScript in apps, packages, tests, configuration, Effect services, shared contracts, or React components.
---

# TypeScript Guidelines

Write pragmatic, strict TypeScript that matches the repository instead of adding type ceremony. Read the nearest existing module, its package exports, and the relevant `tsconfig` before editing.

## Core rules

- Do not preserve backward compatibility
- Write all code, identifiers, comments, errors, and documentation in English.
- Preserve package and module boundaries. Import public members through the package subpath exported in `package.json`; do not deep-import another module's internal files.
- Prefer local inference. Add explicit types at public APIs, service contracts, exported functions, callbacks whose inference is unclear, and boundaries where widening would be unsafe.
- Derive types from Effect Schema, Drizzle schemas, library APIs, and existing source types. Do not maintain duplicate handwritten representations of the same data.
- Use `interface` for service contracts and object shapes intended for extension. Use `type` for unions, intersections, mapped types, tuples, and inferred aliases. Choose clarity when neither distinction matters.
- Do not add `readonly` to every property by default. Use `readonly` when the API contract must prevent consumers from reassigning a property, such as stable service dependencies, immutable configuration, identifiers, or intentionally immutable returned state.

## Model data precisely

- Prefer discriminated unions and literal types over booleans that encode multiple states.
- Use `null` for persisted nullable values and `undefined` for an omitted optional value. Do not mix them without a boundary conversion.
- Use exhaustive switches for discriminated unions and make newly added states fail compilation until handled.
- Do not use enums, namespaces, parameter properties, or other syntax incompatible with `erasableSyntaxOnly`. Prefer literal unions and plain objects.

## Functions and errors

- Keep functions focused and name them by observable behavior.
- For multi-line arrow functions, prefer an explicit body with `return`; single-line functions may use implicit returns.
- Prefer early returns or Effect failures over deeply nested branches.
- For multi-branch conditional values, prefer `cond` from `@repo/utils` over nested ternaries. Include an explicit fallback case such as `[true, fallback]` when the result must always be defined.
- Do not catch an error only to discard it. Preserve typed expected errors and let unexpected defects remain visible.
- Never expose raw database, Clerk, filesystem, or third-party errors across an API boundary.
- Keep Effects inside services and handlers; run them only at application boundaries.

## React and frontend

- Keep component props small and colocated unless shared by several modules.
- Derive UI values during render instead of duplicating them in state.
- Use TanStack Query for server state; do not mirror query results through `useEffect`.
- Keep API response types sourced from shared schemas, never from frontend-only copies.

## Exports and files

- Use explicit named exports in module `index.ts` files. Avoid wildcard exports for public module surfaces.
- Keep file names and roles consistent with the documented module structure.
- Use `import type` when an import is type-only.
- Remove unused exports and obsolete compatibility aliases during a refactor when they have no active consumers.

## Verification

After changing TypeScript:

1. Run the closest package typecheck.
2. Run ESLint for every affected package.
3. Run relevant tests and builds in proportion to the change.
4. Search for stale imports when moving or renaming public symbols.

Fix the underlying types instead of weakening compiler or lint configuration.

---
name: effect-server
description: Use when building, reviewing, refactoring, testing, or securing a robust EffectTS backend server that communicates with a React frontend via RPC.
---

# Effect Server

Use this skill for production-grade EffectTS backend work: server architecture, RPC contracts, services, Layers, repositories, tests, observability, security, runtime, and React client integration.

## Operating Rules

- Prefer correctness, security, testability, performance and maintainability over minimal diffs.
- You may substantially refactor code when the current structure harms quality.
- Keep changes pragmatic: add boundaries because they clarify ownership or reduce risk, not for ceremony.
- Check current official docs/package READMEs before using unstable or fast-moving APIs, especially `@effect/rpc`, `@effect/platform`, `@effect/sql`, and `@effect/opentelemetry`.
- Do not guess API signatures when they affect architecture or generated code.

## Architecture Guidelines

- Use `Schema` for all data crossing RPC boundaries.
- Put RPC contracts in shared code and derive both server handlers and React clients from them.
- Keep RPC handlers thin: parse/adapt request, call domain service, return typed result.
- Use `Layer` for dependency injection and assemble production dependencies at the application edge.
- Do not call `Effect.runPromise` inside services or repositories; execute effects only at boundaries.

## Error Handling

- Use typed errors for expected failures.
- Use `Schema.TaggedError` for errors crossing RPC boundaries.
- Use `Data.TaggedError` or project conventions for internal expected errors.
- Do not use strings for important application errors.
- Preserve defects as defects; do not hide unexpected bugs as successful responses.

## Review Checklist

- RPC contracts are shared and schema-backed.
- React client is derived from shared RPC contracts.
- Handlers are thin.
- Repositories own persistence.
- Dependencies are injected through services/Layers.
- Effects are executed only at boundaries.
- Inputs are validated and outputs filtered.
- Tests can swap production dependencies.
- Observability includes logs, spans, metrics, and correlation ids.
- Runtime/layers are assembled once.
- No server-only code leaks into the frontend bundle.

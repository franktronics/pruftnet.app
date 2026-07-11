# Coding Style

- Prefer clear, minimal code over defensive boilerplate.
- Avoid adding `readonly` everywhere by default. Use it only when immutability is important for correctness, public APIs, shared data contracts, or to prevent accidental mutation.
- Keep types readable. Do not over-model simple local values.
- Prefer small focused helpers when logic is reused or when extraction makes the main flow clearer.
- Avoid duplicating business logic across components or packages.
- Prefer derived state over synchronized duplicate state when possible.
- Keep React components mostly presentational when data can be normalized before rendering.
- Comments should explain non-obvious decisions, not restate the code.
- Use Vitest for TypeScript unit and integration tests. Keep pure backend/binary tests in the Node environment and add separate browser projects only when browser or Web Worker behavior is part of the contract.

---
applyTo: '**/*.cpp,**/*.hpp,**/*.c,**/*.h'
---

# Project coding standards for C++

Apply the [general coding guidelines](./copilot-instructions.md) to all code.

## C++ Guidelines

- Use C++ for all new code
- Follow object-oriented programming principles where possible
- Use classes and structs for data structures and type definitions

## Testing Guidelines

- Use Catch2 framework for unit tests
- All test files must end with `.test.cpp`
- Tests are located in `packages/core/tests/` directory
- Test sources are managed via `test_sources.txt` to avoid N-API dependencies
- Use descriptive test names and organize with tags: `TEST_CASE("Description", "[tag]")`
- Run tests with: `pnpm test` (includes verbose output and duration stats)
- Tests should be simple and focused, avoid complex tests

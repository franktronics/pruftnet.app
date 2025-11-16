---
applyTo: '**'
---

# Project description

## Overview

This project is an application that allows different analyses to be performed on the network by reading network activity on the different OSI layers.

## Project Structure

The project is a monorepo managed with pnpm and Turborepo.

- `packages/`: Contains all the packages for the project.
    - `core/` @repo/core: Core functionalities for network analysis written in C++ with N-API and build scripts using CMake.
    - `front/` @repo/front: Frontend application built with React and TypeScript used for the electron app and web app.
    - `ui/` @repo/ui: Shared UI components for the frontend application using React and TypeScript.
    - `utils/` @repo/utils: Shared utility functions and types for the project using TypeScript.
- `apps/`: Contains the applications for the project.
    - `desktop/` @repo/desktop: Electron application for desktop usage built with React and TypeScript.
    - `web/` @repo/web: Web application built with React and TypeScript.

## Project Operation

- The application runs in two versions, a web version and a desktop version.
- The desktop version uses Electron to provide access to native system resources.
- The web version is managed by an Express.JS server that returns the frontend statically.
- The web and desktop versions therefore use the same logic running on Node.JS as well as analysis modules written in C++.
- The core functionalities are implemented in C++ for performance and are accessed via N-API.
- The frontend is built with React and TypeScript for a modern user interface.

## Testing Infrastructure

- C++ unit tests use Catch2 framework in `packages/core/tests/`
- Tests are compiled into a single `core_tests` executable
- Test dependencies are managed via `test_sources.txt` configuration
- Run all tests: `pnpm test`

# Project general coding standards

## Naming Conventions

- Use PascalCase for component names, interfaces, and type aliases
- Use camelCase for variables, functions, and methods
- Use ALL_CAPS for constants

## Comment Conventions

- Code and comments should ONLY be in English no matter the native language of the author
- Only write comments for complex logic or non-obvious code

## Source for documentation

- Use [RFC editor](https://www.rfc-editor.org/) for network protocol documentation
- Use [MDN Web Docs](https://developer.mozilla.org/) for web-related documentation
- Use [C++ reference](https://en.cppreference.com/w/) for C++ documentation
- Use [Node.js documentation](https://nodejs.org/en/docs/) for Node.js documentation
- Use [React documentation](https://react.dev/reference/react) for React documentation
- Use [TypeScript documentation](https://www.typescriptlang.org/docs/) for TypeScript documentation
- Use [Electron documentation](https://www.electronjs.org/docs/latest/) for Electron documentation
- Use [Express.js documentation](https://expressjs.com/en/5x/api.html) for Express.js documentation
- Use [Shadcn documentation](https://ui.shadcn.com/docs/components) for Shadcn component library documentation

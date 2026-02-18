# Contributing to Prüftnet

Thank you for your interest in contributing!

## Development Setup

```bash
# Clone the repository
git clone <repo-url>
cd pruftnet

# Install dependencies
pnpm install

# Build C++ native modules (requires CMake)
pnpm build:core

# Setup capabilities for packet capture
sudo pnpm setup:caps

# Initialize database
pnpm db:init
```

## Available Commands

| Command            | Description                        |
| ------------------ | ---------------------------------- |
| `pnpm dev:web`     | Start web app (Express + Vite HMR) |
| `pnpm dev:desktop` | Start Electron desktop app         |
| `pnpm build:core`  | Build C++ modules with cmake-js    |
| `pnpm test`        | Run C++ tests (Catch2)             |
| `pnpm format`      | Format code with Prettier          |

## Code Style

- **Formatting**: 4 spaces, single quotes, no semicolons, trailing commas, 100-char lines (Prettier)
- **TypeScript**: Functional style, interfaces, immutability
- **React**: Functional components + hooks, Tailwind CSS, Shadcn UI
- **C++**: OOP principles, Catch2 tests with tags
- **Language**: English only for code and comments

## Architecture

This is a monorepo using pnpm workspaces + Turborepo:

1. **Frontend Nodes** - React Flow components in `packages/ui/src/atomic/organisms/analysis-graph/nodes/`
2. **Backend Steps** - Workflow execution in `packages/core-node/src/utils/analysis-workflow/steps/`
3. **C++ Injectors** - Native packet injection in `packages/core-cpp/src/cpp/injector/`

## Adding a New Injector

See [AGENTS.md](./AGENTS.md#adding-new-injector-example-ipv6-rs) for the complete guide.

## Pull Request Guidelines

1. Fork the repository
2. Create a feature branch
3. Make your changes following the code style
4. Run `pnpm format` before committing
5. Submit a pull request

## Need Help?

Feel free to open an issue for questions or discussions.

# Agent Guidelines for Pruftnet

Pruftnet is a network analysis software program similar to Wireshark that allows to perform powerful network scans, map network topologies, add custom protocols, and conduct active analysis by injecting packets directly into the network.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures.
4. Always ensure that the implemented features are compatible with Linux, macOS, Windows, and server mode.
5. If a tradeoff is required, choose correctness and robustness over short-term convenience.
6. This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js server built with Effect and Effect-Platform that serves @repo/front.
- `apps/desktop`: Electron.js cross-platform application for Linux, Mac, and Windows.
- `packages/front`: React frontend, which is the core content of the application. It is used by both the desktop and the server.
- `packages/shared`: Shared Effect schemas, RPC contracts, and application command definitions.
- `packages/utils`: Shared runtime utilities consumed by both server and client applications.
- `packages/ui`: Front-end component library built with Shadcn and organized using Atomic Design.
- `packages/core`: The core of the backend. This package is included in both the desktop and server because they share the same logic.
- `packages/packet-codec`: Generated and hand-written TypeScript reader for packet-tree payloads.

## Rules that should always be followed for prompting:

- Code, documentation, and comments must always be written in English, regardless of the user's input language.
- Always use the `effect-server` skill whenever you need to work on the server module/packages.
- Always use the `frontend-design` skill whenever a task involves UI/UX design, visual design, layout, or frontend styling decisions.
- Always use the `typescript-guidelines` skill whenever a task writes, reviews, or refactors TypeScript or TSX.
- Always use the `tanstack-forms` skill whenever creating or editing a TanStack Form form or reusable form component.
- Always use the `tanstack-query` skill whenever creating, editing, or reviewing frontend API modules, queries, mutations, query keys, or cache invalidation.

## External File Loading

CRITICAL: When you encounter a file reference (e.g., @rules/general.md), use your Read tool to load it on a need-to-know basis. They're relevant to the SPECIFIC task at hand.

Instructions:

- Do NOT preemptively load all references - use lazy loading based on actual need
- When loaded, treat content as mandatory instructions that override defaults
- Follow references recursively when needed

Load the relevant doc file based on the task at hand:

- [application-commands](.agents/doc/application-commands.md): Command catalogue, native menu bridge, and shortcuts.
- [application-settings](.agents/doc/application-settings.md): Renderer-owned preferences and packet-list cache policy.
- [capture-architecture](.agents/doc/capture-architecture.md): Capture ownership, durable storage, delivery, and failure invariants.
- [coding-style](.agents/doc/coding-style.md): Cross-package code and test conventions.
- [cpp-architecture](.agents/doc/cpp-architecture.md): Native component boundaries and change guidance.
- [frontend-design-system](.agents/doc/frontend-design-system.md): Visual, layout, density, and accessibility rules.
- [parser-architecture](.agents/doc/parser-architecture.md): Packet parser contracts and dissector contribution rules.
- [release](.agents/doc/release.md): Versioning, CI publication, and recovery procedure.

* Always update documentation for significant changes or new features, and remove outdated information.
* Use the format: `[link-name](link): shot description`
* Write documentation only for those features that the code itself cannot describe simply.
* All documentation files must be listed here.
* Prefers short, concise documentation

## External repositories

This project vendors external repositories under `.repos/` as read-only reference material for coding
agents:

### External repos to use:

- Wireshark: https://gitlab.com/wireshark/wireshark.git
- Effect-smol: https://github.com/Effect-TS/effect-smol.git

### How to use them

- These repositories are not tracked by Git. If they do not already exist, you must use the links mentioned above to clone them(--depth 1) before continuing.
- Prefer examples and patterns from the vendored source code over generated guesses or web search results.
- Do not edit files under `.repos/` unless explicitly asked.
- Do not import from `.repos/`; application code must continue importing from normal package dependencies.
- When writing Effect code, read `.repos/effect-smol/LLMS.md` first and inspect `.repos/effect-smol/` for
  examples of idiomatic usage, tests, module structure, and API design.
- When working on technical aspects related to networks, packets, or even dissectors, always inspect .repos/wireshark and/or search the internet to build a solid knowledge base.

## External References

- Network protocols: [RFC Editor](https://www.rfc-editor.org/)
- React: [react.dev](https://react.dev/reference/react)
- TypeScript: [typescriptlang.org](https://www.typescriptlang.org/docs/)
- C++: [cppreference.com](https://en.cppreference.com/w/)
- Shadcn: [ui.shadcn.com/llms.txt](https://ui.shadcn.com/llms.txt) — use Shadcn styles and components only
- Tailwind CSS: [tailwindcss.com](https://tailwindcss.com/docs)
- Tanstack: [All Tanstack libraries](https://tanstack.com/libraries)
- EffectTS: [effect.website](https://effect.website/docs)

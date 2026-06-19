
# Agent Guidelines for Pruftnet
Pruftnet is a network analysis software program similar to Wireshark that allows to perform powerful network scans, map network topologies, add custom protocols, and conduct active analysis by injecting packets directly into the network.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures.

If a tradeoff is required, choose correctness and robustness over short-term convenience.
This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js server built with Effect and Effect-Platform that serves @repo/front.
- `apps/desktop`: Electron.js cross-platform application for Linux, Mac, and Windows.
- `packages/front`: React frontend, which is the core content of the application. It is used by both the desktop and the server.
- `packages/utils`: Shared runtime utilities consumed by both server and client applications.
- `packages/ui`: Front-end component library built with Shadcn and organized using Atomic Design.


## Rules that should always be followed for prompting:
- Code, documentation, and comments must always be written in English, regardless of the user's input language.
- Always use the `caveman` skill in `full` mode for every Task or questions.
- Always use the `effect-server` skill whenever you need to work on the server module/packages.
- Always use the `frontend-design` skill whenever a task involves UI/UX design, visual design, layout, or frontend styling decisions.

## External File Loading

- Do NOT preemptively load all references - use lazy loading based on actual need
- When loaded, treat content as mandatory instructions that override defaults
- Follow references recursively when needed
- CRITICAL: When you encounter a file reference (e.g., @rules/general.md), use your Read tool to load it on a need-to-know basis. They're relevant to the SPECIFIC task at hand.

## Documentation

Always update documentation for significant changes or new features, and remove outdated information.
Load the relevant doc file based on the task at hand:

- **Release process** → @.agents/doc/release.md

## External References

- Network protocols: [RFC Editor](https://www.rfc-editor.org/)
- React: [react.dev](https://react.dev/reference/react)
- TypeScript: [typescriptlang.org](https://www.typescriptlang.org/docs/)
- C++: [cppreference.com](https://en.cppreference.com/w/)
- Shadcn: [ui.shadcn.com/llms.txt](https://ui.shadcn.com/llms.txt) — use Shadcn styles and components only
- Tailwind CSS: [tailwindcss.com](https://tailwindcss.com/docs)
- Tanstack: [All Tanstack libraries](https://tanstack.com/libraries)
- EffectTS: [effect.website](https://effect.website/docs)

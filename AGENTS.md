# Agent Guidelines for Pruftnet

## External File Loading

CRITICAL: When you encounter a file reference (e.g., @rules/general.md), use your Read tool to load it on a need-to-know basis. They're relevant to the SPECIFIC task at hand.

Instructions:

- Do NOT preemptively load all references - use lazy loading based on actual need
- When loaded, treat content as mandatory instructions that override defaults
- Follow references recursively when needed
- Always update documentation for significant changes or new features, and remove outdated information.

## Documentation

Load the relevant doc file based on the task at hand:

- **Commands & build** → @.agents/doc/commands.md
- **Project architecture** → @.agents/doc/architecture.md
- **Code style & conventions** → @.agents/doc/code-style.md
- **Workflow system (nodes/steps/injectors)** → @.agents/doc/workflow-system.md
- **Host analyzer** → @.agents/doc/host-analyzer.md

## External References

- Network protocols: [RFC Editor](https://www.rfc-editor.org/)
- React: [react.dev](https://react.dev/reference/react)
- TypeScript: [typescriptlang.org](https://www.typescriptlang.org/docs/)
- C++: [cppreference.com](https://en.cppreference.com/w/)
- Shadcn: [ui.shadcn.com/llms.txt](https://ui.shadcn.com/llms.txt) — use Shadcn styles and components only
- Tailwind CSS: [tailwindcss.com](https://tailwindcss.com/docs)

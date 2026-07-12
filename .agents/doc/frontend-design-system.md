# Frontend Design System

Pruftnet uses a compact desktop density optimized for packet inspection. Shared controls use Inter; addresses, byte values, counters, and timestamps use the system monospace stack with tabular figures.

## Density

- default controls: 28 px;
- workspace toolbars: 40 px;
- panel headers: 32 px;
- dense data rows: 32–34 px;
- utility labels: 12 px;
- controls and dense body text: 13 px;
- titles: 14 px.

Capture-specific fixed heights must follow this scale so adjacent panels align. New shared controls should extend the existing size variants instead of introducing local one-off heights.

## Color

Light and dark themes use neutral canvas, panel, popover, and border layers. Blue is reserved for selection, keyboard focus, and chart identity. Green, amber, and red communicate healthy, degraded, and failed states. Packet data must not use status colors decoratively.

The canonical colors live as Shadcn-compatible CSS variables in `packages/ui/src/styles/main.css`. Components consume semantic variables such as `background`, `muted`, `accent`, `primary`, and `chart-*`; they must not duplicate theme-specific literals.

## Motion And Accessibility

Motion is limited to spatial transitions and live-data charts. Charts disable animation when capture is inactive and when the operating system requests reduced motion. Interactive values expose keyboard behavior, visible focus, and an accessible status message.

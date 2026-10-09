# Frontend Design System

Pruftnet uses a compact desktop density optimized for packet inspection.

## Typography

- Inter is loaded with its optical-size axis and rendered with grayscale antialiasing (`antialiased` on `body`).
- Controls, packet numbers, timestamps, lengths, and info text use Inter; numeric columns add `tabular-nums`.
- Addresses, byte values, and ledger counters use the system monospace stack with tabular figures. Long addresses use `MiddleTruncate` so both ends stay visible.
- Labels and headers use sentence case with `font-medium`; do not add uppercase or letter-spaced labels.
- Lucide icons use a 1.75 stroke, set once by `LucideProvider` in `app.tsx`.

## Layout

The app shell is bounded to the viewport (`h-svh overflow-hidden` on the sidebar wrapper in `packages/front/src/pages/layout.tsx`); the document itself never scrolls. Each page scrolls inside its own content area, and panels with tall content own their scroll containers. Position: sticky elements must anchor to that scroll container, not the document.

Navigation has two levels. The capture workspace is the primary page. Secondary pages (History,
Settings) are listed in `packages/front/src/pages/secondary-pages.ts`: the title bar shows a back
button and the page title, and back returns to the location the page was entered from, skipping
in-page locations such as settings sections. A secondary page may replace the sidebar contents with
its own navigation, as Settings does.

The startup shell (`packages/front/vite/boot-shell.ts` and `.startup-shell` styles) paints the theme, sidebar, and canvas before JavaScript runs. Keep it aligned with the layout when the sidebar width or shell colors change.

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

Light and dark themes use neutral canvas, panel, popover, and border layers. Blue is reserved for selection, keyboard focus, and chart identity. Green, amber, and red communicate healthy, degraded, and failed states. Packet data must not use status colors decoratively, and a loss or retention counter is colored only while it is nonzero.

The canonical colors live as Shadcn-compatible CSS variables in `packages/ui/src/styles/main.css`. Components consume semantic variables such as `background`, `muted`, `accent`, `primary`, and `chart-*`; they must not duplicate theme-specific literals.

Table headers share the `table-header` and `table-header-foreground` tokens, including the virtualized packet grid. Use 32 px headers with 12 px medium-weight labels in sentence case, a thin bottom border, and subtle column resize handles that become clearer on hover or keyboard focus.

## Desktop Materials

The app uses the operating system material only where it is native: macOS uses the Electron sidebar vibrancy behind translucent sidebar and title-bar surfaces, and Windows 11 22H2+ uses Mica for the long-lived window backdrop. Windows versions without Mica and Linux use opaque semantic sidebar colors. Do not add a generic CSS backdrop blur to shared UI primitives; platform-specific composition belongs in `packages/front`.

On Linux and Windows, the native window-controls overlay is synchronized with the effective Electron light or dark theme so its controls do not render on a mismatched background.

## Motion And Accessibility

Motion is limited to spatial transitions and live-data charts. Controls transition explicit properties (`transition`, `transition-colors`), never `transition-all`. Charts disable animation when capture is inactive and when the operating system requests reduced motion. Interactive values expose keyboard behavior, visible focus, and an accessible status message.

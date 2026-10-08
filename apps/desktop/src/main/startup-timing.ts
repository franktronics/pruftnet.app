import type { WebContents } from 'electron'

/** Milliseconds since the main process started. */
export function elapsedSinceProcessStart() {
    return Math.round(performance.now())
}

// Waits for the mark set by the frontend once React has committed the application.
const readRendererTimings = `new Promise((resolve) => {
    const read = () => {
        const mounted = performance.getEntriesByName('pruftnet:app-mounted')[0]
        if (!mounted) return setTimeout(read, 10)
        const paint = performance.getEntriesByName('first-paint')[0]
        resolve({
            timeOrigin: performance.timeOrigin,
            firstPaint: paint ? paint.startTime : null,
            appMounted: mounted.startTime,
        })
    }
    read()
})`

/** Renderer milestones, converted to the main-process timeline. */
export async function rendererStartupTimings(webContents: WebContents) {
    const timings: { timeOrigin: number; firstPaint: number | null; appMounted: number } =
        await webContents.executeJavaScript(readRendererTimings)
    const offset = timings.timeOrigin - performance.timeOrigin
    return {
        firstPaintMs: timings.firstPaint === null ? null : Math.round(offset + timings.firstPaint),
        appMountedMs: Math.round(offset + timings.appMounted),
    }
}

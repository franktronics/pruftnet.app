import { spawn } from 'node:child_process'

import { Effect } from 'effect'

function browserCommand(url: string): readonly [string, ReadonlyArray<string>] {
    switch (process.platform) {
        case 'darwin':
            return ['open', [url]]
        case 'win32':
            // Avoids `cmd /c start`, whose argument parsing treats `&` and `^` specially.
            return ['rundll32', ['url.dll,FileProtocolHandler', url]]
        default:
            return ['xdg-open', [url]]
    }
}

/** Opens the URL in the default browser. Failure only logs a warning: the server keeps running. */
export const openBrowser = (url: string) =>
    Effect.async<void, Error>((resume) => {
        const [command, args] = browserCommand(url)
        const child = spawn(command, args, { detached: true, stdio: 'ignore' })
        child.once('error', (error) => resume(Effect.fail(error)))
        child.once('spawn', () => {
            child.unref()
            resume(Effect.void)
        })
    }).pipe(
        Effect.catchAll((error) =>
            Effect.logWarning(`Unable to open a browser: ${error.message}. Open ${url} manually.`),
        ),
    )

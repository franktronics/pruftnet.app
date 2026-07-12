interface ClipboardWriter {
    writeText(text: string): Promise<void>
}

export async function copyText(
    text: string,
    clipboard: ClipboardWriter | undefined = typeof navigator === 'undefined'
        ? undefined
        : navigator.clipboard,
    fallback: (value: string) => boolean = legacyCopy,
): Promise<boolean> {
    if (clipboard) {
        try {
            await clipboard.writeText(text)
            return true
        } catch {
            // Browser permissions can reject clipboard access; try the synchronous fallback.
        }
    }
    return fallback(text)
}

function legacyCopy(text: string): boolean {
    if (typeof document === 'undefined') return false
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    try {
        return document.execCommand('copy')
    } catch {
        return false
    } finally {
        textarea.remove()
    }
}

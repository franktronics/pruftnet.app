const units = ['B', 'KB', 'MB', 'GB']

export function formatBytes(bytes: number): string {
    let value = bytes
    let unit = 0
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000
        unit += 1
    }
    return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' })

export function formatDate(iso: string | null): string {
    return iso ? dateFormat.format(new Date(iso)) : 'Unpublished'
}

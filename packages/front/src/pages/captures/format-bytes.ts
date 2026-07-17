export function formatBytes(value: string | bigint) {
    const amount = typeof value === 'bigint' ? value : BigInt(value)
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let scaled = amount
    let unit = 0
    while (scaled >= 1024n && unit < units.length - 1) {
        scaled /= 1024n
        unit += 1
    }
    return `${scaled.toLocaleString()} ${units[unit]}`
}

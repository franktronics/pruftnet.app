export const parseIp = (ip: string): [number, number, number, number] => {
    const parts = ip.split('.').map((p) => parseInt(p, 10))
    if (parts.length !== 4 || parts.some((v) => Number.isNaN(v) || v < 0 || v > 255)) {
        throw new Error('Invalid IP format')
    }
    return [parts[0] as number, parts[1] as number, parts[2] as number, parts[3] as number]
}

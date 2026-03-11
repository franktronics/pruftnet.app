import ouiData from 'oui-data' with { type: 'json' }

export const getVendorFromMac = (mac: string): string | null => {
    const normalized = mac
        .toUpperCase()
        .replace(/[^A-F0-9]/g, '')
        .slice(0, 6)
    return (ouiData as Record<string, string>)[normalized] ?? null
}

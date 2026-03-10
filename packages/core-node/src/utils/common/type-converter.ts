export class TypeConverter {
    static macStringToBytes(mac: string): number[] {
        const parts = mac.split(':')
        if (parts.length !== 6) {
            throw new Error(
                `Invalid MAC address format: ${mac}. Expected format: xx:xx:xx:xx:xx:xx`,
            )
        }

        const bytes: number[] = []
        for (const part of parts) {
            const byte = parseInt(part, 16)
            if (Number.isNaN(byte) || byte < 0 || byte > 255) {
                throw new Error(`Invalid MAC address octet: ${part}`)
            }
            bytes.push(byte)
        }

        return bytes
    }

    static ipStringToBytes(ip: string): number[] {
        const parts = ip.split('.')
        if (parts.length !== 4) {
            throw new Error(`Invalid IP address format: ${ip}`)
        }

        const bytes: number[] = []
        for (const part of parts) {
            const byte = parseInt(part, 10)
            if (Number.isNaN(byte) || byte < 0 || byte > 255) {
                throw new Error(`Invalid IP address octet: ${part}`)
            }
            bytes.push(byte)
        }

        return bytes
    }

    static uint16ToBytes(value: number): number[] {
        if (value < 0 || value > 0xffff || !Number.isInteger(value)) {
            throw new Error(`Invalid uint16 value: ${value}`)
        }
        return [(value >> 8) & 0xff, value & 0xff]
    }
}

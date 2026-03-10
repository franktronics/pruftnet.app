import addon from '../addon.js'

export function isIcmpInjectorAvailable(): boolean {
    return typeof addon.IcmpInjector === 'function'
}

export class IcmpInjector {
    private nativeInstance: InstanceType<typeof addon.IcmpInjector>

    constructor() {
        if (!isIcmpInjectorAvailable()) {
            throw new Error('IcmpInjector is only available on Linux.')
        }

        try {
            this.nativeInstance = new addon.IcmpInjector()
        } catch (error) {
            throw new Error(
                `Failed to create IcmpInjector: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    initialize(interfaceName?: string): boolean {
        const ifaceName = interfaceName?.trim() || ''

        try {
            return this.nativeInstance.initialize(ifaceName)
        } catch (error) {
            throw new Error(
                `Failed to initialize ICMP injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    send(targetIp: string, packet: Buffer): void {
        if (!targetIp || targetIp.trim().length === 0) {
            throw new Error('Target IP cannot be empty')
        }

        if (!isValidIpv4(targetIp.trim())) {
            throw new Error(`Invalid IPv4 address: ${targetIp}`)
        }

        if (!Buffer.isBuffer(packet)) {
            throw new Error('Packet must be a Buffer')
        }

        if (packet.length === 0) {
            throw new Error('Packet cannot be empty')
        }

        try {
            this.nativeInstance.send(targetIp.trim(), packet)
        } catch (error) {
            throw new Error(
                `Failed to send ICMP packet: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    close(): void {
        try {
            this.nativeInstance.close()
        } catch (error) {
            throw new Error(
                `Failed to close ICMP injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    isInitialized(): boolean {
        try {
            return this.nativeInstance.isInitialized()
        } catch (error) {
            throw new Error(
                `Failed to check initialization status: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }
}

function isValidIpv4(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
    const match = ip.match(ipv4Regex)

    if (!match) {
        return false
    }

    const octets = match.slice(1, 5).map((octet) => parseInt(octet, 10))

    return octets.every((octet) => octet >= 0 && octet <= 255)
}

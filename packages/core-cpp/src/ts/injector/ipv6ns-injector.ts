import addon from '../addon.js'

export function isIpv6NsInjectorAvailable(): boolean {
    return typeof addon.Ipv6NsInjector === 'function'
}

export class Ipv6NsInjector {
    private nativeInstance: InstanceType<typeof addon.Ipv6NsInjector>

    constructor() {
        if (!isIpv6NsInjectorAvailable()) {
            throw new Error('Ipv6NsInjector is only available on Linux.')
        }

        try {
            this.nativeInstance = new addon.Ipv6NsInjector()
        } catch (error) {
            throw new Error(
                `Failed to create Ipv6NsInjector: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    initialize(interfaceName: string): boolean {
        if (!interfaceName || interfaceName.trim().length === 0) {
            throw new Error('Interface name is required and cannot be empty')
        }

        try {
            return this.nativeInstance.initialize(interfaceName.trim())
        } catch (error) {
            throw new Error(
                `Failed to initialize IPv6 NS injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    send(targetIpv6: string, packet: Buffer): void {
        if (!targetIpv6 || targetIpv6.trim().length === 0) {
            throw new Error('Target IPv6 cannot be empty')
        }

        if (!Buffer.isBuffer(packet)) {
            throw new Error('Packet must be a Buffer')
        }

        if (packet.length === 0) {
            throw new Error('Packet cannot be empty')
        }

        try {
            this.nativeInstance.send(targetIpv6.trim(), packet)
        } catch (error) {
            throw new Error(
                `Failed to send ICMPv6 packet: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    close(): void {
        try {
            this.nativeInstance.close()
        } catch (error) {
            throw new Error(
                `Failed to close IPv6 NS injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

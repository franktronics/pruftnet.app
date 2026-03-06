import addon from '../addon.js'

export function isIcmpv6InjectorAvailable(): boolean {
    return typeof addon.Icmpv6Injector === 'function'
}

export class Icmpv6Injector {
    private nativeInstance: InstanceType<typeof addon.Icmpv6Injector>

    constructor() {
        if (!isIcmpv6InjectorAvailable()) {
            throw new Error('Icmpv6Injector is only available on Linux.')
        }

        try {
            this.nativeInstance = new addon.Icmpv6Injector()
        } catch (error) {
            throw new Error(
                `Failed to create Icmpv6Injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
                `Failed to initialize ICMPv6 injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
                `Failed to close ICMPv6 injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

import addon from '../addon.js'

export function isIpv6RsInjectorAvailable(): boolean {
    return typeof addon.Ipv6RsInjector === 'function'
}

export class Ipv6RsInjector {
    private nativeInstance: InstanceType<typeof addon.Ipv6RsInjector>

    constructor() {
        if (!isIpv6RsInjectorAvailable()) {
            throw new Error('Ipv6RsInjector is only available on Linux.')
        }

        try {
            this.nativeInstance = new addon.Ipv6RsInjector()
        } catch (error) {
            throw new Error(
                `Failed to create Ipv6RsInjector: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
                `Failed to initialize IPv6 RS injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    send(): void {
        try {
            this.nativeInstance.send()
        } catch (error) {
            throw new Error(
                `Failed to send Router Solicitation: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    close(): void {
        try {
            this.nativeInstance.close()
        } catch (error) {
            throw new Error(
                `Failed to close IPv6 RS injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

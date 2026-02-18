import addon from '../addon.js'

export function isInjectorAvailable(): boolean {
    return typeof addon.BasicInjector === 'function'
}

export class BasicInjector {
    private nativeInstance: InstanceType<typeof addon.BasicInjector>

    constructor() {
        if (!isInjectorAvailable()) {
            throw new Error('BasicInjector is only available on Linux.')
        }

        try {
            this.nativeInstance = new addon.BasicInjector()
        } catch (error) {
            throw new Error(
                `Failed to create BasicInjector: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    initialize(interfaceName: string): boolean {
        if (!interfaceName || interfaceName.trim().length === 0) {
            throw new Error('Interface name cannot be empty')
        }

        try {
            return this.nativeInstance.initialize(interfaceName.trim())
        } catch (error) {
            throw new Error(
                `Failed to initialize injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    send(packet: Buffer): void {
        if (!Buffer.isBuffer(packet)) {
            throw new Error('Packet must be a Buffer')
        }

        if (packet.length === 0) {
            throw new Error('Packet cannot be empty')
        }

        try {
            this.nativeInstance.send(packet)
        } catch (error) {
            throw new Error(
                `Failed to send packet: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    close(): void {
        try {
            this.nativeInstance.close()
        } catch (error) {
            throw new Error(
                `Failed to close injector: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

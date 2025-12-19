import type { NetworkInterfaceConfig } from '../types/basics.js'
import addon from '../addon.js'

/**
 * NetworkInterface class for network interface management
 */
export class NetworkInterface {
    private nativeInstance: any

    constructor(config: NetworkInterfaceConfig | string) {
        const name = typeof config === 'string' ? config : config.name

        if (!name || name.trim().length === 0) {
            throw new Error('Interface name cannot be empty')
        }

        try {
            this.nativeInstance = new addon.NetworkInterface(name.trim())
        } catch (error) {
            throw new Error(
                `Failed to create NetworkInterface: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Get the native instance (for internal use by other wrappers)
     * @returns Native NetworkInterface instance
     */
    get native(): any {
        return this.nativeInstance
    }

    /**
     * Get the interface name
     * @returns Interface name
     */
    get name(): string {
        try {
            return this.nativeInstance.name
        } catch (error) {
            throw new Error(
                `Failed to get interface name: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Set the interface name
     * @param value New interface name
     */
    set name(value: string) {
        if (!value || value.trim().length === 0) {
            throw new Error('Interface name cannot be empty')
        }

        try {
            this.nativeInstance.name = value.trim()
        } catch (error) {
            throw new Error(
                `Failed to set interface name: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }
}

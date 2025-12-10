import { RawPacketData, PacketCallback } from '../types/basics'
import addon from '../addon'

/**
 * NetworkSniffer class for capturing network packets
 */
export class NetworkSniffer {
    private nativeInstance: any
    private currentCallback?: PacketCallback

    constructor() {
        try {
            this.nativeInstance = new addon.NetworkSniffer()
        } catch (error) {
            throw new Error(
                `Failed to create NetworkSniffer: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Start sniffing packets on the specified interface
     * @param interfaceName Name of the network interface to sniff on
     * @param callback Function to call when a packet is received
     * @returns True if sniffing started successfully
     */
    startSniffing(interfaceName: string, callback: PacketCallback): boolean {
        if (!interfaceName || typeof interfaceName !== 'string') {
            throw new Error('Interface name must be a non-empty string')
        }

        if (!callback || typeof callback !== 'function') {
            throw new Error('Callback must be a function')
        }

        if (this.isRunning()) {
            throw new Error('NetworkSniffer is already running. Call stopSniffing() first.')
        }

        try {
            this.currentCallback = callback

            const wrappedCallback = (packet: RawPacketData) => {
                try {
                    callback(packet)
                } catch (error) {
                    console.error('Error in packet callback:', error)
                }
            }

            return this.nativeInstance.startSniffing(interfaceName, wrappedCallback)
        } catch (error) {
            this.currentCallback = undefined
            throw new Error(
                `Failed to start sniffing: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Stop sniffing packets
     */
    stopSniffing(): void {
        try {
            this.nativeInstance.stopSniffing()
            this.currentCallback = undefined
        } catch (error) {
            throw new Error(
                `Failed to stop sniffing: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Check if the sniffer is currently running
     * @returns True if sniffing is active
     */
    isRunning(): boolean {
        try {
            return this.nativeInstance.isRunning()
        } catch (error) {
            throw new Error(
                `Failed to check running status: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }
}

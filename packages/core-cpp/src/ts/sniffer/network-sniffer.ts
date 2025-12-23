import type { PacketCallback } from '../types/basics.js'
import addon from '../addon.js'

/**
 * Check if NetworkSniffer is available on this platform
 * @returns true if sniffer is available (Linux only)
 */
export function isSnifferAvailable(): boolean {
    return typeof addon.NetworkSniffer === 'function'
}

/**
 * NetworkSniffer class for capturing and parsing network packets
 *
 * Uses the native sniffer with integrated parser for high-performance
 * packet capture and dissection. Packets are delivered with both raw
 * bytes and parsed metadata for O(1) field access.
 *
 * **Note: Only available on Linux.** On other platforms, the constructor
 * will throw an error. Use `isSnifferAvailable()` to check platform support.
 *
 * @example
 * ```typescript
 * import { NetworkSniffer, isSnifferAvailable, ProtocolId, IPV4_FIELDS, formatIPv4 } from '@repo/core-cpp'
 *
 * if (!isSnifferAvailable()) {
 *     console.error('NetworkSniffer is only available on Linux')
 *     process.exit(1)
 * }
 *
 * const sniffer = new NetworkSniffer()
 *
 * sniffer.startSniffing('eth0', (packet) => {
 *     console.log('Captured packet with', packet.parsed.protocolCount, 'layers')
 *
 *     // Read source IP from IPv4 header
 *     const ipv4 = packet.parsed.protocols.find(p => p.protocolId === ProtocolId.IPV4)
 *     if (ipv4) {
 *         const srcIpField = ipv4.fields.find(f => f.fieldId === IPV4_FIELDS.SRC_IP)
 *         if (srcIpField) {
 *             console.log('Source IP:', formatIPv4(packet.raw.data, srcIpField))
 *         }
 *     }
 * })
 *
 * // Later...
 * sniffer.stopSniffing()
 * ```
 */
export class NetworkSniffer {
    private nativeInstance: InstanceType<typeof addon.NetworkSniffer>

    constructor() {
        if (!isSnifferAvailable()) {
            throw new Error('NetworkSniffer is only available on Linux. ')
        }

        try {
            this.nativeInstance = new addon.NetworkSniffer()
        } catch (error) {
            throw new Error(
                `Failed to create NetworkSniffer: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Start sniffing on the specified network interface
     *
     * @param interfaceName Network interface name (e.g., 'eth0', 'en0')
     * @param callback Function called for each captured packet
     * @returns true if sniffing started successfully, false otherwise
     *
     * @note Requires elevated privileges (sudo) for raw socket access
     */
    startSniffing(interfaceName: string, callback: PacketCallback): boolean {
        if (!interfaceName || interfaceName.trim().length === 0) {
            throw new Error('Interface name cannot be empty')
        }

        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function')
        }

        try {
            return this.nativeInstance.startSniffing(interfaceName.trim(), callback)
        } catch (error) {
            throw new Error(
                `Failed to start sniffing: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Stop sniffing and release resources
     */
    stopSniffing(): void {
        try {
            this.nativeInstance.stopSniffing()
        } catch (error) {
            throw new Error(
                `Failed to stop sniffing: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Check if the sniffer is currently running
     * @returns true if sniffing is active
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

import type { PacketCallback } from '../types/basics.js'
import addon from '../addon.js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Use CORE_CPP_ROOT if defined (Electron bundled context), otherwise resolve from __dirname
const packageRoot = process.env.CORE_CPP_ROOT || resolve(__dirname, '../..')

function getProtocolsPath(): string {
    return `${packageRoot}/protocols`
}

/**
 * Check if NetworkSniffer is available on this platform
 * @returns true if sniffer is available (Linux only)
 */
export function isSnifferAvailable(): boolean {
    return typeof addon.NetworkSniffer === 'function'
}

/**
 * Check if the current process has sufficient privileges for raw socket capture.
 * On Unix: checks process UID === 0 (root).
 * On Windows: checks if running as Administrator via PowerShell.
 * @returns true if running with root/admin privileges
 */
export function isSnifferPrivileged(): boolean {
    if (process.platform === 'win32') {
        try {
            const result = execSync(
                'powershell -Command "[bool](([System.Security.Principal.WindowsIdentity]::GetCurrent()).groups -match \'S-1-5-32-544\')"',
                { encoding: 'utf8', timeout: 3000 },
            ).trim()
            return result === 'True'
        } catch {
            return false
        }
    }
    return process.getuid?.() === 0
}

/**
 * NetworkSniffer class for capturing and parsing network packets
 *
 * Uses the native sniffer with integrated parser for high-performance
 * packet capture and dissection. Packets are delivered with both raw
 * bytes and parsed protocol layers.
 *
 * **Note: Only available on Linux.** On other platforms, the constructor
 * will throw an error. Use `isSnifferAvailable()` to check platform support.
 * **Requires root/administrator privileges.** Use `isSnifferPrivileged()` to check.
 *
 * @example
 * ```typescript
 * import { NetworkSniffer, isSnifferAvailable } from '@repo/core-cpp'
 *
 * if (!isSnifferAvailable()) {
 *     console.error('NetworkSniffer is only available on Linux')
 *     process.exit(1)
 * }
 *
 * const sniffer = new NetworkSniffer()
 *
 * sniffer.startSniffing('eth0', (packet) => {
 *     // packet.parsed is an array of protocol layers
 *     // Each layer has fields like "0_48" (offset_length) with extracted values
 *     const ethernet = packet.parsed[0]
 *     if (ethernet) {
 *         console.log('EtherType:', ethernet['96_16']) // 0x0800 for IPv4
 *     }
 *
 *     const ipv4 = packet.parsed[1]
 *     if (ipv4) {
 *         console.log('Protocol:', ipv4['72_8']) // 6 for TCP, 17 for UDP
 *     }
 * })
 *
 * // Later...
 * sniffer.stopSniffing()
 * ```
 */
export class NetworkSniffer {
    private nativeInstance: InstanceType<typeof addon.NetworkSniffer>

    constructor(protocolsPath?: string) {
        if (!isSnifferPrivileged()) {
            throw new Error(
                'Insufficient privileges: raw sockets require root privileges. Please run the application as root/administrator.',
            )
        }

        if (!isSnifferAvailable()) {
            throw new Error('NetworkSniffer is only available on Linux.')
        }

        if (!isSnifferAvailable()) {
            throw new Error('NetworkSniffer is only available on Linux.')
        }

        const path = protocolsPath ?? getProtocolsPath()

        try {
            this.nativeInstance = new addon.NetworkSniffer(path)
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

import { PacketData } from '../../types'
import addon from '../addon'

export type PacketCallback = (packet: PacketData) => void

/**
 * NetworkScanner class for real-time network packet capture and analysis
 */
export class NetworkScanner {
    private nativeInstance: any

    constructor() {
        this.nativeInstance = new addon.NetworkScanner()
    }

    /**
     * Start scanning network packets on specified interface
     * @param nic Network interface to scan (e.g., 'eth0', 'wlan0')
     * @param callback Function called for each captured packet
     * @returns Promise resolving to true if scan started successfully
     */
    async startScan(nic: string, callback: PacketCallback): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                const result = this.nativeInstance.startScan(nic, (packet: PacketData) => {
                    // Wrapper pour s'assurer que la callback est appelée de manière thread-safe
                    setImmediate(() => {
                        try {
                            callback(packet)
                        } catch (error) {
                            console.error('Error in packet callback:', error)
                        }
                    })
                })
                resolve(result)
            } catch (error) {
                reject(error)
            }
        })
    }

    /**
     * Stop the network scan
     */
    stopScan(): void {
        this.nativeInstance.stopScan()
    }

    /**
     * Get scanning statistics
     * @returns Object containing scanning statistics
     */
    getStats(): { totalPackets: number; droppedPackets: number; queueSize: number } {
        return this.nativeInstance.getStats()
    }
}


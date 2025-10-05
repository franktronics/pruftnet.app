import { PacketData, TestData } from '../../types'
import addon from '../addon'

/**
 * PacketParser class for parsing network packets
 */
export class PacketParser {
    private nativeInstance: any

    constructor() {
        this.nativeInstance = new addon.PacketParser()
    }

    /**
     * Parse packet data from raw bytes
     * @returns Parsed packet information
     */
    parse(): PacketData {
        return this.nativeInstance.parse()
    }

    /**
     * Get test data for development purposes
     * @returns Test data object
     */
    getTestData(): TestData {
        return this.nativeInstance.getTestData()
    }
}


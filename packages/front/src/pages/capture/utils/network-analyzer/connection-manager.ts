import type { ConnectionType } from './packet-parser'

export type ConnectionResult = {
    connection: ConnectionType
    isNew: boolean
    isUpdated: boolean
}

export class ConnectionManager {
    private createConnectionId(mac1: string, mac2: string): string {
        return mac1 < mac2 ? `${mac1}_${mac2}` : `${mac2}_${mac1}`
    }

    private createConnection(
        sourceMac: string,
        destMac: string,
        isFirstPacket: boolean = true,
    ): ConnectionType {
        const sortedMacs = [sourceMac, destMac].sort()
        return {
            id: this.createConnectionId(sourceMac, destMac),
            source: sortedMacs[0],
            target: sortedMacs[1],
            bidirectional: false,
            data: {
                numPackets: isFirstPacket ? 1 : 0,
            },
        }
    }

    public registerConnection(
        sourceMac: string,
        destMac: string,
        connectionsStore: Map<string, ConnectionType>,
    ): ConnectionResult {
        const connectionId = this.createConnectionId(sourceMac, destMac)
        const existingConnection = connectionsStore.get(connectionId)

        if (existingConnection) {
            const isReverse =
                sourceMac !== existingConnection.source || destMac !== existingConnection.target
            const bidirectionalChanged = !existingConnection.bidirectional && isReverse

            const updatedConnection: ConnectionType = {
                ...existingConnection,
                data: {
                    numPackets: existingConnection.data.numPackets + 1,
                },
                bidirectional: existingConnection.bidirectional || isReverse,
            }

            connectionsStore.set(connectionId, updatedConnection)
            return {
                connection: updatedConnection,
                isNew: false,
                isUpdated: bidirectionalChanged,
            }
        }

        const newConnection = this.createConnection(sourceMac, destMac)
        connectionsStore.set(connectionId, newConnection)
        return {
            connection: newConnection,
            isNew: true,
            isUpdated: false,
        }
    }
}

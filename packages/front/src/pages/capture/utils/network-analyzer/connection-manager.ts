import type { ConnectionType } from './packet-parser'

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
    ): ConnectionType {
        const connectionId = this.createConnectionId(sourceMac, destMac)
        const existingConnection = connectionsStore.get(connectionId)

        if (existingConnection) {
            const updatedConnection: ConnectionType = {
                ...existingConnection,
                data: {
                    numPackets: existingConnection.data.numPackets + 1,
                },
            }

            if (!existingConnection.bidirectional) {
                const isReverse =
                    sourceMac !== existingConnection.source || destMac !== existingConnection.target
                if (isReverse) {
                    updatedConnection.bidirectional = true
                }
            }

            connectionsStore.set(connectionId, updatedConnection)
            return updatedConnection
        }

        const newConnection = this.createConnection(sourceMac, destMac)
        connectionsStore.set(connectionId, newConnection)
        return newConnection
    }
}

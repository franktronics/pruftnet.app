export type HostBaseData = {
    type: 'host' | 'router' | 'me'
    mac: string
    vendor: string
    ipv4?: string
    ipv6?: string

    // Record<connected Host MAC, connection data>
    connectedTo: Record<
        string,
        {
            numPacketsSend: number
            numPacketsReceived: number
        }
    >
}

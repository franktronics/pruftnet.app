/**
 * Frame 8679 of the synthetic capture shown in the landing screenshots: a TLS 1.3 ClientHello for
 * updates.example.org. Field labels follow Pruftnet's packet tree; byte ranges were verified
 * against Wireshark's dissection of the same frame. Only documentation address ranges are used.
 */
export const clientHelloHex =
    '02507200000102507200001f08004500008f00010000400633a80a14001fcb00' +
    '718dc68401bb07201b9b01346c2d5018200046e9000016030300620100005e03' +
    '0300000000b4b9a95776aa5b79e10eb9cf6bf1298dd2eaf3e17e5c5a398e87ad' +
    '9e0000061301130213030100002f000000180016000013757064617465732e65' +
    '78616d706c652e6f7267000a00060004001d0017002b00050403040303'

export interface PacketField {
    label: string
    value?: string
    /** Byte offset in the frame. */
    start: number
    length: number
    children?: PacketField[]
}

export const clientHelloTree: PacketField[] = [
    {
        label: 'Ethernet frame',
        start: 0,
        length: 14,
        children: [
            { label: 'Destination', value: '02:50:72:00:00:01', start: 0, length: 6 },
            { label: 'Source', value: '02:50:72:00:00:1f', start: 6, length: 6 },
            { label: 'Type', value: 'IPv4 (0x0800)', start: 12, length: 2 },
        ],
    },
    {
        label: 'Internet Protocol Version 4',
        start: 14,
        length: 20,
        children: [
            { label: 'Total length', value: '143', start: 16, length: 2 },
            { label: 'Time to live', value: '64', start: 22, length: 1 },
            { label: 'Protocol', value: 'TCP (6)', start: 23, length: 1 },
            { label: 'Source', value: '10.20.0.31', start: 26, length: 4 },
            { label: 'Destination', value: '203.0.113.141', start: 30, length: 4 },
        ],
    },
    {
        label: 'Transmission Control Protocol',
        start: 34,
        length: 20,
        children: [
            { label: 'Source port', value: '50820', start: 34, length: 2 },
            { label: 'Destination port', value: '443', start: 36, length: 2 },
            { label: 'Sequence number', value: '119544731', start: 38, length: 4 },
            { label: 'Flags', value: 'PSH, ACK', start: 47, length: 1 },
            { label: 'Window size', value: '8192', start: 48, length: 2 },
        ],
    },
    {
        label: 'TLS record',
        start: 54,
        length: 103,
        children: [
            { label: 'Content type', value: 'Handshake (22)', start: 54, length: 1 },
            { label: 'Record length', value: '98', start: 57, length: 2 },
            {
                label: 'Handshake message',
                start: 59,
                length: 98,
                children: [
                    { label: 'Handshake type', value: 'ClientHello (1)', start: 59, length: 1 },
                    { label: 'Random', value: '32 bytes', start: 65, length: 32 },
                    { label: 'Cipher suites', value: '3 suites', start: 100, length: 6 },
                    { label: 'Server name', value: 'updates.example.org', start: 119, length: 19 },
                    {
                        label: 'Supported groups',
                        value: 'x25519, secp256r1',
                        start: 144,
                        length: 4,
                    },
                    {
                        label: 'Supported versions',
                        value: 'TLS 1.3, TLS 1.2',
                        start: 153,
                        length: 4,
                    },
                ],
            },
        ],
    },
]

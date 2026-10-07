import { clientHelloHex, clientHelloTree, type PacketField } from './client-hello'

const frame = Uint8Array.from(clientHelloHex.match(/../g)!, (byte) => Number.parseInt(byte, 16))
const ascii = (field: PacketField) =>
    String.fromCharCode(...frame.subarray(field.start, field.start + field.length))

function flatten(fields: PacketField[], parent?: PacketField): [PacketField, PacketField?][] {
    return fields.flatMap((field) => [
        [field, parent] as [PacketField, PacketField?],
        ...flatten(field.children ?? [], field),
    ])
}

describe('client hello sample', () => {
    test('is a complete 157 byte frame', () => {
        expect(frame).toHaveLength(157)
    })

    test('keeps every field inside its parent and the frame', () => {
        for (const [field, parent] of flatten(clientHelloTree)) {
            expect(field.start + field.length).toBeLessThanOrEqual(frame.length)
            if (!parent) continue
            expect(field.start).toBeGreaterThanOrEqual(parent.start)
            expect(field.start + field.length).toBeLessThanOrEqual(parent.start + parent.length)
        }
    })

    test('points the server name field at the SNI bytes', () => {
        const serverName = flatten(clientHelloTree).find(([field]) => field.label === 'Server name')
        expect(ascii(serverName![0])).toBe('updates.example.org')
    })
})

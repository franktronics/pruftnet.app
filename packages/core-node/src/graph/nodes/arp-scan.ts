import { z } from 'zod'
import { type GraphNode } from '../node'

const ipOctet = z.number().int().min(0).max(255)
const ipTuple = z.tuple([ipOctet, ipOctet, ipOctet, ipOctet])

const inputSchema = z.object({
    start: ipTuple,
    end: ipTuple,
})

const nodeDataSchema = z.object({
    delay: z.number().int().min(0),
})

const packetEntrySchema = z.object({
    packet: z.custom<Buffer>((value) => Buffer.isBuffer(value), {
        message: 'Expected Buffer',
    }),
    delay: z.number().int().min(0),
})

const outputSchema = z.array(packetEntrySchema)

type ArpInput = z.infer<typeof inputSchema>
type ArpOutput = z.infer<typeof outputSchema>

const fakeSrcMac = () => 'aa:bb:cc:dd:ee:ff'
const fakeDstMac = () => 'ff:ff:ff:ff:ff:ff'
const fakeSrcIp = () => '192.168.0.1'
const fakeDelay = () => 100

const toIpString = (ip: number[]) => ip.join('.')

const incrementIp = (ip: number[]): number[] => {
    const res = [...ip]
    for (let i = 3; i >= 0; i--) {
        const next = ((res[i] as number | undefined) ?? 0) + 1
        res[i] = next
        if (next <= 255) break
        if (i === 0) throw new Error('IP range overflow')
        res[i] = 0
    }
    return res
}

const generateRange = (start: number[], end: number[]): number[][] => {
    const range: number[][] = []
    let current: number[] = [...start]
    const endKey = end.join('.')
    while (true) {
        range.push([...current])
        if (current.join('.') === endKey) break
        current = incrementIp(current)
    }
    return range
}

const macToBytes = (mac: string): number[] => mac.split(':').map((octet) => parseInt(octet, 16))

const ipToBytes = (ip: string): number[] => ip.split('.').map((part) => parseInt(part, 10))

const buildArpPacket = (targetIp: string) => {
    const dstMac = macToBytes(fakeDstMac())
    const srcMac = macToBytes(fakeSrcMac())
    const srcIp = ipToBytes(fakeSrcIp())
    const tgtIp = ipToBytes(targetIp)

    const ethHeader = Buffer.from([
        ...dstMac,
        ...srcMac,
        0x08,
        0x06, // EtherType ARP
    ])

    const arpPayload = Buffer.from([
        0x00,
        0x01, // HTYPE Ethernet
        0x08,
        0x00, // PTYPE IPv4
        0x06, // HLEN
        0x04, // PLEN
        0x00,
        0x01, // OPCODE request
        ...srcMac,
        ...srcIp,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00, // THA unknown
        ...tgtIp, // TPA
    ])

    return Buffer.concat([ethHeader, arpPayload])
}

export const arpScanNode: GraphNode<ArpInput, ArpOutput> = {
    type: 'arp-scan',
    inputSchema,
    outputSchema,
    mergeInputs(inputs: unknown[]): ArpInput {
        if (inputs.length === 0) {
            throw new Error('arp-scan requires one input')
        }
        if (inputs.length > 1) {
            throw new Error('arp-scan supports a single parent')
        }
        return inputSchema.parse(inputs[0])
    },
    run(input: ArpInput, nodeData: unknown): ArpOutput {
        const parsedNodeData = nodeDataSchema.parse(nodeData)
        const targets = generateRange(input.start, input.end)
        const delay = parsedNodeData.delay ?? fakeDelay()
        return targets.map((ip) => ({
            packet: buildArpPacket(toIpString(ip)),
            delay,
        }))
    },
}

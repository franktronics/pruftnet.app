import {
    BasicInjector,
    IcmpInjector,
    Ipv6NsInjector,
    isInjectorAvailable,
    isIcmpInjectorAvailable,
    isIpv6NsInjectorAvailable,
} from '@repo/core-cpp'
import type { WorkflowStepInput } from '../workflow-step'
import { WorkflowEventCallback, WorkflowEventFactory } from '../workflow-types'

type ArpScanOutput = {
    packets: Array<Buffer | { delay: number }>
    type: 'arp-scan'
}

type IcmpPingOutput = {
    packets: Array<{ packet: Buffer; targetIp: string } | { delay: number }>
    ipSource: string
    type: 'icmp-ping'
}

type Ipv6NsOutput = {
    packets: Array<{ packet: Buffer; targetIpv6: string } | { delay: number }>
    type: 'ipv6-ns'
}

type PacketOutput = ArpScanOutput | IcmpPingOutput | Ipv6NsOutput

export class InjectorFactory {
    private basicInjector?: BasicInjector
    private icmpInjector?: IcmpInjector
    private ipv6NsInjector?: Ipv6NsInjector
    private interfaceName: string = ''
    private eventCallback?: WorkflowEventCallback
    private nodeId: string = ''

    async send(
        input: WorkflowStepInput,
        interfaceName: string,
        onEvent?: WorkflowEventCallback,
    ): Promise<void> {
        this.interfaceName = interfaceName
        this.eventCallback = onEvent
        this.nodeId = input.node.id

        const streams = this.extractStreams(input.inputs)

        await Promise.all(streams.map((stream) => this.sendStream(stream)))
    }

    close(): void {
        if (this.basicInjector) {
            this.basicInjector.close()
            this.basicInjector = undefined
        }
        if (this.icmpInjector) {
            this.icmpInjector.close()
            this.icmpInjector = undefined
        }
        if (this.ipv6NsInjector) {
            this.ipv6NsInjector.close()
            this.ipv6NsInjector = undefined
        }
    }

    private extractStreams(inputs: Record<string, unknown>): PacketOutput[] {
        const streams: PacketOutput[] = []

        for (const value of Object.values(inputs)) {
            if (this.isPacketOutput(value)) {
                streams.push(value)
            }
        }

        if (streams.length === 0) {
            throw new Error('No packet streams found in inputs')
        }

        return streams
    }

    private async sendStream(stream: PacketOutput): Promise<void> {
        if (stream.type === 'arp-scan') {
            await this.sendArpStream(stream)
        } else if (stream.type === 'icmp-ping') {
            await this.sendIcmpStream(stream)
        } else if (stream.type === 'ipv6-ns') {
            await this.sendIpv6NsStream(stream)
        } else {
            throw new Error(`Unknown packet stream type: ${(stream as { type: string }).type}`)
        }
    }

    private async sendArpStream(stream: ArpScanOutput): Promise<void> {
        if (!isInjectorAvailable()) {
            throw new Error('BasicInjector (ARP) is only available on Linux')
        }

        if (!this.basicInjector) {
            this.basicInjector = new BasicInjector()
            const success = this.basicInjector.initialize(this.interfaceName)
            if (!success) {
                throw new Error(
                    `Failed to initialize BasicInjector on interface "${this.interfaceName}"`,
                )
            }
        }

        let sentCount = 0
        let failedCount = 0
        const totalPackets = stream.packets.filter((item) => Buffer.isBuffer(item)).length

        for (const item of stream.packets) {
            if (Buffer.isBuffer(item)) {
                try {
                    this.basicInjector.send(item)
                    sentCount++
                } catch (error) {
                    failedCount++
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
                    console.error('Failed to send ARP packet:', errorMsg)

                    this.eventCallback?.(
                        WorkflowEventFactory.create({
                            type: 'node-warning',
                            nodeId: this.nodeId,
                            message: `Failed to send ARP packet: ${errorMsg}`,
                        }),
                    )
                }
            } else if ('delay' in item) {
                await this.sleep(item.delay)
            }
        }

        this.eventCallback?.(
            WorkflowEventFactory.create({
                type: 'node-info',
                nodeId: this.nodeId,
                message: `ARP: Sent ${sentCount}/${totalPackets} packets${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
            }),
        )
    }

    private async sendIcmpStream(stream: IcmpPingOutput): Promise<void> {
        if (!isIcmpInjectorAvailable()) {
            throw new Error('IcmpInjector is only available on Linux')
        }

        if (!this.icmpInjector) {
            this.icmpInjector = new IcmpInjector()
            const success = this.icmpInjector.initialize(this.interfaceName)
            if (!success) {
                throw new Error(
                    `Failed to initialize IcmpInjector on interface "${this.interfaceName}"`,
                )
            }
        }

        let sentCount = 0
        let failedCount = 0
        const totalPackets = stream.packets.filter((item) => 'packet' in item).length

        for (const item of stream.packets) {
            if ('packet' in item && 'targetIp' in item) {
                try {
                    this.icmpInjector.send(item.targetIp, item.packet)
                    sentCount++
                } catch (error) {
                    failedCount++
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
                    console.error(`Failed to send ICMP packet to ${item.targetIp}:`, errorMsg)

                    this.eventCallback?.(
                        WorkflowEventFactory.create({
                            type: 'node-warning',
                            nodeId: this.nodeId,
                            message: `Failed to send ICMP ping to ${item.targetIp}: ${errorMsg}`,
                        }),
                    )
                }
            } else if ('delay' in item) {
                await this.sleep(item.delay)
            }
        }

        this.eventCallback?.(
            WorkflowEventFactory.create({
                type: 'node-info',
                nodeId: this.nodeId,
                message: `ICMP: Sent ${sentCount}/${totalPackets} pings${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
            }),
        )
    }

    private isPacketOutput(value: unknown): value is PacketOutput {
        if (typeof value !== 'object' || value === null) {
            return false
        }

        const obj = value as Record<string, unknown>

        if (!('type' in obj) || !('packets' in obj)) {
            return false
        }

        if (obj.type !== 'arp-scan' && obj.type !== 'icmp-ping' && obj.type !== 'ipv6-ns') {
            return false
        }

        if (!Array.isArray(obj.packets)) {
            return false
        }

        return true
    }

    private async sendIpv6NsStream(stream: Ipv6NsOutput): Promise<void> {
        if (!isIpv6NsInjectorAvailable()) {
            throw new Error('Ipv6NsInjector is only available on Linux')
        }

        if (!this.ipv6NsInjector) {
            this.ipv6NsInjector = new Ipv6NsInjector()
            const success = this.ipv6NsInjector.initialize(this.interfaceName)
            if (!success) {
                throw new Error(
                    `Failed to initialize Ipv6NsInjector on interface "${this.interfaceName}"`,
                )
            }
        }

        let sentCount = 0
        let failedCount = 0
        const totalPackets = stream.packets.filter((item) => 'packet' in item).length

        for (const item of stream.packets) {
            if ('packet' in item && 'targetIpv6' in item) {
                try {
                    this.ipv6NsInjector.send(item.targetIpv6, item.packet)
                    sentCount++
                } catch (error) {
                    failedCount++
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
                    console.error(`Failed to send IPv6 NS to ${item.targetIpv6}:`, errorMsg)

                    this.eventCallback?.(
                        WorkflowEventFactory.create({
                            type: 'node-warning',
                            nodeId: this.nodeId,
                            message: `Failed to send IPv6 NS to ${item.targetIpv6}: ${errorMsg}`,
                        }),
                    )
                }
            } else if ('delay' in item) {
                await this.sleep(item.delay)
            }
        }

        this.eventCallback?.(
            WorkflowEventFactory.create({
                type: 'node-info',
                nodeId: this.nodeId,
                message: `IPv6 NS: Sent ${sentCount}/${totalPackets} packets${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
            }),
        )
    }

    private async sleep(delay: number): Promise<void> {
        if (delay <= 0) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, delay))
    }
}

import type { WorkflowContext, WorkflowStep, WorkflowStepInput, WorkflowStepOutput } from '../workflow-step'

type PacketItem = Buffer | { delay: number }

export class NetOutputStep implements WorkflowStep {
    readonly type = 'net-output'

    async execute(
        context: WorkflowContext,
        input: WorkflowStepInput,
    ): Promise<WorkflowStepOutput> {
        const streams = this.extractStreams(input.inputs)
        await Promise.all(streams.map((stream, index) => this.sendStream(stream, index)))
        return { output: true }
    }

    private extractStreams(inputs: Record<string, unknown>): PacketItem[][] {
        const streams: PacketItem[][] = []

        for (const value of Object.values(inputs)) {
            if (Array.isArray(value) && value.every((item) => this.isPacketItem(item))) {
                streams.push(value as PacketItem[])
            }
        }

        if (streams.length === 0) {
            throw new Error('No packet streams found for net-output node')
        }

        return streams
    }

    private async sendStream(stream: PacketItem[], streamIndex: number): Promise<void> {
        for (const item of stream) {
            if (Buffer.isBuffer(item)) {
                console.log('net-output packet', { streamIndex, bytes: item.length })
            } else {
                await this.sleep(item.delay)
            }
        }
    }

    private isPacketItem(item: unknown): item is PacketItem {
        if (Buffer.isBuffer(item)) {
            return true
        }
        if (typeof item === 'object' && item !== null && 'delay' in item) {
            const delay = (item as { delay?: unknown }).delay
            return typeof delay === 'number' && delay >= 0
        }
        return false
    }

    private async sleep(delay: number): Promise<void> {
        if (delay <= 0) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, delay))
    }
}

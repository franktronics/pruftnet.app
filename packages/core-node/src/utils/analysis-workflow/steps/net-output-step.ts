import { BasicInjector, isInjectorAvailable } from '@repo/core-cpp'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

type PacketItem = Buffer | { delay: number }

export class NetOutputStep implements WorkflowStep {
    readonly type = 'net-output'
    private injector?: BasicInjector

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        if (!isInjectorAvailable()) {
            throw new Error('Packet injection is only available on Linux')
        }

        const interfaceName = context.interface
        if (typeof interfaceName !== 'string' || interfaceName.trim().length === 0) {
            throw new Error('Interface name not found in workflow context')
        }

        this.injector = new BasicInjector()
        const success = this.injector.initialize(interfaceName)
        if (!success) {
            throw new Error(`Failed to initialize packet injector on interface "${interfaceName}"`)
        }

        try {
            const streams = this.extractStreams(input.inputs)
            await Promise.all(streams.map((stream) => this.sendStream(stream)))
            return { output: true }
        } finally {
            this.injector.close()
        }
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

    private async sendStream(stream: PacketItem[]): Promise<void> {
        for (const item of stream) {
            if (Buffer.isBuffer(item)) {
                try {
                    this.injector!.send(item)
                } catch (error) {
                    console.error(
                        'Failed to send packet:',
                        error instanceof Error ? error.message : 'Unknown error',
                    )
                }
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

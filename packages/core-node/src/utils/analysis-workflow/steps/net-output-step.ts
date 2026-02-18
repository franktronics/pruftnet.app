import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'
import { WorkflowEventCallback, WorkflowEventFactory } from '../workflow-types'
import { InjectorFactory } from '../factory/injector-factory'

export class NetOutputStep implements WorkflowStep {
    readonly type = 'net-output'
    private factory?: InjectorFactory
    private eventCallback?: WorkflowEventCallback

    async execute(
        context: WorkflowContext,
        input: WorkflowStepInput,
        onEvent?: WorkflowEventCallback,
    ): Promise<WorkflowStepOutput> {
        if (onEvent) {
            this.eventCallback = onEvent
        }

        const interfaceName = context.interface
        if (typeof interfaceName !== 'string' || interfaceName.trim().length === 0) {
            throw new Error('Interface name not found in workflow context')
        }

        this.factory = new InjectorFactory()

        try {
            await this.factory.send(input, interfaceName, this.eventCallback)
            return { output: true }
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error during packet injection'

            this.eventCallback?.(
                WorkflowEventFactory.create({
                    type: 'node-error',
                    nodeId: input.node.id,
                    errorMessage: errorMessage,
                }),
            )

            throw error
        } finally {
            this.factory.close()
        }
    }
}

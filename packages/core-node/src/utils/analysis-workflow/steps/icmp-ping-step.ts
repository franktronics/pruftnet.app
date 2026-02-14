import {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

export class IcmpPingStep implements WorkflowStep {
    readonly type = 'icmp-ping'

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        const packets: Array<Buffer | { delay: number }> = []

        return { output: packets }
    }
}

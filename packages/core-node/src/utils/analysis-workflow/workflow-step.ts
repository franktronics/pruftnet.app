import type { GraphNode } from './graph-types'
import { WorkflowEventCallback } from './workflow-types'

export interface WorkflowContext {
    readonly [key: string]: unknown
}

export interface WorkflowStepInput {
    readonly node: GraphNode
    readonly inputs: Record<string, unknown>
}

export interface WorkflowStepOutput {
    readonly output?: unknown
}

export interface WorkflowStep {
    readonly type: string
    execute(
        context: WorkflowContext,
        input: WorkflowStepInput,
        onEvent?: WorkflowEventCallback,
    ): Promise<WorkflowStepOutput>
}

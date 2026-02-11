import type { Dag } from './graph.dag'
import type { GraphEdge, GraphNode } from './graph.types'
import type { WorkflowContext, WorkflowStep, WorkflowStepOutput } from './workflow-step'

export type WorkflowNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface WorkflowExecutionResult {
    readonly statusByNodeId: Map<string, WorkflowNodeStatus>
    readonly outputByNodeId: Map<string, WorkflowStepOutput>
    readonly errorByNodeId: Map<string, Error>
}

export type WorkflowEvent =
    | {
          readonly type: 'node-status'
          readonly nodeId: string
          readonly status: WorkflowNodeStatus
      }
    | {
          readonly type: 'node-error'
          readonly nodeId: string
          readonly error: Error
      }
    | {
          readonly type: 'workflow-complete'
          readonly result: WorkflowExecutionResult
      }

export type WorkflowEventCallback = (event: WorkflowEvent) => void

export class WorkflowOrchestrator {
    private readonly stepsByType: Map<string, WorkflowStep>

    constructor(steps: WorkflowStep[]) {
        this.stepsByType = new Map(steps.map((step) => [step.type, step]))
    }

    public async run(
        dag: Dag,
        nodes: GraphNode[],
        edges: GraphEdge[],
        context: WorkflowContext,
        onEvent?: WorkflowEventCallback,
    ): Promise<WorkflowExecutionResult> {
        const statusByNodeId = new Map<string, WorkflowNodeStatus>()
        const outputByNodeId = new Map<string, WorkflowStepOutput>()
        const errorByNodeId = new Map<string, Error>()
        const nodeById = new Map(nodes.map((node) => [node.id, node]))
        const parentsByNodeId = this.buildParents(edges)
        const remainingDeps = new Map(dag.indegree)

        for (const node of nodes) {
            statusByNodeId.set(node.id, 'pending')
            onEvent?.({ type: 'node-status', nodeId: node.id, status: 'pending' })
        }

        const ready: string[] = []

        for (const [nodeId, count] of remainingDeps) {
            if (count === 0) {
                ready.push(nodeId)
            }
        }

        while (ready.length > 0) {
            const batch = ready.splice(0, ready.length)
            await Promise.all(
                batch.map(async (nodeId) => {
                    const node = nodeById.get(nodeId)
                    if (!node) {
                        return
                    }

                    if (this.hasFailedDependency(nodeId, parentsByNodeId, statusByNodeId)) {
                        statusByNodeId.set(nodeId, 'skipped')
                        onEvent?.({ type: 'node-status', nodeId, status: 'skipped' })
                        this.unlockDependents(nodeId, dag, remainingDeps, ready)
                        return
                    }

                    const step = this.stepsByType.get(node.type)
                    if (!step) {
                        statusByNodeId.set(nodeId, 'failed')
                        const error = new Error(`No step found for node type ${node.type}`)
                        errorByNodeId.set(nodeId, error)
                        onEvent?.({ type: 'node-status', nodeId, status: 'failed' })
                        onEvent?.({ type: 'node-error', nodeId, error })
                        this.unlockDependents(nodeId, dag, remainingDeps, ready)
                        return
                    }

                    statusByNodeId.set(nodeId, 'running')
                    onEvent?.({ type: 'node-status', nodeId, status: 'running' })

                    try {
                        const inputs = this.buildInputs(nodeId, parentsByNodeId, outputByNodeId)
                        const output = await step.execute(context, { node, inputs })
                        outputByNodeId.set(nodeId, output)
                        statusByNodeId.set(nodeId, 'completed')
                        onEvent?.({ type: 'node-status', nodeId, status: 'completed' })
                    } catch (error) {
                        statusByNodeId.set(nodeId, 'failed')
                        const normalized = this.normalizeError(error)
                        errorByNodeId.set(nodeId, normalized)
                        onEvent?.({ type: 'node-status', nodeId, status: 'failed' })
                        onEvent?.({ type: 'node-error', nodeId, error: normalized })
                    }

                    this.unlockDependents(nodeId, dag, remainingDeps, ready)
                }),
            )
        }

        const result = { statusByNodeId, outputByNodeId, errorByNodeId }
        onEvent?.({ type: 'workflow-complete', result })
        return result
    }

    private buildParents(edges: GraphEdge[]): Map<string, string[]> {
        const parentsByNodeId = new Map<string, string[]>()

        for (const edge of edges) {
            if (!parentsByNodeId.has(edge.target)) {
                parentsByNodeId.set(edge.target, [])
            }
            parentsByNodeId.get(edge.target)!.push(edge.source)
        }

        return parentsByNodeId
    }

    private buildInputs(
        nodeId: string,
        parentsByNodeId: Map<string, string[]>,
        outputByNodeId: Map<string, WorkflowStepOutput>,
    ): Record<string, unknown> {
        const inputs: Record<string, unknown> = {}
        const parents = parentsByNodeId.get(nodeId) ?? []

        for (const parentId of parents) {
            const parentOutput = outputByNodeId.get(parentId)
            if (parentOutput) {
                inputs[parentId] = parentOutput.output
            }
        }

        return inputs
    }

    private hasFailedDependency(
        nodeId: string,
        parentsByNodeId: Map<string, string[]>,
        statusByNodeId: Map<string, WorkflowNodeStatus>,
    ): boolean {
        const parents = parentsByNodeId.get(nodeId) ?? []

        for (const parentId of parents) {
            const status = statusByNodeId.get(parentId)
            if (status === 'failed' || status === 'skipped') {
                return true
            }
        }

        return false
    }

    private unlockDependents(
        nodeId: string,
        dag: Dag,
        remainingDeps: Map<string, number>,
        ready: string[],
    ) {
        for (const next of dag.adj.get(nodeId) ?? []) {
            remainingDeps.set(next, (remainingDeps.get(next) ?? 0) - 1)
            if (remainingDeps.get(next) === 0) {
                ready.push(next)
            }
        }
    }

    private normalizeError(error: unknown): Error {
        if (error instanceof Error) {
            return error
        }
        return new Error('Workflow node execution failed')
    }
}

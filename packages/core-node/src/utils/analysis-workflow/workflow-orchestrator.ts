import type { Dag } from './graph-dag'
import type { GraphEdge, GraphNode } from './graph-types'
import type { WorkflowContext, WorkflowStepOutput } from './workflow-step'
import { WorkflowStepFactory } from './factory/workflow-step-factory'
import { WorkflowEventCallback, WorkflowEventFactory, WorkflowNodeStatus } from './workflow-types'

export class WorkflowOrchestrator {
    private stepFactory: WorkflowStepFactory | null = null

    constructor() {}

    public setStepFactory(fac: WorkflowStepFactory) {
        this.stepFactory = fac
    }

    public async run(
        dag: Dag,
        nodes: GraphNode[],
        edges: GraphEdge[],
        context: WorkflowContext,
        onEvent?: WorkflowEventCallback,
    ) {
        const statusByNodeId = new Map<string, WorkflowNodeStatus>()
        const outputByNodeId = new Map<string, WorkflowStepOutput>()
        const errorByNodeId = new Map<string, Error>()
        const nodeById = new Map(nodes.map((node) => [node.id, node]))
        const parentsByNodeId = this.buildParents(edges)
        const remainingDeps = new Map(dag.indegree)

        for (const node of nodes) {
            statusByNodeId.set(node.id, 'pending')
            onEvent?.(
                WorkflowEventFactory.create({
                    type: 'node-status',
                    nodeId: node.id,
                    status: 'pending',
                }),
            )
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
                        onEvent?.(
                            WorkflowEventFactory.create({
                                type: 'node-status',
                                nodeId,
                                status: 'skipped',
                            }),
                        )
                        this.unlockDependents(nodeId, dag, remainingDeps, ready)
                        return
                    }

                    if (!this.stepFactory) {
                        throw new Error('WorkflowStepFactory not set on WorkflowOrchestrator')
                    }
                    const step = this.stepFactory.create(node.type)

                    if (!step) {
                        statusByNodeId.set(nodeId, 'failed')
                        const error = new Error(`No step found for node type ${node.type}`)
                        errorByNodeId.set(nodeId, error)
                        onEvent?.(
                            WorkflowEventFactory.create({
                                type: 'node-status',
                                nodeId,
                                status: 'failed',
                            }),
                        )
                        onEvent?.(
                            WorkflowEventFactory.create({
                                type: 'node-error',
                                nodeId,
                                errorMessage: error.message,
                            }),
                        )
                        this.unlockDependents(nodeId, dag, remainingDeps, ready)
                        return
                    }

                    statusByNodeId.set(nodeId, 'running')
                    onEvent?.(
                        WorkflowEventFactory.create({
                            type: 'node-status',
                            nodeId,
                            status: 'running',
                        }),
                    )

                    try {
                        const inputs = this.buildInputs(nodeId, parentsByNodeId, outputByNodeId)
                        const output = await step.execute(context, { node, inputs }, onEvent)
                        outputByNodeId.set(nodeId, output)
                        statusByNodeId.set(nodeId, 'completed')
                        onEvent?.(
                            WorkflowEventFactory.create({
                                type: 'node-status',
                                nodeId,
                                status: 'completed',
                            }),
                        )
                    } catch (error) {
                        statusByNodeId.set(nodeId, 'failed')
                        const normalized = this.normalizeError(error)
                        errorByNodeId.set(nodeId, normalized)
                        onEvent?.(
                            WorkflowEventFactory.create({
                                type: 'node-status',
                                nodeId,
                                status: 'failed',
                            }),
                        )
                        onEvent?.(
                            WorkflowEventFactory.create({
                                type: 'node-error',
                                nodeId,
                                errorMessage: normalized.message,
                            }),
                        )
                    }

                    this.unlockDependents(nodeId, dag, remainingDeps, ready)
                }),
            )
        }

        const result = { statusByNodeId, outputByNodeId, errorByNodeId }
        onEvent?.(WorkflowEventFactory.create({ type: 'workflow-complete', result }))
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

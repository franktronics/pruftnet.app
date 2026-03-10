export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type BasicNodeData = {
    name: string
    status?: NodeStatus
}

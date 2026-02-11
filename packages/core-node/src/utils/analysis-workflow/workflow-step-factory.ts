import type { WorkflowStep } from './workflow-step'
import { IpRangeStep } from './steps/ip-range-step'

export function createWorkflowSteps(): WorkflowStep[] {
    return [new IpRangeStep()]
}

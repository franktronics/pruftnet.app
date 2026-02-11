import type { WorkflowStep } from './workflow-step'
import { ArpScanStep } from './steps/arp-scan-step'
import { IpRangeStep } from './steps/ip-range-step'
import { NetOutputStep } from './steps/net-output-step'

export function createWorkflowSteps(): WorkflowStep[] {
    return [new IpRangeStep(), new ArpScanStep(), new NetOutputStep()]
}

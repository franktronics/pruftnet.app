import type { ComponentProps } from 'react'
import { LibraryStepCard, type Step } from './steps-card'
import {
    Zap,
    ScanLine,
    ScanText,
    Settings,
    Network,
    Shield,
    Activity,
    Database,
} from 'lucide-react'
import { cn } from '@repo/utils'

const COMPONENT_LIBRARY: Array<Step & { templateId: string }> = [
    {
        templateId: 'network-discovery',
        id: 1001,
        name: 'Network Discovery',
        description: 'Scan the network to identify active devices and their IP addresses',
        icon: <ScanLine className="size-5" />,
    },
    {
        templateId: 'port-analysis',
        id: 1002,
        name: 'Port Analysis',
        description: 'Analyze open ports and running services on discovered devices',
        icon: <ScanText className="size-5" />,
    },
    {
        templateId: 'configuration',
        id: 1003,
        name: 'Configuration',
        description: 'Configure analysis parameters and set up monitoring rules',
        icon: <Settings className="size-5" />,
    },
    {
        templateId: 'execute-analysis',
        id: 1004,
        name: 'Execute Analysis',
        description: 'Run the complete network analysis and generate reports',
        icon: <Zap className="size-5" />,
    },
    {
        templateId: 'topology-mapping',
        id: 1005,
        name: 'Topology Mapping',
        description: 'Map network topology and visualize device connections',
        icon: <Network className="size-5" />,
    },
    {
        templateId: 'security-scan',
        id: 1006,
        name: 'Security Scan',
        description: 'Perform security vulnerability assessment on network devices',
        icon: <Shield className="size-5" />,
    },
    {
        templateId: 'traffic-monitoring',
        id: 1007,
        name: 'Traffic Monitoring',
        description: 'Monitor and analyze network traffic patterns in real-time',
        icon: <Activity className="size-5" />,
    },
    {
        templateId: 'data-collection',
        id: 1008,
        name: 'Data Collection',
        description: 'Collect and store network data for historical analysis',
        icon: <Database className="size-5" />,
    },
]

type StepsComponentsProps = {
    activeId: number | string | null
} & ComponentProps<'div'>
export const StepsComponents = (props: StepsComponentsProps) => {
    const { activeId, className, ...rest } = props

    return (
        <div className={cn('flex flex-col gap-4', className)} {...rest}>
            <div className="mb-2">
                <h3 className="text-lg font-semibold">Available Components</h3>
                <p className="text-muted-foreground text-sm">
                    Drag components to the builder to create your analysis workflow
                </p>
            </div>
            <div className="flex flex-col gap-3">
                {COMPONENT_LIBRARY.map((component) => (
                    <LibraryStepCard
                        key={component.templateId}
                        step={component}
                        templateId={component.templateId}
                        activeId={activeId}
                    />
                ))}
            </div>
        </div>
    )
}

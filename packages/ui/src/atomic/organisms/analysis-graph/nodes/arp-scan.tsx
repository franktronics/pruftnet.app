import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import { z } from 'zod'
import { cn } from '@repo/utils'
import { Radar } from 'lucide-react'
import { NodeLayout } from '../nodes-layout'
import { useAppForm, withForm } from '../../../molecules'
import { ComponentProps } from 'react'

export type ArpScanNodeData = Node<{ name: string }, 'arp-scan'>
export type ArpScanProps = {
    className?: string
} & NodeProps<ArpScanNodeData>

export const ArpScan = (props: ArpScanProps) => {
    const { selected = false, className } = props

    const { updateNodeData } = useReactFlow()
    const form = useAppForm({
        defaultValues: { delay: 0 },
        validators: {
            onSubmit: paramFormSchema,
        },
        onSubmit: async (values) => {
            updateNodeData(props.id, {
                delay: values.value.delay,
            })
            return true
        },
    })

    const handleFormSubmit = async (): Promise<boolean> => {
        await form.handleSubmit()
        return form.state.isSubmitted
    }

    return (
        <NodeLayout.Root data={props} selected={selected} className={className}>
            <NodeLayout.Block>
                <Handle
                    position={Position.Left}
                    type="target"
                    style={{
                        background: 'none',
                        border: 'none',
                        width: '0.75em',
                        height: '0.75em',
                    }}
                >
                    <div
                        className={cn(
                            'border-background bg-primary border-2',
                            'pointer-events-none size-3 rounded-full',
                            'absolute -left-0.5',
                        )}
                    ></div>
                </Handle>

                <div className="flex items-center gap-2">
                    <div
                        className={cn(
                            'bg-primary/10 text-primary rounded-full transition-colors',
                            'flex size-9 shrink-0 items-center justify-center',
                        )}
                    >
                        <Radar className="size-5" />
                    </div>
                    <div>ARP</div>
                </div>

                <Handle
                    position={Position.Right}
                    type="source"
                    style={{
                        background: 'none',
                        border: 'none',
                        width: '0.75em',
                        height: '0.75em',
                    }}
                >
                    <div
                        className={cn(
                            'border-background bg-primary border-2',
                            'pointer-events-none size-3 rounded-full',
                            'absolute -right-0.5',
                        )}
                    ></div>
                </Handle>
            </NodeLayout.Block>
            <NodeLayout.Popup title="ARP Scan Node">
                <NodeLayout.Params>
                    <ParamTab form={form} />
                </NodeLayout.Params>
                <NodeLayout.Settings disabled={true}></NodeLayout.Settings>
            </NodeLayout.Popup>
            <NodeLayout.Menu></NodeLayout.Menu>
        </NodeLayout.Root>
    )
}

const paramFormSchema = z.object({
    delay: z.number().min(0).max(5000).describe('Delay between ARP requests in milliseconds'),
})

const ParamTab = withForm({
    defaultValues: { delay: 0 },
    props: {} as ComponentProps<'div'>,
    render: function Render(props) {
        const { form, className } = props
        return (
            <div className={cn('flex flex-col gap-4', className)}>
                <form.AppField
                    name="delay"
                    children={(field) => (
                        <field.FormInput
                            type="number"
                            label="Delay (ms)"
                            description="Enter the delay between ARP requests in milliseconds."
                            placeholder="0-5000"
                        />
                    )}
                />
            </div>
        )
    },
})

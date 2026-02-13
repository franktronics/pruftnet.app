import { useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import { z } from 'zod'
import { cn } from '@repo/utils'
import { Popsicle } from 'lucide-react'
import { NodeLayout } from '../nodes-layout'
import { useAppForm, withForm } from '../../../molecules'
import { ComponentProps } from 'react'
import { NodeHandle } from '../components'
import { BasicNodeData } from './utils'

export type IcmpNodeNodeData = Node<
    { name: string; delay: number; numberRequest: number } & BasicNodeData,
    'icmp-ping'
>
export type IcmpPingProps = {
    className?: string
} & NodeProps<IcmpNodeNodeData>

export const NodeIcmpPing = (props: IcmpPingProps) => {
    const { selected = false, className } = props

    const { updateNodeData } = useReactFlow()

    const form = useAppForm({
        defaultValues: {
            delay: props.data.delay || 0,
            numberRequest: props.data.numberRequest || 1,
        },
        validators: {
            onSubmit: paramFormSchema,
        },
        onSubmit: async (values) => {
            updateNodeData(props.id, {
                delay: values.value.delay,
                numberRequest: values.value.numberRequest,
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
                <NodeHandle type="target" />
                <div className="flex items-center gap-2">
                    <div
                        className={cn(
                            'bg-primary/10 text-primary rounded-full transition-colors',
                            'flex size-9 shrink-0 items-center justify-center',
                        )}
                    >
                        <Popsicle className="size-5" />
                    </div>
                    <div>ICMP Ping</div>
                </div>
                <NodeHandle type="source" />
            </NodeLayout.Block>
            <NodeLayout.Popup title="ARP Scan Node" onConfirm={handleFormSubmit}>
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
    delay: z.number().min(0).max(5000).describe('Delay between ICMP requests in milliseconds'),
    numberRequest: z.number().min(1).max(10).describe('Number of ICMP requests to send'),
})

const ParamTab = withForm({
    defaultValues: { delay: 0, numberRequest: 1 },
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
                <form.AppField
                    name="numberRequest"
                    children={(field) => (
                        <field.FormInput
                            type="number"
                            label="Number of Requests"
                            description="Enter the number of ICMP requests to send (1-10)."
                            placeholder="1-10"
                        />
                    )}
                />
            </div>
        )
    },
})

import { z } from 'zod'
import { useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { NodeLayout } from '../nodes-layout'
import { ComponentProps } from 'react'
import { useAppForm, withForm } from '../../../molecules'
import { NodeHandle } from '../components'
import { BasicNodeData } from './utils'

const paramFormSchema = z.object({
    ipv6Address: z
        .string()
        .regex(
            /^((?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|:(?::[0-9A-Fa-f]{1,4}){1,7}|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?:(?::[0-9A-Fa-f]{1,4}){1,6})|:(?:(?::[0-9A-Fa-f]{1,4}){1,6}))$/,
            'Invalid IPv6 address format',
        ),
})
type ParamFormValues = z.infer<typeof paramFormSchema>
export type Ipv6SingleNodeData = Node<ParamFormValues & BasicNodeData, 'ipv6-single'>
export type Ipv6SingleProps = {
    className?: string
} & NodeProps<Ipv6SingleNodeData>

export const NodeIpv6Single = (props: Ipv6SingleProps) => {
    const { selected = false, className } = props
    const { updateNodeData } = useReactFlow()

    const form = useAppForm({
        defaultValues: {
            ipv6Address: props.data.ipv6Address || '',
        },
        validators: {
            onSubmit: paramFormSchema,
        },
        onSubmit: async (values) => {
            updateNodeData(props.id, {
                ipv6Address: values.value.ipv6Address,
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
            <NodeLayout.Block className={className} contentClass="rounded-l-2xl p-2">
                <div className="flex items-center gap-2">
                    <div className="bg-chart-1/20 flex size-4 shrink-0 items-center justify-center rounded-sm">
                        <div className="bg-chart-1 size-1.5 rounded-full"></div>
                    </div>
                    <p className="text-foreground font-mono text-xs">
                        {!!props.data.ipv6Address
                            ? props.data.ipv6Address.slice(-12)
                            : 'xxxx:xxxx::0'}
                        {props.data.ipv6Address?.length > 12 ? '...' : ''}
                    </p>
                </div>
                <NodeHandle type="source" />
            </NodeLayout.Block>
            <NodeLayout.Popup title="Single IP Settings" onConfirm={handleFormSubmit}>
                <NodeLayout.Params>
                    <ParamTab form={form} />
                </NodeLayout.Params>
                <NodeLayout.Settings disabled={true}></NodeLayout.Settings>
            </NodeLayout.Popup>
            <NodeLayout.Menu></NodeLayout.Menu>
        </NodeLayout.Root>
    )
}

const ParamTab = withForm({
    defaultValues: { ipv6Address: '' },
    props: {} as ComponentProps<'div'>,
    render: function Render(props) {
        const { form, className } = props
        return (
            <div className={cn('flex flex-col gap-4', className)}>
                <form.AppField
                    name="ipv6Address"
                    children={(field) => (
                        <field.FormInput
                            label="IP Address"
                            description="Enter the IPv6 address."
                            placeholder="xxxx::xxxx"
                        />
                    )}
                />
            </div>
        )
    },
})

import { useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import { z } from 'zod'
import { cn } from '@repo/utils'
import { RadioTower } from 'lucide-react'
import { NodeLayout } from '../nodes-layout'
import { useAppForm, withForm } from '../../../molecules'
import { ComponentProps } from 'react'
import { NodeHandle } from '../components'
import { BasicNodeData } from './utils'

const paramFormSchema = z.object({
    delay: z.number().min(0).max(5000).describe('Delay after RS packet in milliseconds'),
})
type ParamFormValues = z.infer<typeof paramFormSchema>
export type Ipv6RsNodeData = Node<ParamFormValues & BasicNodeData, 'ipv6-rs'>
export type Ipv6RsProps = {
    className?: string
} & NodeProps<Ipv6RsNodeData>

export const NodeIpv6Rs = (props: Ipv6RsProps) => {
    const { selected = false, className } = props

    const { updateNodeData } = useReactFlow()

    const form = useAppForm({
        defaultValues: { delay: props.data.delay || 0 },
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
            <NodeLayout.Block contentClass="rounded-l-4xl rounded-r-lg">
                <div className="flex items-center gap-2">
                    <div
                        className={cn(
                            'bg-primary/10 text-primary transition-colors',
                            'flex size-9 shrink-0 items-center justify-center rounded-full',
                        )}
                    >
                        <RadioTower className="size-5" />
                    </div>
                    <div>IPv6 RS</div>
                </div>
                <NodeHandle type="source" />
            </NodeLayout.Block>
            <NodeLayout.Popup title="IPv6 Router Solicitation" onConfirm={handleFormSubmit}>
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
                            description="Enter the delay after Router Solicitation packet in milliseconds."
                            placeholder="0-5000"
                        />
                    )}
                />
            </div>
        )
    },
})

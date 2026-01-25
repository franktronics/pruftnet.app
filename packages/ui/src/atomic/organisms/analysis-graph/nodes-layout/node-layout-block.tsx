import { z } from 'zod'
import { cn } from '@repo/utils'
import { NodeToolbar, Position, useReactFlow } from '@xyflow/react'
import { useId, useRef, type ComponentProps } from 'react'
import {
    Button,
    ContextMenuTrigger,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
    Input,
} from '../../../atoms'
import { Ellipsis, Trash } from 'lucide-react'
import { useNodeContext } from './node-layout-context'
import { useForm } from '@tanstack/react-form'

type NodeLayoutBlockProps = {
    contentClass?: string
} & ComponentProps<'div'>
const Block = (props: NodeLayoutBlockProps) => {
    const { draggable, children, className, contentClass = '', ...rest } = props

    const { name, setPopupOpen, selected, nodeId } = useNodeContext()
    const contentRef = useRef<HTMLDivElement>(null)
    const { setNodes } = useReactFlow()

    const handleMnuBtnClick = (e: React.MouseEvent) => {
        if (!contentRef.current) return
        const rect = e.currentTarget.getBoundingClientRect()

        const fakeEvent = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            clientX: rect.left,
            clientY: rect.bottom + 4,
        })
        contentRef.current.dispatchEvent(fakeEvent)
    }

    const handleDeleteBtnClick = () => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    }

    return (
        <div
            draggable="false"
            className={cn('relative flex flex-col items-center gap-1', className)}
            {...rest}
        >
            <NodeToolbar className={cn('flex items-center gap-2')} position={Position.Top}>
                <Button variant="outline" size="icon" type="button" onClick={handleDeleteBtnClick}>
                    <Trash className="size-4" />
                </Button>
                <Button variant="outline" size="icon" type="button" onClick={handleMnuBtnClick}>
                    <Ellipsis className="size-4" />
                </Button>
            </NodeToolbar>
            <ContextMenuTrigger asChild>
                <div
                    className={cn(
                        'relative flex flex-col gap-0 border-2 p-3 transition-all',
                        'bg-background rounded-lg',
                        selected
                            ? 'border-primary ring-primary/20 ring-2'
                            : 'border-border hover:border-primary/50',
                        contentClass,
                    )}
                    onDoubleClick={() => setPopupOpen(true)}
                    ref={contentRef}
                >
                    {children}
                </div>
            </ContextMenuTrigger>
            <span className="text-foreground text-xs font-medium">{name}</span>
            <ChangeNameDialog />
        </div>
    )
}

type ChangeNameDialogProps = {} & ComponentProps<typeof DialogContent>
const ChangeNameDialog = (props: ChangeNameDialogProps) => {
    const { ...rest } = props
    const { name, nodeId, renamePopupOpen, setRenamePopupOpen } = useNodeContext()
    const inputId = useId()
    const { updateNodeData } = useReactFlow()

    const form = useForm({
        defaultValues: { name: name },
        validators: {
            onChange: z.object({ name: z.string().min(5) }),
        },
        onSubmit: async (values) => {
            if (values.value.name !== name) {
                updateNodeData(nodeId, { name: values.value.name })
            }
            setRenamePopupOpen(false)
        },
    })

    return (
        <Dialog open={renamePopupOpen} onOpenChange={setRenamePopupOpen}>
            <DialogContent {...rest}>
                <DialogHeader>
                    <DialogTitle>Rename Node: {name}</DialogTitle>
                    <DialogDescription></DialogDescription>
                </DialogHeader>
                <div className="pb-2">
                    <form.Field
                        name="name"
                        children={(field) => (
                            <Field data-invalid={!field.state.meta.isValid}>
                                <FieldLabel htmlFor={inputId}>New Name</FieldLabel>
                                <Input
                                    value={field.state.value}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    onBlur={field.handleBlur}
                                    id={inputId}
                                    placeholder="Node..."
                                />
                                {field.state.meta.isValid ? (
                                    <FieldDescription>
                                        Enter a new name for this node.
                                    </FieldDescription>
                                ) : (
                                    <FieldError errors={field.state.meta.errors} />
                                )}
                            </Field>
                        )}
                    />
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button type="button" onClick={() => form.handleSubmit()}>
                        Rename
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

Block.type = 'Block'
export { Block, type NodeLayoutBlockProps }

import { cn } from '@repo/utils'
import { NodeToolbar, Position } from '@xyflow/react'
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
    FieldLabel,
    Input,
} from '../../../atoms'
import { Ellipsis, Trash } from 'lucide-react'
import { useNodeContext } from './node-layout-context'

type NodeLayoutBlockProps = {
    contentClass?: string
} & ComponentProps<'div'>
const Block = (props: NodeLayoutBlockProps) => {
    const { draggable, children, className, contentClass = '', ...rest } = props

    const { name, setPopupOpen, selected } = useNodeContext()
    const contentRef = useRef<HTMLDivElement>(null)

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

    return (
        <div
            draggable="false"
            className={cn('relative flex flex-col items-center gap-1', className)}
            onDoubleClick={() => setPopupOpen(true)}
            {...rest}
        >
            <NodeToolbar className={cn('flex items-center gap-2')} position={Position.Top}>
                <Button variant="outline" size="icon" type="button">
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
    const { name, renamePopupOpen, setRenamePopupOpen } = useNodeContext()
    const inputId = useId()

    return (
        <Dialog open={renamePopupOpen} onOpenChange={setRenamePopupOpen}>
            <DialogContent {...rest}>
                <DialogHeader>
                    <DialogTitle>Rename Node: {name}</DialogTitle>
                    <DialogDescription></DialogDescription>
                    <div className="pb-2">
                        <Field>
                            <FieldLabel htmlFor={inputId}>New Name</FieldLabel>
                            <Input id={inputId} placeholder="Node..." />
                            <FieldDescription>Enter a new name for this node.</FieldDescription>
                        </Field>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button type="submit">Rename</Button>
                    </DialogFooter>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    )
}

Block.type = 'Block'
export { Block, type NodeLayoutBlockProps }

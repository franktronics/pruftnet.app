import { cn } from '@repo/utils'
import { NodeToolbar } from '@xyflow/react'
import { useState, type ComponentProps } from 'react'
import {
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DropdownMenuTrigger,
} from '../../../atoms'
import { Ellipsis, Trash } from 'lucide-react'
import { useNodeContext } from './node-layout-context'

type NodeLayoutBlockProps = {
    selected?: boolean
    contentClass?: string
} & ComponentProps<'div'>
const Block = (props: NodeLayoutBlockProps) => {
    const {
        draggable,
        children,
        className,
        selected = false,
        contentClass = '',
        ref,
        ...rest
    } = props
    const { name, setPopupOpen } = useNodeContext()
    const [renamePopupOpen, setRenamePopupOpen] = useState(false)
    const [isHovered, setIsHovered] = useState(false)

    return (
        <div
            draggable="false"
            className={cn('relative flex flex-col items-center gap-1', className)}
            ref={ref}
            onDoubleClick={() => setPopupOpen(true)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            {...rest}
        >
            <NodeToolbar className="flex items-center gap-2" isVisible={isHovered}>
                <Button variant="outline" size="icon" type="button">
                    <Trash className="size-4" />
                </Button>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" type="button">
                        <Ellipsis className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
            </NodeToolbar>
            <div
                className={cn(
                    'relative flex flex-col gap-0 border-2 p-3 transition-all',
                    'bg-background rounded-lg',
                    selected
                        ? 'border-primary ring-primary/20 ring-2'
                        : 'border-border hover:border-primary/50',
                    contentClass,
                )}
            >
                {children}
            </div>
            <span className="text-foreground text-xs font-medium">{name}</span>
            <ChangeNameDialog open={renamePopupOpen} onOpenChange={setRenamePopupOpen} />
        </div>
    )
}

type ChangeNameDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
} & ComponentProps<typeof DialogContent>
const ChangeNameDialog = (props: ChangeNameDialogProps) => {
    const { open, onOpenChange, ...rest } = props
    const { name } = useNodeContext()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent {...rest}>
                <DialogHeader>
                    <DialogTitle>Rename Node: {name}</DialogTitle>
                    <DialogDescription></DialogDescription>
                    <div>OK</div>
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

import { ComponentProps, ComponentPropsWithoutRef, ReactNode, useState } from 'react'
import {
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '../../atoms'
import { cn } from '@repo/utils'

export type PopupProps = {
    trigger: ReactNode
    title: string
    description: string
    blockOpening?: boolean
    onClose?: () => void
    onOpen?: () => void
    onConfirm?: () => void | boolean | Promise<void | boolean> // Return true to close the popup
    btnCloseText?: string
    btnSaveText?: string
    btnSaveprops?: ComponentProps<typeof Button>
} & ComponentPropsWithoutRef<'div'>

export const Popup = (props: PopupProps) => {
    const {
        className,
        title,
        description,
        blockOpening = false,
        trigger,
        children,
        onClose,
        onOpen,
        onConfirm,
        btnCloseText = 'Cancel',
        btnSaveText = 'Confirm',
        btnSaveprops = {},
        ...rest
    } = props
    const [open, setOpen] = useState(false)

    const handleOpenChange = (open: boolean) => {
        if (blockOpening) {
            return
        }
        setOpen(open)
        if (open && onOpen) {
            onOpen()
        } else if (!open && onClose) {
            onClose()
        }
    }

    const handleConfirm = async () => {
        const result = await onConfirm?.()
        if (result === true) {
            setOpen(false)
        }
    }

    if (blockOpening) {
        return <>{trigger}</>
    }

    return (
        <Dialog open={!blockOpening && open} onOpenChange={handleOpenChange} {...rest}>
            <DialogTrigger asChild={true}>{trigger}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className={cn('text-accent-foreground', className)}>{children}</div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">
                            {btnCloseText}
                        </Button>
                    </DialogClose>
                    <Button type="submit" onClick={handleConfirm} {...btnSaveprops}>
                        {btnSaveText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

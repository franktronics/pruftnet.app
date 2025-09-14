import { ComponentPropsWithoutRef, ReactNode, useState } from 'react'
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

export type PopupProps = {
    trigger: ReactNode
    title: string
    description: string
    onClose?: () => void
    onOpen?: () => void
    onConfirm?: () => void | boolean // Return true to close the popup
    btnCloseText?: string
    btnSaveText?: string
} & ComponentPropsWithoutRef<'div'>

export const Popup = (props: PopupProps) => {
    const {
        className,
        title,
        description,
        trigger,
        children,
        onClose,
        onOpen,
        onConfirm,
        btnCloseText = 'Cancel',
        btnSaveText = 'Confirm',
        ...rest
    } = props
    const [open, setOpen] = useState(false)

    const handleOpenChange = (open: boolean) => {
        setOpen(open)
        if (open && onOpen) {
            onOpen()
        } else if (!open && onClose) {
            onClose()
        }
    }

    const handleConfirm = () => {
        const result = onConfirm?.()
        if (result === true) {
            setOpen(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange} {...rest}>
            <DialogTrigger asChild={true}>{trigger}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className={className}>{children}</div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">
                            {btnCloseText}
                        </Button>
                    </DialogClose>
                    <Button type="submit" onClick={handleConfirm}>
                        {btnSaveText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

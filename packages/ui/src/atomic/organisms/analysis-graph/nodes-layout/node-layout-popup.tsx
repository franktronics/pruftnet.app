import { Children, type ComponentProps, isValidElement } from 'react'
import {
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    TabsDisplay,
    TabsDisplayContent,
    TabsDisplayList,
    TabsDisplayTrigger,
} from '../../../atoms'
import { useNodeContext } from './node-layout-context'
import { cn } from '@repo/utils'
import { useGraphContext } from '../components'

type NodeLayoutPopupProps = {
    title: string
    description?: string
    onConfirm?: () => boolean | void | Promise<void | boolean> // Return false to prevent closing the popup and true to close it
} & ComponentProps<typeof DialogContent>
const Popup = (props: NodeLayoutPopupProps) => {
    const { children, title, description = '', className, onConfirm, ...rest } = props
    const { popupOpen, setPopupOpen } = useNodeContext()
    const { viewOnly } = useGraphContext()

    let ParamsElt = null
    let SettingsElt = null
    const childProps = {
        params: null as any,
        settings: null as any,
    }
    Children.forEach(children, (child) => {
        if (!isValidElement(child)) {
            return
        }
        if (child.type === Params) {
            ParamsElt = child
            childProps.params = child.props
        } else if (child.type === Settings) {
            SettingsElt = child
            childProps.settings = child.props
        }
    })

    const handleConfirm = async () => {
        if (onConfirm) {
            const result = await onConfirm()
            if (result === false) {
                return
            }
        }
        setPopupOpen(false)
    }

    return (
        <Dialog open={popupOpen && viewOnly !== true} onOpenChange={setPopupOpen}>
            <DialogContent className={cn('min-w-150', className)} {...rest}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div>
                    <TabsDisplay defaultValue="params">
                        <TabsDisplayList>
                            <TabsDisplayTrigger
                                value="params"
                                disabled={childProps.params?.disabled}
                            >
                                Parameters
                            </TabsDisplayTrigger>
                            <TabsDisplayTrigger
                                value="settings"
                                disabled={childProps.settings?.disabled}
                            >
                                Settings
                            </TabsDisplayTrigger>
                        </TabsDisplayList>
                        <TabsDisplayContent value="params">{ParamsElt}</TabsDisplayContent>
                        <TabsDisplayContent value="settings">{SettingsElt}</TabsDisplayContent>
                    </TabsDisplay>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button type="button" onClick={handleConfirm}>
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const Params = (props: { disabled?: boolean } & ComponentProps<'div'>) => {
    const { children, ...rest } = props
    return <div {...rest}>{children}</div>
}

const Settings = (props: { disabled?: boolean } & ComponentProps<'div'>) => {
    const { children, ...rest } = props
    return <div {...rest}>{children}</div>
}

export { Popup, Params, Settings, type NodeLayoutPopupProps }

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

type NodeLayoutPopupProps = {
    title: string
    description?: string
} & ComponentProps<typeof DialogContent>
const Popup = (props: NodeLayoutPopupProps) => {
    const { children, title, description = '', ...rest } = props
    const { popupOpen, setPopupOpen } = useNodeContext()

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
        }
        if (child.type === Settings) {
            SettingsElt = child
            childProps.settings = child.props
        }
    })

    return (
        <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
            <DialogContent {...rest}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
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
                        <Button type="submit">Save changes</Button>
                    </DialogFooter>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    )
}
Popup.type = 'Popup'

const Params = (props: { disabled?: boolean } & ComponentProps<'div'>) => {
    const { children, ...rest } = props
    return <div {...rest}>{children}</div>
}
Params.type = 'Params'

const Settings = (props: { disabled?: boolean } & ComponentProps<'div'>) => {
    const { children, ...rest } = props
    return <div {...rest}>{children}</div>
}
Settings.type = 'Settings'

export { Popup, Params, Settings, type NodeLayoutPopupProps }

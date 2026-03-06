import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Separator,
    Switch,
} from '@repo/ui/atoms'
import { useId } from 'react'
import { useSettingsContext } from './context/settings-context'
import { cn } from '@repo/utils'

export function CaptureSettings() {
    const maxPacketId = useId()
    const promiscuousId = useId()
    const protocolConfigId = useId()
    const { form } = useSettingsContext()
    const { Field } = form

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Capture</h3>
                <p className="text-muted-foreground text-sm">Configure packet capture settings.</p>
            </div>
            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle>Packet Capture</CardTitle>
                    <CardDescription>Configure packet capture behavior and limits.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor={maxPacketId}>Maximum Packet Buffer Size</Label>
                        <Field
                            name="maxPacketBufferSize"
                            children={(field) => (
                                <>
                                    <Input
                                        id={maxPacketId}
                                        type="number"
                                        placeholder="10000"
                                        value={field.state.value ?? ''}
                                        onChange={(e) => field.handleChange(Number(e.target.value))}
                                        onBlur={field.handleBlur}
                                        className={cn({
                                            'border-destructive': !field.state.meta.isValid,
                                        })}
                                    />
                                    <p className="text-destructive text-xs">
                                        {field.state.meta.errors.map((e) => e.message).join(', ')}
                                    </p>
                                </>
                            )}
                        />
                        <p className="text-muted-foreground text-xs">
                            Maximum number of packets to keep in memory before discarding old ones.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-6">
                            <Label
                                htmlFor={promiscuousId}
                                className="text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                Promiscuous mode
                            </Label>
                            <Field
                                name="promiscuousMode"
                                children={(field) => (
                                    <>
                                        <Switch
                                            checked={field.state.value}
                                            id={promiscuousId}
                                            onCheckedChange={(v) => field.handleChange(v)}
                                            onBlur={field.handleBlur}
                                        />
                                        <p className="text-destructive text-xs">
                                            {field.state.meta.errors
                                                .map((e) => e.message)
                                                .join(', ')}
                                        </p>
                                    </>
                                )}
                            />
                        </div>
                        <p className="text-muted-foreground text-xs">
                            Capture all packets on the network segment, not just those addressed to
                            this host.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Packet Parsing</CardTitle>
                    <CardDescription>
                        Configure how captured packets are parsed and interpreted.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor={protocolConfigId}>
                            protocol configuration input file (Ethernet file)
                        </Label>
                        <Field
                            name="protocolEntryFile"
                            children={(field) => (
                                <>
                                    <Input
                                        id={protocolConfigId}
                                        type="text"
                                        placeholder=".../protocols/ethernet.json"
                                        value={field.state.value ?? ''}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                        onBlur={field.handleBlur}
                                    />
                                    <p className="text-destructive text-xs">
                                        {field.state.meta.errors.map((e) => e.message).join(', ')}
                                    </p>
                                </>
                            )}
                        />
                        <p className="text-muted-foreground text-xs">
                            Path to the configuration file for the Ethernet input protocol. The path
                            to the configuration files for other protocols is defined in the
                            Ethernet configuration file.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

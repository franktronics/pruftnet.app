import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Label,
    RadioGroup,
    RadioGroupItem,
    Separator,
} from '@repo/ui/atoms'
import { useTheme } from '@repo/ui/molecules'
import { cn } from '@repo/utils'
import { Moon, PanelsTopLeft, Sun, type LucideIcon } from 'lucide-react'
import { useId, type ComponentProps } from 'react'
import { useSettingsContext } from './context/settings-context'

export function GeneralSettings() {
    const captureTabId = useId()
    const connectionLineId = useId()
    const { setTheme, theme } = useTheme()
    const { form } = useSettingsContext()
    const { Field } = form

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">General</h3>
                <p className="text-muted-foreground text-sm">
                    Manage your general application settings.
                </p>
            </div>
            <Separator />
            <Card>
                <CardHeader>
                    <CardTitle>Theme</CardTitle>
                    <CardDescription>Choose your preferred application theme.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <RadioGroup
                        defaultValue={theme}
                        onValueChange={setTheme}
                        className="grid grid-cols-3 gap-4"
                    >
                        <RadioThemeCard value="light" text="Light" icon={Sun} />
                        <RadioThemeCard value="dark" text="Dark" icon={Moon} />
                        <RadioThemeCard value="system" text="System" icon={PanelsTopLeft} />
                    </RadioGroup>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Capture view</CardTitle>
                    <CardDescription>Configure packet view UI</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Capture view default tab.</Label>
                        <Field
                            name="defaultCaptureTab"
                            children={(field) => (
                                <>
                                    <RadioGroup
                                        value={field.state.value}
                                        onValueChange={(v: 'scan' | 'graph') =>
                                            field.handleChange(v)
                                        }
                                        className="flex gap-6"
                                    >
                                        <div className="flex items-center gap-3">
                                            <RadioGroupItem value="scan" id={captureTabId + 'r1'} />
                                            <Label htmlFor={captureTabId + 'r1'}>Scan</Label>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <RadioGroupItem
                                                value="graph"
                                                id={captureTabId + 'r2'}
                                            />
                                            <Label htmlFor={captureTabId + 'r2'}>Graph</Label>
                                        </div>
                                    </RadioGroup>
                                    <p className="text-destructive text-xs">
                                        {field.state.meta.errors.map((e) => e.message).join(', ')}
                                    </p>
                                </>
                            )}
                        />
                        <p className="text-muted-foreground text-xs">
                            Select the default tab to display when opening the capture view.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

type RadioThemeCardProps = {
    value: string
    icon: LucideIcon
    text: string
} & ComponentProps<'div'>

const RadioThemeCard = (props: RadioThemeCardProps) => {
    const { className, value, icon: Icon, text, ...rest } = props
    const id = useId()

    return (
        <div className="relative flex-1" {...rest}>
            <RadioGroupItem value={value} id={id} className="peer sr-only" aria-label={text} />
            <Label
                htmlFor={id}
                className={cn(
                    'border-muted bg-popover hover:bg-accent hover:text-accent-foreground flex cursor-pointer flex-col items-center justify-between rounded-md border p-4 transition-colors',
                    'peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 [&:has([data-state=checked])]:border-primary',
                )}
            >
                <Icon className="mb-3 h-6 w-6" />
                <span className="text-sm font-medium">{text}</span>
            </Label>
        </div>
    )
}

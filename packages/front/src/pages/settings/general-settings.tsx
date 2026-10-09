import { useId, useState } from 'react'

import { Button } from '@repo/ui/atoms'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    ToggleGroup,
    ToggleGroupItem,
} from '@repo/ui/molecules'

import { useAppSettings } from '#front/app/settings/app-settings-context'
import { themeOptions } from '#front/theme/theme-options'
import { useTheme } from '#front/theme/theme-provider'
import { SettingRow, SettingsGroup } from './settings-layout'

function ResetSettingsDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { resetSettings } = useAppSettings()
    const { setTheme } = useTheme()

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Reset all application settings?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Every setting will return to its default value, including the theme.
                        Retained captures are not affected.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            resetSettings()
                            setTheme('system')
                        }}
                    >
                        Reset settings
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

export function GeneralSettings() {
    const { theme, setTheme } = useTheme()
    const themeLabelId = useId()
    const [resetOpen, setResetOpen] = useState(false)

    return (
        <>
            <SettingsGroup title="Appearance">
                <SettingRow
                    label="Theme"
                    labelId={themeLabelId}
                    description="System follows the operating system light or dark appearance."
                    control={
                        <ToggleGroup
                            aria-labelledby={themeLabelId}
                            spacing={1}
                            value={[theme]}
                            onValueChange={(values) => {
                                // Single-choice group: ignore attempts to deselect the active mode.
                                const next = themeOptions.find(
                                    (option) => option.value === values[0],
                                )
                                if (next) setTheme(next.value)
                            }}
                        >
                            {themeOptions.map((option) => (
                                <ToggleGroupItem
                                    key={option.value}
                                    value={option.value}
                                    className="text-muted-foreground data-pressed:bg-muted data-pressed:text-foreground px-2.5"
                                >
                                    {option.label}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    }
                />
            </SettingsGroup>

            <SettingsGroup title="Reset">
                <SettingRow
                    label="Restore defaults"
                    description="Return every application setting, including the theme, to its default value. Captures are not affected."
                    control={
                        <Button variant="outline" onClick={() => setResetOpen(true)}>
                            Reset
                        </Button>
                    }
                />
            </SettingsGroup>
            <ResetSettingsDialog open={resetOpen} onOpenChange={setResetOpen} />
        </>
    )
}

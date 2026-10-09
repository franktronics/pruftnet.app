import { SettingRow, SettingsGroup } from './settings-layout'

export function StorageSettings() {
    return (
        <SettingsGroup title="Capture storage">
            <SettingRow
                label="Retention"
                description="Capture files, durable summaries, and exports are managed by the backend. Retention controls will appear here when they become configurable."
                control={<span className="text-muted-foreground text-xs">Managed by backend</span>}
            />
        </SettingsGroup>
    )
}

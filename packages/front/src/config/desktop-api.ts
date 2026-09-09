import type {
    ApplicationCommandId,
    ApplicationCommandStateSnapshot,
} from '@repo/shared/app-command'
import type { Theme } from '#front/theme/theme'

declare global {
    interface DesktopExportDestinationSelection {
        readonly destinationToken: string
        readonly path: string
    }

    interface Window {
        readonly pruftnet?: {
            readonly platform: string
            readonly rpcUrl: string
            readonly setTheme: (theme: Theme) => Promise<'dark' | 'light'>
            readonly selectExportDestination: (
                format: 'pcapng' | 'pcap',
            ) => Promise<DesktopExportDestinationSelection | null>
            readonly updateApplicationMenu: (snapshot: ApplicationCommandStateSnapshot) => void
            readonly onApplicationCommand: (
                listener: (id: ApplicationCommandId) => void,
            ) => () => void
        }
    }
}

export {}

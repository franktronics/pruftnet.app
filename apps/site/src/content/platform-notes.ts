import type { Platform } from '#site/releases/assets'

/** First-run requirements per platform, summarized from the root README "Install" section. */
export interface PlatformNote {
    requirement: string
    steps: string[]
    command?: string
}

export const platformNotes: Record<Platform, PlatformNote> = {
    macos: {
        requirement: 'macOS 15 or later, Apple Silicon or Intel.',
        steps: [
            'Builds are not notarized yet. If macOS blocks the first launch, choose Open Anyway in System Settings › Privacy & Security.',
            'Live capture needs access to /dev/bpf*. Wireshark’s ChmodBPF provides it, or grant it for the session:',
        ],
        command: 'sudo chown "$USER" /dev/bpf*',
    },
    windows: {
        requirement: 'Windows on x64.',
        steps: [
            'Install Npcap first. Pruftnet uses it for capture and does not bundle it.',
            'The installer is not signed yet, so Windows may show a publisher warning.',
        ],
    },
    linux: {
        requirement: 'Ubuntu 24.04+ or Debian 13+, x64 or ARM64.',
        steps: [
            'Use the Debian package for live capture; AppImage cannot keep file capabilities.',
            'Grant capture rights to the native worker only, never to the app itself:',
        ],
        command:
            'sudo setcap cap_net_raw,cap_net_admin=eip /opt/Pruftnet/resources/native/pruftnet_capture_worker',
    },
}

export const serverUsage = {
    command: './pruftnet serve',
    url: 'http://127.0.0.1:3000',
}

/*
 * Detect if the app is running in Electron or Web environment.
 */
export const detectPlatform = (): {
    isElectron: boolean
    isWeb: boolean
} => {
    const isElectron = typeof window !== 'undefined' && 'electron' in window
    return { isElectron, isWeb: !isElectron }
}

const pendingCaptureSettingsKey = 'pruftnet-pending-capture-settings'
const captureSettingsRequestEvent = 'pruftnet:capture-settings-request'

export function requestCaptureSettings() {
    window.sessionStorage.setItem(pendingCaptureSettingsKey, 'true')
    window.dispatchEvent(new Event(captureSettingsRequestEvent))
}

export function consumeCaptureSettingsRequest() {
    const pending = window.sessionStorage.getItem(pendingCaptureSettingsKey) === 'true'
    window.sessionStorage.removeItem(pendingCaptureSettingsKey)
    return pending
}

export function subscribeToCaptureSettingsRequests(listener: () => void) {
    window.addEventListener(captureSettingsRequestEvent, listener)
    return () => window.removeEventListener(captureSettingsRequestEvent, listener)
}

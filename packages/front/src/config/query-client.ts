import { QueryClient } from '@tanstack/react-query'

export function retryTransientFailure(failureCount: number, error: unknown) {
    if (failureCount >= 1) return false
    const status =
        typeof error === 'object' && error !== null && 'status' in error
            ? (error as { status?: unknown }).status
            : undefined
    if (status === 503) return true
    if (status === 400 || status === 403 || status === 404 || status === 410) return false
    if (error instanceof TypeError) return true
    const name = error instanceof Error ? error.constructor.name : ''
    if (
        name === 'PacketDetailContentTypeError' ||
        name === 'PacketDetailKeyError' ||
        name === 'PacketDetailInvalidError'
    )
        return false
    return false
}

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: retryTransientFailure,
            staleTime: 5_000,
            refetchOnWindowFocus: false,
        },
        mutations: {
            retry: 0,
        },
    },
})

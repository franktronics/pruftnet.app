import { ClientError } from '../trpc/error-parser'
import { QueryClientProvider, QueryClient, useQuery, UseQueryOptions } from '@tanstack/react-query'
import { PropsWithChildren, useCallback } from 'react'
import { toast } from 'sonner'

export type QueryFetcherProps<T> = {
    procedure: () => Promise<T>
    popupOnError?: boolean
    popupOnFetching?: {
        fetching: string
        success: string
    }
} & Omit<UseQueryOptions<T, ClientError>, 'queryFn' | 'enabled'>

type ErrorDetailsProps = {
    error: ClientError
}

function ErrorDetails({ error }: ErrorDetailsProps) {
    const errorData = error.getErrorData()

    return (
        <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{error.message}</p>
            {(errorData.origin || errorData.whatToDo) && (
                <div className="bg-destructive/10 border-destructive/20 space-y-2 rounded-md border p-2">
                    {errorData.whatToDo && (
                        <div className="text-destructive/90 text-xs">
                            <span className="font-semibold">What to do: </span>
                            <span>{errorData.whatToDo}</span>
                        </div>
                    )}
                    {errorData.origin && (
                        <div className="text-destructive/90 text-xs">
                            <span className="font-semibold">Origin: </span>
                            <span className="opacity-80">{errorData.origin}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export function useQueryFetcher<T>(props: QueryFetcherProps<T>) {
    const { procedure, popupOnError = true, popupOnFetching, ...queryOptions } = props

    const query = useQuery({
        queryFn: procedure,
        enabled: false,
        retry: false,
        ...queryOptions,
    })

    const fetchData = useCallback(async () => {
        let toastId: string | number | undefined

        if (popupOnFetching) {
            toastId = toast.loading(popupOnFetching.fetching)
        }

        try {
            const result = await query.refetch()

            if (result.error) {
                if (toastId) toast.dismiss(toastId)
                if (popupOnError) {
                    toast.error(<ErrorDetails error={result.error} />, {
                        duration: 5000,
                    })
                }
                return result
            }

            if (toastId) {
                toast.success(popupOnFetching?.success, { id: toastId })
            }

            return result
        } catch (error) {
            if (toastId) toast.dismiss(toastId)

            if (popupOnError && error instanceof ClientError) {
                toast.error(<ErrorDetails error={error} />, {
                    duration: 5000,
                })
            }

            throw error
        }
    }, [procedure, popupOnError, popupOnFetching, query])

    return { ...query, fetchData }
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: false,
        },
    },
})

export function FetcherProvider(props: PropsWithChildren) {
    const { children } = props
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

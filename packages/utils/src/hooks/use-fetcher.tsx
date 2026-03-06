import { HttpMethod } from '@repo/utils'
import { cn } from '../classnames/classnames'
import { ClientError } from '../trpc/client/client-error'
import {
    QueryClientProvider,
    QueryClient,
    useQuery,
    UseQueryOptions,
    useMutation,
    UseMutationOptions,
} from '@tanstack/react-query'
import { ComponentPropsWithoutRef, PropsWithChildren, useCallback } from 'react'
import { toast } from 'sonner'

export type QueryFetcherProps<T> = {
    procedure: () => Promise<T>
    popupOnError?: boolean
    popupOnFetching?: {
        fetching: string
        success: string
    }
} & Omit<UseQueryOptions<T, ClientError>, 'queryFn'>
export function useQueryFetcher<T>(props: QueryFetcherProps<T>) {
    const { procedure, popupOnError = true, popupOnFetching, enabled, ...queryOptions } = props

    const fetchData = async () => {
        let toastId: string | number | undefined

        if (popupOnFetching) {
            toastId = toast.loading(popupOnFetching.fetching)
        }

        try {
            const result = await procedure()
            if (toastId) {
                toast.success(popupOnFetching?.success, { id: toastId })
            }
            return result
        } catch (error) {
            if (toastId) toast.dismiss(toastId)

            if (popupOnError && error instanceof ClientError) {
                toast.error(<ClientErrorParser error={error} />, {
                    duration: 5000,
                })
            } else if (popupOnError) {
                toast.error((error as Error).message, {
                    duration: 5000,
                })
            }

            throw error
        }
    }

    const query = useQuery({
        queryFn: fetchData,
        enabled: enabled ?? false,
        retry: false,
        ...queryOptions,
    })

    return { ...query }
}

export type MutateFetcherProps<K, T> = {
    procedure: {
        mutate: (input: K, method?: HttpMethod) => () => Promise<T>
    }
    method?: HttpMethod
    popupOnError?: boolean
    popupOnFetching?: {
        fetching: string
        success: string
    }
} & Omit<UseMutationOptions<T, ClientError, K>, 'mutationFn'>

export function useMutateFetcher<K, T>(props: MutateFetcherProps<K, T>) {
    const {
        procedure,
        method = 'POST',
        popupOnError = true,
        popupOnFetching,
        ...mutationOptions
    } = props

    const mutation = useMutation({
        mutationFn: async (input) => {
            return await procedure.mutate(input, method)()
        },
        retry: false,
        ...mutationOptions,
    })

    const mutateData = useCallback(
        async (input: K) => {
            let toastId: string | number | undefined

            if (popupOnFetching) {
                toastId = toast.loading(popupOnFetching.fetching)
            }

            try {
                const result = await mutation.mutateAsync(input)

                if (toastId) {
                    toast.success(popupOnFetching?.success, { id: toastId })
                }

                return result
            } catch (error: any) {
                if (toastId) toast.dismiss(toastId)

                if (popupOnError && error instanceof ClientError) {
                    toast.error(<ClientErrorParser error={error} />, {
                        duration: 5000,
                    })
                } else if (popupOnError) {
                    toast.error(error.message, {
                        duration: 5000,
                    })
                }

                throw error
            }
        },
        [procedure, popupOnError, popupOnFetching, mutation],
    )

    return { ...mutation, mutateData }
}

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: false,
        },
        mutations: {
            retry: false,
        },
    },
})
export function FetcherProvider(props: PropsWithChildren) {
    const { children } = props
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

type ClientErrorParserProps = {
    error: ClientError
} & ComponentPropsWithoutRef<'div'>
export function ClientErrorParser(props: ClientErrorParserProps) {
    const { error, className, ...rest } = props

    const errorData = error.getErrorData()

    return (
        <div className={cn('flex flex-col gap-2', className)} {...rest}>
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

export { useQueries, useQuery, useMutation } from '@tanstack/react-query'

import { useQuery } from '@tanstack/react-query'

export enum REQ_TYPE {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    DELETE = 'DELETE',
}
async function fetchWeb<T>(reqType: REQ_TYPE, endpoint: string, body?: string): Promise<T> {
    const header = new Headers()
    header.append('Content-Type', 'application/json')

    const request = new Request(endpoint, {
        method: reqType,
        headers: header,
        body: body,
    })
    const response = await fetch(request)
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - endpoint: ${endpoint}`)
    }
    return (await response.json()) as T
}

export type FetcherProps = {
    queryKey: string[]
    url: string
}
export function useFetcher(props: FetcherProps) {
    const { queryKey } = props

    const {} = useQuery({
        queryKey: queryKey,
        queryFn: async () => {
            return fetchWeb<any>(REQ_TYPE.GET, '/api/example-endpoint')
        },
    })
}

export type MutatorProps = {}

export function useMutator(props: MutatorProps) {}

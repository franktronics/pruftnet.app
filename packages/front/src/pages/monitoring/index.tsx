import { fetcher } from '../../config/client-trpc'
import { useQueryFetcher } from '@repo/utils'

function Monitoring() {
    const { data } = useQueryFetcher({
        procedure: fetcher.logger.list.query({}),
        enabled: true,
        retry: 0,
        popupOnError: true,
        queryKey: ['monitoring'],
        staleTime: Infinity,
    })

    return <div></div>
}

export default Monitoring

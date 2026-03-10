import { ClientError } from './client/client-error'
import { createClient } from './client/client'
import { createWsClient } from './client/ws-client'

export const trpcClient = {
    ClientError,
    createClient,

    createWsClient,
}

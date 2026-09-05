import { RpcClient } from '@effect/rpc'
import { AppRpcGroup } from '@repo/shared'
import {
    Cause,
    Context,
    Effect,
    Exit,
    Layer,
    ManagedRuntime,
    Option,
    Schedule,
    Stream,
} from 'effect'

import { RpcClientLive } from './rpc-client'

const appClientEffect = RpcClient.make(AppRpcGroup)

export type AppRpcClient = Effect.Effect.Success<typeof appClientEffect>

class AppRpcClientService extends Context.Tag('#front/config/AppRpcClientService')<
    AppRpcClientService,
    AppRpcClient
>() {}

const AppRpcClientLive = Layer.scoped(AppRpcClientService, appClientEffect).pipe(
    Layer.provide(RpcClientLive),
)
const runtime = ManagedRuntime.make(AppRpcClientLive)

async function unwrapExit<A, E>(exit: Exit.Exit<A, E>): Promise<A> {
    if (Exit.isSuccess(exit)) return exit.value
    const failure = Cause.failureOption(exit.cause)
    if (Option.isSome(failure)) throw failure.value
    throw Cause.squash(exit.cause)
}

export async function callRpc<A>(
    use: (client: AppRpcClient) => Effect.Effect<A, unknown>,
    options?: { readonly signal?: AbortSignal },
): Promise<A> {
    const effect = Effect.flatMap(AppRpcClientService, use)
    return unwrapExit(await runtime.runPromiseExit(effect, options))
}

export interface RpcStreamSubscriptionOptions<A> {
    readonly stream: (client: AppRpcClient) => Stream.Stream<A, unknown>
    readonly onValue: (value: A) => void
    readonly restartOnEnd?: boolean
    readonly onDisconnect?: (cause: unknown) => void
}

const reconnectSchedule = Schedule.exponential('250 millis').pipe(
    Schedule.jittered,
    Schedule.union(Schedule.spaced('10 seconds')),
)

export function subscribeRpcStream<A>({
    stream,
    onValue,
    onDisconnect,
    restartOnEnd = false,
}: RpcStreamSubscriptionOptions<A>): () => void {
    const controller = new AbortController()
    const attempt = Stream.unwrap(
        Effect.map(AppRpcClientService, (client) =>
            restartOnEnd
                ? stream(client)
                : stream(client).pipe(Stream.concat(Stream.fail(new Error('RPC stream ended.')))),
        ),
    )
    const reconnecting = (
        restartOnEnd ? attempt.pipe(Stream.repeat(Schedule.forever)) : attempt
    ).pipe(
        Stream.tapError((cause) =>
            Effect.sync(() => {
                if (!controller.signal.aborted) onDisconnect?.(cause)
            }),
        ),
        Stream.retry(reconnectSchedule),
        Stream.runForEach((value) => Effect.sync(() => onValue(value))),
    )
    void runtime
        .runPromise(reconnecting, {
            signal: controller.signal,
        })
        .catch((cause: unknown) => {
            if (!controller.signal.aborted) onDisconnect?.(cause)
        })
    return () => controller.abort()
}

export function disposeRpcRuntime() {
    return runtime.dispose()
}

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', (event) => {
        if (!event.persisted) void disposeRpcRuntime()
    })
}

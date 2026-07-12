import { useNavigate } from '@tanstack/react-router'
import { Button } from '@repo/ui/atoms'

import { queryClient } from '../../config/query-client'
import { captureKeys } from '../capture/api/capture-queries'
import { useStartReplayCapture } from '../capture/hooks/use-capture'

export function HomePage() {
    const navigate = useNavigate()
    const replay = useStartReplayCapture()
    const replayEnabled = import.meta.env.DEV && Boolean(import.meta.env.VITE_REPLAY_FILE_ID)

    async function startReplay() {
        try {
            const session = await replay.mutateAsync(import.meta.env.VITE_REPLAY_FILE_ID)
            queryClient.setQueryData(captureKeys.session(session.captureId), session)
            await navigate({ to: '/capture/$captureId', params: { captureId: session.captureId } })
        } catch {
            /* Mutation state renders the failure. */
        }
    }

    return (
        <section className="space-y-4">
            <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
                    Development capture
                </p>
                <h1 className="text-xl font-semibold tracking-tight">Replay a capture</h1>
                <p className="text-muted-foreground max-w-xl text-sm">
                    Start the configured development replay and inspect its capture session.
                </p>
            </div>
            {replayEnabled ? (
                <Button onClick={() => void startReplay()} disabled={replay.isPending}>
                    {replay.isPending ? 'Starting replay...' : 'Start replay'}
                </Button>
            ) : (
                <p className="text-muted-foreground text-sm">
                    No development replay is configured.
                </p>
            )}
            {replay.error ? (
                <p className="text-destructive text-sm">Unable to start replay.</p>
            ) : null}
        </section>
    )
}

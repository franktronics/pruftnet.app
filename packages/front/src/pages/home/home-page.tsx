import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { IdleCaptureWorkspace } from '#front/pages/capture/components/idle-capture-workspace'
import { activeCaptureOptions } from '#front/pages/capture/api/capture-queries'

export function HomePage() {
    const navigate = useNavigate()
    const active = useQuery(activeCaptureOptions())

    useEffect(() => {
        if (!active.data) return
        void navigate({
            to: '/capture/$captureId',
            params: { captureId: active.data.captureId },
            replace: true,
        })
    }, [active.data, navigate])

    return <IdleCaptureWorkspace />
}

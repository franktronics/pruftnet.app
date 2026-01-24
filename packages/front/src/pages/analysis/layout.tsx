import { cn } from '@repo/utils'
import { Outlet } from '@tanstack/react-router'
import { AnalysisProvider } from './context/analysis-context'
import { ReactFlowProvider } from '@repo/ui/organisms'

export const Layout = () => {
    return (
        <AnalysisProvider>
            <ReactFlowProvider>
                <div className={cn('h-full')}>
                    <Outlet />
                </div>
            </ReactFlowProvider>
        </AnalysisProvider>
    )
}

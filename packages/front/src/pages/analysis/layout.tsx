import { cn } from '@repo/utils'
import { Outlet } from '@tanstack/react-router'
import { AnalysisProvider } from './context/analysis-context'

export const Layout = () => {
    return (
        <AnalysisProvider>
            <div className={cn('h-full')}>
                <Outlet />
            </div>
        </AnalysisProvider>
    )
}
